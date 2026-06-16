const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { EC2Client, DescribeInstancesCommand } = require('@aws-sdk/client-ec2');
const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { fromIni } = require('@aws-sdk/credential-providers');

// Load environment variables from SARC .envrc on startup
try {
    const envrcPath = path.join(__dirname, '..', 'SARC', '.envrc');
    if (fs.existsSync(envrcPath)) {
        const content = fs.readFileSync(envrcPath, 'utf8');
        content.split('\n').forEach(line => {
            const clean = line.trim();
            if (clean.startsWith('export ')) {
                const parts = clean.substring(7).split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    let val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, ''); // strip quotes
                    // Expand variables (like $PATH, $JAVA_HOME)
                    val = val.replace(/\$([a-zA-Z0-9_]+)/g, (match, varName) => {
                        return process.env[varName] || '';
                    });
                    process.env[key] = val;
                }
            }
        });
        console.log('Loaded env variables from SARC .envrc');
    }
} catch (e) {
    console.error('Error parsing .envrc for env vars:', e);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Session store in-memory
const sessions = new Map();

// GitHub OAuth configuration
const githubClientId = process.env.GITHUB_OAUTH_CLIENT_ID || null;
const githubClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || null;
const githubHost = process.env.GITHUB_OAUTH_ENTERPRISE_HOST || 'github.com';
const permittedUsers = process.env.PERMITTED_USERS ? process.env.PERMITTED_USERS.split(',').map(u => u.trim().toLowerCase()) : [];

// Simple custom cookie parser middleware
app.use((req, res, next) => {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const parts = cookie.split('=');
            if (parts.length === 2) {
                req.cookies[parts[0].trim()] = decodeURIComponent(parts[1].trim());
            }
        });
    }
    next();
});

// Gating middleware
app.use((req, res, next) => {
    // Whitelist auth endpoints, static assets, and login page
    if (
        req.path === '/login.html' ||
        req.path.startsWith('/api/auth/')
    ) {
        return next();
    }
    
    // Whitelist common static asset paths
    if (
        req.path.includes('/assets/') ||
        req.path.endsWith('.css') ||
        req.path.endsWith('.js') ||
        req.path.endsWith('.png') ||
        req.path.endsWith('.svg') ||
        req.path.endsWith('.ico')
    ) {
        return next();
    }

    const sessionId = req.cookies?.session_id;
    if (sessionId && sessions.has(sessionId)) {
        req.user = sessions.get(sessionId);
        return next();
    }

    res.redirect('/login.html');
});

// Disable caching to prevent browser loading stale/mocked index.html or scripts
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Gating Config API
app.get('/api/auth/config', (req, res) => {
    res.json({
        githubEnabled: !!(githubClientId && githubClientSecret),
        githubHost: githubHost
    });
});

// GitHub OAuth Login Redirect
app.get('/api/auth/github', (req, res) => {
    if (!githubClientId) {
        return res.status(400).send('GitHub Authentication is not configured.');
    }
    const redirectUri = process.env.REDIRECT_URI || `http://localhost:${port}/api/auth/github/callback`;
    const authorizationUrl = `https://${githubHost}/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
    res.redirect(authorizationUrl);
});

// GitHub OAuth Callback
app.get('/api/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/login.html?error=missing_code');
    }
    
    try {
        const tokenUrl = `https://${githubHost}/login/oauth/access_token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: githubClientId,
                client_secret: githubClientSecret,
                code
            })
        });
        
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error('GitHub OAuth token error:', tokenData);
            return res.redirect(`/login.html?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
        }
        
        const accessToken = tokenData.access_token;
        
        // Fetch user info
        const userApiUrl = githubHost === 'github.com' ? 'https://api.github.com/user' : `https://${githubHost}/api/v3/user`;
        const userRes = await fetch(userApiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
                'User-Agent': 'AWS-Dashboard-Auth'
            }
        });
        
        const userData = await userRes.json();
        const username = userData.login;
        
        if (!username) {
            return res.redirect('/login.html?error=unable_to_retrieve_username');
        }
        
        if (permittedUsers.length > 0 && !permittedUsers.includes(username.toLowerCase())) {
            return res.redirect(`/login.html?error=${encodeURIComponent(`Access Denied: User @${username} is not permitted to access this portal.`)}`);
        }
        
        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        sessions.set(sessionId, {
            username,
            provider: 'github',
            details: userData,
            createdAt: Date.now()
        });
        
        res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
        res.redirect('/');
        
    } catch (err) {
        console.error('GitHub OAuth Callback Exception:', err);
        res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
    }
});

// AWS SSO Credentials Verification Login
app.post('/api/auth/aws-sso-verify', (req, res) => {
    exec('aws sts get-caller-identity --profile Synechron', (error, stdout, stderr) => {
        if (error) {
            console.error('AWS STS verification failed:', stderr || error.message);
            return res.status(401).json({
                success: false,
                error: 'AWS credentials are expired or invalid. Please check if "aws sso login --profile Synechron" is active.'
            });
        }
        
        try {
            const stsData = JSON.parse(stdout);
            const arn = stsData.Arn;
            const parts = arn.split('/');
            const username = parts[parts.length - 1] || 'AWS SSO User';
            
            const sessionId = crypto.randomBytes(32).toString('hex');
            sessions.set(sessionId, {
                username,
                provider: 'aws-sso',
                arn,
                account: stsData.Account,
                createdAt: Date.now()
            });
            
            console.log('AWS SSO Verification Succeeded for:', username);
            res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
            res.json({ success: true, username });
        } catch (e) {
            console.error('Failed to parse AWS STS output:', e);
            res.status(500).json({ success: false, error: 'Failed to parse AWS identity data.' });
        }
    });
});

// AWS Configuration using the "Synechron" SSO profile
const awsConfig = {
    credentials: fromIni({ profile: 'Synechron' }),
    region: process.env.AWS_REGION || 'us-east-1'
};

// Endpoint to trigger AWS SSO login locally
app.post('/api/auth/sso', (req, res) => {
    // Run 'aws sso login' which will automatically open the browser
    exec('aws sso login --profile Synechron', (error, stdout, stderr) => {
        if (error) {
            console.error('Error executing aws sso login:', error);
            return res.status(500).json({ success: false, error: stderr || error.message });
        }
        res.json({ success: true, message: 'SSO Login completed. Please wait a moment for the credentials cache to update.' });
    });
});

// Endpoint to read PAT tokens from SARC .envrc
app.get('/api/config/tokens', (req, res) => {
    let tokens = { github: null, gitlab: null, instance_url: 'https://gitlab.com' };
    try {
        const envrcPath = path.join(__dirname, '..', 'SARC', '.envrc');
        if (fs.existsSync(envrcPath)) {
            const content = fs.readFileSync(envrcPath, 'utf8');
            content.split('\n').forEach(line => {
                const cleanValue = (val) => val ? val.trim().replace(/['"\r\n]/g, '') : null;
                if (line.startsWith('export GITLAB_TOKEN=')) tokens.gitlab = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_PAT=')) tokens.gitlab = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_TOKEN=')) tokens.github = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_PAT=')) tokens.github = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_URL=')) tokens.instance_url = cleanValue(line.split('=')[1]);
            });
        }
        // Fallback to process.env (also sanitize just in case)
        const sanitizeEnv = (val) => val ? val.replace(/[\r\n]/g, '').trim() : null;
        if (!tokens.github) tokens.github = sanitizeEnv(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT);
        if (!tokens.gitlab) tokens.gitlab = sanitizeEnv(process.env.GITLAB_TOKEN || process.env.GITLAB_PAT);
    } catch (e) {
        console.error('Error reading envrc for tokens:', e);
    }
    res.json(tokens);
});

// Endpoint to save PAT tokens into SARC .envrc
app.post('/api/config/tokens', (req, res) => {
    try {
        const { github, gitlab } = req.body;
        const envrcPath = path.join(__dirname, '..', 'SARC', '.envrc');
        
        let lines = [];
        if (fs.existsSync(envrcPath)) {
            lines = fs.readFileSync(envrcPath, 'utf8').split('\n');
        }
        
        // Remove old tokens
        lines = lines.filter(line => !line.startsWith('export GITLAB_TOKEN=') && !line.startsWith('export GITLAB_PAT=') && !line.startsWith('export GITHUB_TOKEN=') && !line.startsWith('export GITHUB_PAT='));
        
        if (github) lines.push(`export GITHUB_PAT="${github}"`);
        if (gitlab) lines.push(`export GITLAB_PAT="${gitlab}"`);
        
        fs.writeFileSync(envrcPath, lines.join('\n').trim() + '\n');
        res.json({ success: true, message: 'Tokens saved to .envrc' });
    } catch (e) {
        console.error('Error writing envrc:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

const ec2Client = new EC2Client(awsConfig);
const cloudtrailClient = new CloudTrailClient(awsConfig);

// Endpoint to get running AWS resources (EC2 instances)
app.get('/api/resources', async (req, res) => {
    try {
        const command = new DescribeInstancesCommand({
            Filters: [
                { Name: 'instance-state-name', Values: ['running'] }
            ]
        });
        const response = await ec2Client.send(command);
        
        const instances = [];
        if (response.Reservations) {
            response.Reservations.forEach(reservation => {
                if (reservation.Instances) {
                    reservation.Instances.forEach(instance => {
                        const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
                        instances.push({
                            id: instance.InstanceId,
                            name: nameTag ? nameTag.Value : 'Unnamed',
                            type: instance.InstanceType,
                            launchTime: instance.LaunchTime,
                            publicIp: instance.PublicIpAddress
                        });
                    });
                }
            });
        }
        res.json({ success: true, count: instances.length, instances });
    } catch (error) {
        console.error('Error fetching EC2 instances:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to get recent user logins from CloudTrail
app.get('/api/logins', async (req, res) => {
    try {
        // Look up ConsoleLogin events for the past 24 hours
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 1); // 1 day ago
        
        const command = new LookupEventsCommand({
            LookupAttributes: [
                { AttributeKey: 'EventName', AttributeValue: 'ConsoleLogin' }
            ],
            StartTime: startTime,
            MaxResults: 50
        });
        
        const response = await cloudtrailClient.send(command);
        
        const logins = [];
        if (response.Events) {
            response.Events.forEach(event => {
                try {
                    const cloudTrailEvent = JSON.parse(event.CloudTrailEvent);
                    const isSuccess = cloudTrailEvent.responseElements?.ConsoleLogin === 'Success';
                    
                    if (isSuccess) {
                        logins.push({
                            username: cloudTrailEvent.userIdentity?.userName || 'Root/Unknown',
                            userType: cloudTrailEvent.userIdentity?.type,
                            time: event.EventTime,
                            sourceIp: event.SourceIpAddress
                        });
                    }
                } catch (e) {
                    console.error("Error parsing event data", e);
                }
            });
        }
        
        res.json({ success: true, count: logins.length, logins });
    } catch (error) {
        console.error('Error fetching CloudTrail logins:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(port, () => {
    console.log(`AWS Dashboard backend running at http://localhost:${port}`);
});
