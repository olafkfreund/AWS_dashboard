const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { 
    EC2Client, 
    DescribeInstancesCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand
} = require('@aws-sdk/client-ec2');
const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { BudgetsClient, DescribeBudgetsCommand } = require('@aws-sdk/client-budgets');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand, DescribeNodegroupCommand } = require('@aws-sdk/client-eks');
const { fromIni } = require('@aws-sdk/credential-providers');
const { SSOClient, GetRoleCredentialsCommand, ListAccountsCommand, ListAccountRolesCommand } = require("@aws-sdk/client-sso");
const { SSOOIDCClient, RegisterClientCommand, StartDeviceAuthorizationCommand, CreateTokenCommand } = require("@aws-sdk/client-sso-oidc");

// Load environment variables from SARC .envrc on startup
try {
    const envrcPath = path.join(__dirname, '..', 'Synechron_ARC', 'sarc', '.envrc');
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
const port = process.env.PORT || 8889;

app.use(cors());
app.use(express.json());

// Session store in-memory
const sessions = new Map();

// GitHub OAuth configuration
let githubClientId = process.env.GITHUB_OAUTH_CLIENT_ID || null;
let githubClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || null;
let githubHost = process.env.GITHUB_OAUTH_ENTERPRISE_HOST || 'github.com';
const permittedUsers = process.env.PERMITTED_USERS ? process.env.PERMITTED_USERS.split(',').map(u => u.trim().toLowerCase()) : [];

// GitLab OAuth configuration
let gitlabClientId = process.env.GITLAB_OAUTH_CLIENT_ID || null;
let gitlabClientSecret = process.env.GITLAB_OAUTH_CLIENT_SECRET || null;
let gitlabHost = process.env.GITLAB_OAUTH_HOST || 'gitlab.com';

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

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, error: 'Unauthorized. Please login.' });
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
    const activeProfile = process.env.AWS_PROFILE || 'Calitii';
    res.json({
        githubEnabled: !!(githubClientId && githubClientSecret),
        githubHost: githubHost,
        gitlabEnabled: !!(gitlabClientId && gitlabClientSecret),
        gitlabHost: gitlabHost,
        awsProfile: activeProfile,
        awsIsSSO: !(activeProfile === 'Calitii' || activeProfile === 'default' || activeProfile.includes('static'))
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
            accessToken,
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

// GitLab OAuth Login Redirect
app.get('/api/auth/gitlab', (req, res) => {
    if (!gitlabClientId) {
        return res.status(400).send('GitLab Authentication is not configured.');
    }
    const redirectUri = process.env.REDIRECT_URI_GITLAB || `http://localhost:${port}/api/auth/gitlab/callback`;
    const authorizationUrl = `https://${gitlabHost}/oauth/authorize?client_id=${gitlabClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=api`;
    res.redirect(authorizationUrl);
});

// GitLab OAuth Callback
app.get('/api/auth/gitlab/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.redirect('/login.html?error=missing_code');
    }
    
    try {
        const redirectUri = process.env.REDIRECT_URI_GITLAB || `http://localhost:${port}/api/auth/gitlab/callback`;
        const tokenUrl = `https://${gitlabHost}/oauth/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: gitlabClientId,
                client_secret: gitlabClientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            })
        });
        
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            console.error('GitLab OAuth token error:', tokenData);
            return res.redirect(`/login.html?error=${encodeURIComponent(tokenData.error_description || tokenData.error)}`);
        }
        
        const accessToken = tokenData.access_token;
        
        // Fetch user info
        const userApiUrl = `https://${gitlabHost}/api/v4/user`;
        const userRes = await fetch(userApiUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });
        
        const userData = await userRes.json();
        const username = userData.username;
        
        if (!username) {
            return res.redirect('/login.html?error=unable_to_retrieve_username');
        }
        
        // Create session
        const sessionId = crypto.randomBytes(32).toString('hex');
        sessions.set(sessionId, {
            username,
            provider: 'gitlab',
            accessToken,
            details: userData,
            createdAt: Date.now()
        });
        
        res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
        res.redirect('/');
        
    } catch (err) {
        console.error('GitLab OAuth Callback Exception:', err);
        res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
    }
});

// AWS SSO Credentials Verification Login
app.post('/api/auth/aws-sso-verify', (req, res) => {
    const activeProfile = process.env.AWS_PROFILE || 'Synechron';
    exec(`aws sts get-caller-identity --profile ${activeProfile}`, (error, stdout, stderr) => {
        if (error) {
            console.error('AWS STS verification failed:', stderr || error.message);
            // If the profile is Calitii or contains static keys, we shouldn't recommend SSO login
            const ssoMsg = (activeProfile === 'Calitii' || activeProfile === 'default')
                ? `Please check your static keys in ~/.aws/credentials under [${activeProfile}].`
                : `Please check if your credentials in ~/.aws/credentials under [${activeProfile}] are active, or run "aws sso login --profile ${activeProfile}".`;
            return res.status(401).json({
                success: false,
                error: `AWS credentials for profile "${activeProfile}" are expired or invalid. ${ssoMsg}`
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

// AWS Configuration using the dynamic profile
const awsProfile = process.env.AWS_PROFILE || 'Synechron';

// Clean up any explicit environment credentials loaded from SARC .envrc
// to ensure the SDK uses the named profile credentials from ~/.aws instead.
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_SESSION_TOKEN;

const awsConfig = {
    credentials: fromIni({ profile: awsProfile }),
    region: process.env.AWS_REGION || 'eu-west-2'
};

// In-memory OIDC client registration cache
let oidcClientCache = null;

// Get SSO OIDC config
const getSSOConfig = () => {
    return {
        startUrl: process.env.AWS_SSO_START_URL || 'https://identitycenter.amazonaws.com/ssoins-1808feddfa6b342f',
        ssoRegion: process.env.AWS_SSO_REGION || 'us-east-1',
        accountId: process.env.AWS_SSO_ACCOUNT_ID || '796973489124',
        roleName: process.env.AWS_SSO_ROLE_NAME || 'AWSEnterpriseAgilityAdmin'
    };
};

async function getOIDCClient(ssoRegion) {
    if (oidcClientCache && oidcClientCache.ssoRegion === ssoRegion && oidcClientCache.expiresAt > Date.now()) {
        return oidcClientCache;
    }

    const oidcClient = new SSOOIDCClient({ region: ssoRegion });
    const registerCommand = new RegisterClientCommand({
        clientName: "AWS-Dashboard-Proxy",
        clientType: "public",
        scopes: ["sso:account:access"]
    });

    const response = await oidcClient.send(registerCommand);
    
    oidcClientCache = {
        ssoRegion,
        clientId: response.clientId,
        clientSecret: response.clientSecret,
        expiresAt: response.clientSecretExpiresAt * 1000 || (Date.now() + 24 * 3600 * 1000)
    };

    return oidcClientCache;
}

// Endpoint to start direct AWS SSO browser authentication
app.post('/api/auth/sso', async (req, res) => {
    try {
        const config = getSSOConfig();
        const clientInfo = await getOIDCClient(config.ssoRegion);
        
        const oidcClient = new SSOOIDCClient({ region: config.ssoRegion });
        const authCommand = new StartDeviceAuthorizationCommand({
            clientId: clientInfo.clientId,
            clientSecret: clientInfo.clientSecret,
            startUrl: config.startUrl,
            scopes: ["sso:account:access"]
        });

        const response = await oidcClient.send(authCommand);
        
        res.json({
            success: true,
            deviceCode: response.deviceCode,
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            verificationUriComplete: response.verificationUriComplete
        });
    } catch (error) {
        console.error("Failed to start SSO device auth:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to poll AWS SSO OIDC for the token and get temporary credentials
app.post('/api/auth/sso/poll', async (req, res) => {
    const { deviceCode } = req.body;
    if (!deviceCode) {
        return res.status(400).json({ success: false, error: "Missing deviceCode" });
    }

    try {
        const config = getSSOConfig();
        const clientInfo = await getOIDCClient(config.ssoRegion);
        const oidcClient = new SSOOIDCClient({ region: config.ssoRegion });

        const tokenCommand = new CreateTokenCommand({
            clientId: clientInfo.clientId,
            clientSecret: clientInfo.clientSecret,
            grantType: "urn:ietf:params:oauth:grant-type:device_code",
            deviceCode: deviceCode
        });

        let tokenResponse;
        try {
            tokenResponse = await oidcClient.send(tokenCommand);
        } catch (tokenError) {
            const errName = tokenError.name || tokenError.__type || "";
            if (errName === "AuthorizationPendingException" || tokenError.message?.includes("pending")) {
                return res.json({ success: true, status: 'pending' });
            }
            if (errName === "SlowDownException" || tokenError.message?.toLowerCase().includes("slow")) {
                return res.json({ success: true, status: 'pending' });
            }
            return res.json({ success: true, status: 'error', error: tokenError.message || tokenError.name });
        }

        const accessToken = tokenResponse.accessToken;
        
        try {
            // Use access token to fetch temporary credentials
            const ssoClient = new SSOClient({ region: config.ssoRegion });
            
            console.log(`OIDC accessToken successfully retrieved (length: ${accessToken.length})`);
            
            // Diagnostic: List accounts and roles available to this token
            try {
                const listAccountsCommand = new ListAccountsCommand({ accessToken });
                const accountsResponse = await ssoClient.send(listAccountsCommand);
                console.log("SSO Diagnostics - Available Accounts:", JSON.stringify(accountsResponse.accountList, null, 2));
                
                const hasTargetAccount = accountsResponse.accountList?.some(a => a.accountId === config.accountId);
                if (hasTargetAccount) {
                    const listRolesCommand = new ListAccountRolesCommand({
                        accessToken,
                        accountId: config.accountId
                    });
                    const rolesResponse = await ssoClient.send(listRolesCommand);
                    console.log(`SSO Diagnostics - Available Roles for Account ${config.accountId}:`, JSON.stringify(rolesResponse.roleList, null, 2));
                } else {
                    console.warn(`SSO Diagnostics WARNING: Target account ID ${config.accountId} is NOT in the user's assigned accounts list!`);
                }
            } catch (listError) {
                console.error("SSO Diagnostics - Failed to list accounts/roles:", listError);
            }

            const credentialsCommand = new GetRoleCredentialsCommand({
                accessToken,
                accountId: config.accountId,
                roleName: config.roleName
            });

            const credentialsResponse = await ssoClient.send(credentialsCommand);
            const creds = credentialsResponse.roleCredentials;

            // Save credentials in a user session
            const sessionId = crypto.randomBytes(32).toString('hex');
            const username = `SSO:${config.roleName}`;
            
            sessions.set(sessionId, {
                username,
                provider: 'aws-sso-direct',
                credentials: {
                    accessKeyId: creds.accessKeyId,
                    secretAccessKey: creds.secretAccessKey,
                    sessionToken: creds.sessionToken,
                    expiration: creds.expiration
                },
                createdAt: Date.now()
            });

            console.log(`AWS SSO Direct Verification Succeeded for ${username}`);
            
            res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
            res.json({ success: true, status: 'approved', username });
        } catch (credError) {
            console.error("Failed to fetch AWS SSO role credentials:", credError);
            res.json({ success: true, status: 'error', error: `Failed to fetch role credentials: ${credError.message}` });
        }
    } catch (error) {
        console.error("Error in SSO polling/credentials fetch:", error);
        res.json({ success: true, status: 'error', error: error.message });
    }
});

// Endpoint to read PAT tokens from SARC .envrc
app.get('/api/config/tokens', (req, res) => {
    let tokens = { 
        github: null, 
        gitlab: null, 
        instance_url: 'https://gitlab.com',
        github_client_id: null,
        github_client_secret: null,
        gitlab_client_id: null,
        gitlab_client_secret: null
    };
    
    // Inject session tokens if authenticated via OAuth
    if (req.user) {
        if (req.user.provider === 'github' && req.user.accessToken) {
            tokens.github = req.user.accessToken;
        }
        if (req.user.provider === 'gitlab' && req.user.accessToken) {
            tokens.gitlab = req.user.accessToken;
            tokens.instance_url = `https://${gitlabHost}`;
        }
    }

    try {
        const envrcPath = path.join(__dirname, '..', 'Synechron_ARC', 'sarc', '.envrc');
        if (fs.existsSync(envrcPath)) {
            const content = fs.readFileSync(envrcPath, 'utf8');
            let github_token = null;
            let synechron_github_token = null;
            let github_pat = null;
            let gitlab_token = null;
            let gitlab_pat = null;
            let gitlab_url = null;
            let gh_client_id = null;
            let gh_client_secret = null;
            let gl_client_id = null;
            let gl_client_secret = null;

            content.split('\n').forEach(line => {
                const cleanValue = (val) => val ? val.trim().replace(/['"\r\n]/g, '') : null;
                if (line.startsWith('export GITLAB_TOKEN=')) gitlab_token = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_PAT=')) gitlab_pat = cleanValue(line.split('=')[1]);
                if (line.startsWith('export SYNECHRON_GITHUB_TOKEN=')) synechron_github_token = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_TOKEN=')) github_token = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_PAT=')) github_pat = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_URL=')) gitlab_url = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_OAUTH_CLIENT_ID=')) gh_client_id = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITHUB_OAUTH_CLIENT_SECRET=')) gh_client_secret = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_OAUTH_CLIENT_ID=')) gl_client_id = cleanValue(line.split('=')[1]);
                if (line.startsWith('export GITLAB_OAUTH_CLIENT_SECRET=')) gl_client_secret = cleanValue(line.split('=')[1]);
            });

            tokens.github = synechron_github_token || github_token || github_pat;
            tokens.gitlab = gitlab_token || gitlab_pat;
            if (gitlab_url) tokens.instance_url = gitlab_url;
            tokens.github_client_id = gh_client_id;
            tokens.github_client_secret = gh_client_secret;
            tokens.gitlab_client_id = gl_client_id;
            tokens.gitlab_client_secret = gl_client_secret;
        }
        // Fallback to process.env (also sanitize just in case)
        const sanitizeEnv = (val) => val ? val.replace(/[\r\n]/g, '').trim() : null;
        if (!tokens.github) tokens.github = sanitizeEnv(process.env.SYNECHRON_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT);
        if (!tokens.gitlab) tokens.gitlab = sanitizeEnv(process.env.GITLAB_TOKEN || process.env.GITLAB_PAT);
        if (!tokens.github_client_id) tokens.github_client_id = sanitizeEnv(process.env.GITHUB_OAUTH_CLIENT_ID);
        if (!tokens.github_client_secret) tokens.github_client_secret = sanitizeEnv(process.env.GITHUB_OAUTH_CLIENT_SECRET);
        if (!tokens.gitlab_client_id) tokens.gitlab_client_id = sanitizeEnv(process.env.GITLAB_OAUTH_CLIENT_ID);
        if (!tokens.gitlab_client_secret) tokens.gitlab_client_secret = sanitizeEnv(process.env.GITLAB_OAUTH_CLIENT_SECRET);
    } catch (e) {
        console.error('Error reading envrc for tokens:', e);
    }
    res.json(tokens);
});

// Endpoint to save PAT tokens into SARC .envrc
app.post('/api/config/tokens', (req, res) => {
    try {
        const { github, gitlab, instance_url, github_client_id, github_client_secret, gitlab_client_id, gitlab_client_secret } = req.body;
        const envrcPath = path.join(__dirname, '..', 'Synechron_ARC', 'sarc', '.envrc');
        
        let lines = [];
        if (fs.existsSync(envrcPath)) {
            lines = fs.readFileSync(envrcPath, 'utf8').split('\n');
        }
        
        // Remove old tokens and OAuth variables
        lines = lines.filter(line => 
            !line.startsWith('export GITLAB_TOKEN=') && 
            !line.startsWith('export GITLAB_PAT=') && 
            !line.startsWith('export GITHUB_TOKEN=') && 
            !line.startsWith('export GITHUB_PAT=') && 
            !line.startsWith('export SYNECHRON_GITHUB_TOKEN=') &&
            !line.startsWith('export GITLAB_URL=') &&
            !line.startsWith('export GITHUB_OAUTH_CLIENT_ID=') &&
            !line.startsWith('export GITHUB_OAUTH_CLIENT_SECRET=') &&
            !line.startsWith('export GITLAB_OAUTH_CLIENT_ID=') &&
            !line.startsWith('export GITLAB_OAUTH_CLIENT_SECRET=')
        );
        
        if (github) lines.push(`export SYNECHRON_GITHUB_TOKEN="${github}"`);
        if (gitlab) lines.push(`export GITLAB_PAT="${gitlab}"`);
        if (instance_url) lines.push(`export GITLAB_URL="${instance_url}"`);
        if (github_client_id) lines.push(`export GITHUB_OAUTH_CLIENT_ID="${github_client_id}"`);
        if (github_client_secret) lines.push(`export GITHUB_OAUTH_CLIENT_SECRET="${github_client_secret}"`);
        if (gitlab_client_id) lines.push(`export GITLAB_OAUTH_CLIENT_ID="${gitlab_client_id}"`);
        if (gitlab_client_secret) lines.push(`export GITLAB_OAUTH_CLIENT_SECRET="${gitlab_client_secret}"`);
        
        fs.writeFileSync(envrcPath, lines.join('\n').trim() + '\n');
        
        // Dynamically apply changes in-memory
        process.env.SYNECHRON_GITHUB_TOKEN = github || '';
        process.env.GITLAB_PAT = gitlab || '';
        if (instance_url) {
            process.env.GITLAB_URL = instance_url;
            try {
                const url = new URL(instance_url);
                gitlabHost = url.hostname;
            } catch(e) {}
        } else {
            process.env.GITLAB_URL = '';
            gitlabHost = 'gitlab.com';
        }
        
        process.env.GITHUB_OAUTH_CLIENT_ID = github_client_id || '';
        githubClientId = github_client_id || null;
        
        process.env.GITHUB_OAUTH_CLIENT_SECRET = github_client_secret || '';
        githubClientSecret = github_client_secret || null;
        
        process.env.GITLAB_OAUTH_CLIENT_ID = gitlab_client_id || '';
        gitlabClientId = gitlab_client_id || null;
        
        process.env.GITLAB_OAUTH_CLIENT_SECRET = gitlab_client_secret || '';
        gitlabClientSecret = gitlab_client_secret || null;

        res.json({ success: true, message: 'Settings saved to .envrc and applied in-memory' });
    } catch (e) {
        console.error('Error writing envrc:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// AWS EKS Status Endpoint - lists all EKS clusters, node groups, and cost estimates
app.get('/api/eks/status', async (req, res) => {
    try {
        const { eks } = getAwsClients(req);
        const listRes = await eks.send(new ListClustersCommand({}));
        const clusterNames = listRes.clusters || [];

        if (clusterNames.length === 0) {
            return res.json({ success: true, clusters: [], message: 'No EKS clusters found in this region.' });
        }

        const clusters = await Promise.all(clusterNames.map(async (name) => {
            try {
                const [descRes, ngListRes] = await Promise.all([
                    eks.send(new DescribeClusterCommand({ name })),
                    eks.send(new ListNodegroupsCommand({ clusterName: name })).catch(() => ({ nodegroups: [] }))
                ]);
                const cluster = descRes.cluster;
                const ngNames = ngListRes.nodegroups || [];

                const nodeGroups = await Promise.all(ngNames.map(ng =>
                    eks.send(new DescribeNodegroupCommand({ clusterName: name, nodegroupName: ng }))
                        .then(r => {
                            const instanceType = r.nodegroup.instanceTypes?.[0] || 't3.medium';
                            const desired = r.nodegroup.scalingConfig?.desiredSize ?? 0;
                            const costInfo = getEc2CostEstimate(instanceType);
                            const nodeGroupMonthlyCost = parseFloat(costInfo.monthlyEstimate) * desired;
                            return {
                                name: r.nodegroup.nodegroupName,
                                status: r.nodegroup.status,
                                instanceType,
                                desired,
                                min: r.nodegroup.scalingConfig?.minSize ?? 0,
                                max: r.nodegroup.scalingConfig?.maxSize ?? 0,
                                amiType: r.nodegroup.amiType || 'AL2_x86_64',
                                createdAt: r.nodegroup.createdAt,
                                hourlyCostPerNode: parseFloat(costInfo.hourlyRate || 0),
                                monthlyCost: nodeGroupMonthlyCost.toFixed(2)
                            };
                        })
                        .catch(() => null)
                ));

                const validNGs = nodeGroups.filter(Boolean);
                const nodeGroupTotal = validNGs.reduce((s, ng) => s + parseFloat(ng.monthlyCost || 0), 0);
                // EKS control plane = $0.10/h = ~$73/month per cluster
                const controlPlaneCost = 73.00;
                const totalMonthlyCost = (nodeGroupTotal + controlPlaneCost).toFixed(2);

                return {
                    name: cluster.name,
                    status: cluster.status,
                    version: cluster.version,
                    endpoint: cluster.endpoint || null,
                    region: cluster.arn?.split(':')[3] || process.env.AWS_REGION || 'eu-west-2',
                    roleArn: cluster.roleArn,
                    createdAt: cluster.createdAt,
                    tags: cluster.tags || {},
                    nodeGroups: validNGs,
                    nodeGroupMonthlyCost: nodeGroupTotal.toFixed(2),
                    controlPlaneMonthlyCost: controlPlaneCost.toFixed(2),
                    totalMonthlyCost
                };
            } catch (e) {
                console.error('Error describing EKS cluster', name, e.message);
                return null;
            }
        }));

        res.json({ success: true, clusters: clusters.filter(Boolean) });
    } catch (error) {
        console.error('EKS status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

const ec2Client = new EC2Client(awsConfig);
const cloudtrailClient = new CloudTrailClient(awsConfig);
const ceClient = new CostExplorerClient(awsConfig);
const bgClient = new BudgetsClient(awsConfig);
const s3Client = new S3Client(awsConfig);
const eksClient = new EKSClient(awsConfig);


// Helper to get dynamic AWS Clients based on user SSO session
function getAwsClients(req) {
    if (req.user && req.user.credentials) {
        const creds = req.user.credentials;
        if (creds.expiration > Date.now()) {
            const config = {
                credentials: {
                    accessKeyId: creds.accessKeyId,
                    secretAccessKey: creds.secretAccessKey,
                    sessionToken: creds.sessionToken
                },
                region: process.env.AWS_REGION || 'eu-west-2'
            };
            return {
                ec2: new EC2Client(config),
                cloudtrail: new CloudTrailClient(config),
                costexplorer: new CostExplorerClient(config),
                budgets: new BudgetsClient(config),
                s3: new S3Client(config),
                eks: new EKSClient(config)
            };
        }
    }
    return {
        ec2: ec2Client,
        cloudtrail: cloudtrailClient,
        costexplorer: ceClient,
        budgets: bgClient,
        s3: s3Client,
        eks: eksClient
    };
}

const getEc2CostEstimate = (instanceType) => {
    const rates = {
        't2.nano': 0.0058,
        't2.micro': 0.0116,
        't2.small': 0.023,
        't2.medium': 0.0464,
        't2.large': 0.0928,
        't3.nano': 0.0052,
        't3.micro': 0.0104,
        't3.small': 0.0208,
        't3.medium': 0.0416,
        't3.large': 0.0832,
        'm5.large': 0.096,
        'm5.xlarge': 0.192,
        'c5.large': 0.085,
        'r5.large': 0.126
    };
    const rate = rates[instanceType] || 0.015; // default rate
    return {
        hourlyRate: rate,
        monthlyEstimate: (rate * 730).toFixed(2),
        lastMonthUsage: "720 hours (100% active)",
        lastMonthCost: (rate * 720).toFixed(2)
    };
};

const getS3CostEstimate = (bucketName) => {
    return {
        monthlyEstimate: "1.50",
        lastMonthUsage: "5.2 GB-Month, 12,500 Requests",
        lastMonthCost: "0.18"
    };
};

// Endpoint to get all AWS resources (EC2 instances, S3 buckets, VPCs, Subnets, Security Groups)
app.get('/api/resources', async (req, res) => {
    try {
        const { ec2, s3, eks } = getAwsClients(req);
        const resources = [];
        
        // 1. Fetch EC2 instances (all states)
        try {
            const command = new DescribeInstancesCommand({});
            const response = await ec2.send(command);
            if (response.Reservations) {
                response.Reservations.forEach(reservation => {
                    if (reservation.Instances) {
                        reservation.Instances.forEach(instance => {
                            const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
                            const type = instance.InstanceType;
                            const cost = getEc2CostEstimate(type);
                            const stateName = instance.State?.Name || 'running';
                            resources.push({
                                id: instance.InstanceId,
                                name: nameTag ? nameTag.Value : 'Unnamed EC2',
                                type: type,
                                service: 'EC2',
                                state: stateName,
                                launchTime: instance.LaunchTime,
                                publicIp: instance.PublicIpAddress || 'Private Only',
                                costEstimate: stateName === 'running' ? cost.monthlyEstimate : '0.00',
                                lastMonthUsage: cost.lastMonthUsage,
                                lastMonthCost: cost.lastMonthCost
                            });
                        });
                    }
                });
            }
        } catch (ec2Err) {
            console.error('Error fetching EC2 instances:', ec2Err);
        }

        // 2. Fetch S3 buckets
        try {
            const s3Command = new ListBucketsCommand({});
            const s3Response = await s3.send(s3Command);
            if (s3Response.Buckets) {
                s3Response.Buckets.forEach(bucket => {
                    const cost = getS3CostEstimate(bucket.Name);
                    resources.push({
                        id: bucket.Name,
                        name: bucket.Name,
                        type: 'Standard S3 Bucket',
                        service: 'S3',
                        state: 'running',
                        launchTime: bucket.CreationDate,
                        publicIp: 'N/A (Object Storage)',
                        costEstimate: cost.monthlyEstimate,
                        lastMonthUsage: cost.lastMonthUsage,
                        lastMonthCost: cost.lastMonthCost
                    });
                });
            }
        } catch (s3Err) {
            console.error('Error fetching S3 buckets:', s3Err);
        }

        // 3. Fetch VPCs
        try {
            const vpcCommand = new DescribeVpcsCommand({});
            const vpcResponse = await ec2.send(vpcCommand);
            if (vpcResponse.Vpcs) {
                vpcResponse.Vpcs.forEach(vpc => {
                    const nameTag = vpc.Tags?.find(tag => tag.Key === 'Name');
                    resources.push({
                        id: vpc.VpcId,
                        name: nameTag ? nameTag.Value : 'Unnamed VPC',
                        type: vpc.CidrBlock,
                        service: 'VPC',
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Virtual Network)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00'
                    });
                });
            }
        } catch (vpcErr) {
            console.error('Error fetching VPCs:', vpcErr);
        }

        // 4. Fetch Subnets
        try {
            const subnetCommand = new DescribeSubnetsCommand({});
            const subnetResponse = await ec2.send(subnetCommand);
            if (subnetResponse.Subnets) {
                subnetResponse.Subnets.forEach(subnet => {
                    const nameTag = subnet.Tags?.find(tag => tag.Key === 'Name');
                    resources.push({
                        id: subnet.SubnetId,
                        name: nameTag ? nameTag.Value : 'Unnamed Subnet',
                        type: `${subnet.CidrBlock} (${subnet.AvailabilityZone})`,
                        service: 'Subnet',
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Network Subnet)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00'
                    });
                });
            }
        } catch (subnetErr) {
            console.error('Error fetching Subnets:', subnetErr);
        }

        // 5. Fetch Security Groups
        try {
            const sgCommand = new DescribeSecurityGroupsCommand({});
            const sgResponse = await ec2.send(sgCommand);
            if (sgResponse.SecurityGroups) {
                sgResponse.SecurityGroups.forEach(sg => {
                    const nameTag = sg.Tags?.find(tag => tag.Key === 'Name');
                    resources.push({
                        id: sg.GroupId,
                        name: nameTag ? nameTag.Value : sg.GroupName,
                        type: sg.Description || 'Security Group',
                        service: 'SecurityGroup',
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Firewall Rules)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00'
                    });
                });
            }
        } catch (sgErr) {
            console.error('Error fetching Security Groups:', sgErr);
        }

        // 6. Fetch EKS Clusters
        try {
            const eksListRes = await eks.send(new ListClustersCommand({}));
            const clusterNames = eksListRes.clusters || [];
            await Promise.all(clusterNames.map(async (clusterName) => {
                try {
                    const descRes = await eks.send(new DescribeClusterCommand({ name: clusterName }));
                    const cluster = descRes.cluster;

                    // Fetch node groups for cost estimation
                    let nodeGroupCostTotal = 0;
                    let nodeGroupSummary = 'No node groups';
                    try {
                        const ngListRes = await eks.send(new ListNodegroupsCommand({ clusterName }));
                        const ngNames = ngListRes.nodegroups || [];
                        const ngDetails = await Promise.all(ngNames.map(ng =>
                            eks.send(new DescribeNodegroupCommand({ clusterName, nodegroupName: ng })).catch(() => null)
                        ));
                        const validNGs = ngDetails.filter(Boolean).map(r => r.nodegroup);
                        nodeGroupCostTotal = validNGs.reduce((sum, ng) => {
                            const desired = ng.scalingConfig?.desiredSize || 0;
                            const cost = getEc2CostEstimate(ng.instanceTypes?.[0] || 't3.medium');
                            return sum + (parseFloat(cost.monthlyEstimate) * desired);
                        }, 0);
                        nodeGroupSummary = validNGs.length > 0
                            ? validNGs.map(ng => `${ng.nodegroupName} (${ng.scalingConfig?.desiredSize || 0}×${ng.instanceTypes?.[0] || 'unknown'})`).join(', ')
                            : 'No node groups';
                    } catch (ngErr) {
                        console.error('Error fetching node groups for', clusterName, ngErr.message);
                    }

                    resources.push({
                        id: cluster.name,
                        name: cluster.name,
                        type: `EKS ${cluster.version} • ${nodeGroupSummary}`,
                        service: 'EKS',
                        state: cluster.status === 'ACTIVE' ? 'running' : cluster.status.toLowerCase(),
                        launchTime: cluster.createdAt,
                        publicIp: cluster.endpoint ? cluster.endpoint.replace('https://', '') : 'Private Endpoint',
                        costEstimate: nodeGroupCostTotal.toFixed(2),
                        lastMonthUsage: nodeGroupSummary,
                        lastMonthCost: nodeGroupCostTotal.toFixed(2),
                        region: cluster.arn?.split(':')[3] || 'eu-west-2'
                    });
                } catch (descErr) {
                    console.error('Error describing EKS cluster', clusterName, descErr.message);
                }
            }));
        } catch (eksErr) {
            console.error('Error fetching EKS clusters:', eksErr.message);
        }

        res.json({ success: true, count: resources.length, instances: resources });

    } catch (error) {
        console.error('Error in resources endpoint:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to get recent user logins from CloudTrail
app.get('/api/logins', async (req, res) => {
    try {
        const { cloudtrail } = getAwsClients(req);
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
        
        const response = await cloudtrail.send(command);
        
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

const getCostDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const start = `${year}-${month}-01`;
    
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const endYear = tomorrow.getFullYear();
    const endMonth = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const endDay = String(tomorrow.getDate()).padStart(2, '0');
    const end = `${endYear}-${endMonth}-${endDay}`;
    return { start, end };
};

// Endpoint to get AWS spending & budget details
app.get('/api/spending', async (req, res) => {
    let costData = { amount: "128.50", currency: "USD", isMock: true };
    let budgetData = { limit: "200.00", spent: "128.50", currency: "USD", isMock: true, name: "Monthly AWS Budget" };
    let errorLog = [];

    const dynamicClients = getAwsClients(req);
    const { costexplorer, budgets } = dynamicClients;

    // 1. Fetch Cost explorer data
    try {
        const { start, end } = getCostDates();
        const ceCommand = new GetCostAndUsageCommand({
            TimePeriod: { Start: start, End: end },
            Granularity: 'MONTHLY',
            Metrics: ['UnblendedCost']
        });
        const ceResponse = await costexplorer.send(ceCommand);
        if (ceResponse.ResultsByTime && ceResponse.ResultsByTime.length > 0) {
            const amount = ceResponse.ResultsByTime[0].Total?.UnblendedCost?.Amount;
            const unit = ceResponse.ResultsByTime[0].Total?.UnblendedCost?.Unit;
            if (amount !== undefined) {
                costData = {
                    amount: parseFloat(amount).toFixed(2),
                    currency: unit || 'USD',
                    isMock: false
                };
            }
        }
    } catch (err) {
        console.error("Cost Explorer query failed (using mock data):", err.message);
        errorLog.push(`CE: ${err.message}`);
    }

    // 2. Fetch Budgets
    try {
        const config = getSSOConfig();
        const accountId = config.accountId || process.env.AWS_ACCOUNT_ID;
        if (accountId) {
            const budgetCommand = new DescribeBudgetsCommand({ AccountId: accountId });
            const bgResponse = await budgets.send(budgetCommand);
            if (bgResponse.Budgets && bgResponse.Budgets.length > 0) {
                const primaryBudget = bgResponse.Budgets[0];
                budgetData = {
                    name: primaryBudget.BudgetName,
                    limit: parseFloat(primaryBudget.BudgetLimit?.Amount || 0).toFixed(2),
                    spent: parseFloat(primaryBudget.CalculatedSpend?.ActualSpend?.Amount || 0).toFixed(2),
                    currency: primaryBudget.BudgetLimit?.Unit || 'USD',
                    isMock: false
                };
            } else {
                budgetData = null; // No budget configured in AWS
            }
        } else {
            errorLog.push("Budgets: Missing accountId for query");
        }
    } catch (err) {
        console.error("Budgets query failed (using mock data):", err.message);
        errorLog.push(`Budgets: ${err.message}`);
    }

    res.json({
        success: true,
        cost: costData,
        budget: budgetData,
        errors: errorLog.length > 0 ? errorLog : null
    });
});

app.listen(port, () => {
    console.log(`AWS Dashboard backend running at http://localhost:${port}`);
    try {
        fs.writeFileSync(path.join(__dirname, '.server.pid'), process.pid.toString());
    } catch (e) {
        console.error("Failed to write .server.pid:", e);
    }
});
