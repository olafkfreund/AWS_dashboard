const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand, DescribeNodegroupCommand } = require('@aws-sdk/client-eks');
const { LambdaClient, ListFunctionsCommand, GetFunctionUrlConfigCommand } = require('@aws-sdk/client-lambda');
const { CloudFormationClient, ListStacksCommand: ListCFNStacksCommand } = require('@aws-sdk/client-cloudformation');
const {
    EC2Client,
    DescribeInstancesCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand,
    DescribeNatGatewaysCommand,
    DescribeInternetGatewaysCommand,
    DescribeAddressesCommand,
    DescribeVolumesCommand,
} = require('@aws-sdk/client-ec2');

const { CloudTrailClient, LookupEventsCommand } = require('@aws-sdk/client-cloudtrail');
const { CostExplorerClient, GetCostAndUsageCommand } = require('@aws-sdk/client-cost-explorer');
const { BudgetsClient, DescribeBudgetsCommand } = require('@aws-sdk/client-budgets');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');
const { IAMClient, ListRolesCommand, ListUsersCommand, ListPoliciesCommand, ListGroupsCommand } = require('@aws-sdk/client-iam');
const { RDSClient, DescribeDBInstancesCommand, DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { ECRClient, DescribeRepositoriesCommand } = require('@aws-sdk/client-ecr');
const { SNSClient, ListTopicsCommand } = require('@aws-sdk/client-sns');
const { SQSClient, ListQueuesCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { SecretsManagerClient, ListSecretsCommand, GetSecretValueCommand, CreateSecretCommand, UpdateSecretCommand } = require('@aws-sdk/client-secrets-manager');
const { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand, DescribeTargetGroupsCommand } = require('@aws-sdk/client-elastic-load-balancing-v2');
const { AutoScalingClient, DescribeAutoScalingGroupsCommand } = require('@aws-sdk/client-auto-scaling');
const { CloudWatchClient, DescribeAlarmsCommand } = require('@aws-sdk/client-cloudwatch');
const { Route53Client, ListHostedZonesCommand, ListResourceRecordSetsCommand } = require('@aws-sdk/client-route-53');
const { SSMClient, DescribeParametersCommand } = require('@aws-sdk/client-ssm');
const { fromIni, fromSSO } = require('@aws-sdk/credential-providers');
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

// ── Session store — file-backed so restarts don't log users out ──────────────
const SESSIONS_FILE = path.join(__dirname, '.sessions.json');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

let sessions = new Map();

function loadSessions() {
    try {
        if (fs.existsSync(SESSIONS_FILE)) {
            const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
            const obj = JSON.parse(raw);
            const now = Date.now();
            sessions = new Map(
                Object.entries(obj).filter(([, v]) => (now - v.createdAt) < SESSION_TTL_MS)
            );
            console.log(`Loaded ${sessions.size} active session(s) from disk.`);
        }
    } catch (e) { console.error('Failed to load sessions:', e.message); }
}

function saveSessions() {
    try {
        const now = Date.now();
        const obj = {};
        sessions.forEach((v, k) => {
            if ((now - v.createdAt) < SESSION_TTL_MS) obj[k] = v;
        });
        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) { console.error('Failed to save sessions:', e.message); }
}

loadSessions();

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
    const activeProfile = process.env.AWS_PROFILE || 'Synechron';
    res.json({
        githubEnabled: !!(githubClientId && githubClientSecret),
        githubHost: githubHost,
        gitlabEnabled: !!(gitlabClientId && gitlabClientSecret),
        gitlabHost: gitlabHost,
        awsProfile: activeProfile,
        awsIsSSO: !(activeProfile === 'Calitii' || activeProfile === 'default' || activeProfile.includes('static')),
        awsCredentialsExpired
    });
});

// Check live AWS credential validity + expiry time
app.get('/api/auth/token-status', async (req, res) => {
    try {
        const credProvider = makeAwsCredentials(awsProfile);
        const creds = await credProvider();
        const expiry = creds.expiration ? new Date(creds.expiration) : null;
        const msLeft = expiry ? expiry.getTime() - Date.now() : null;
        awsCredentialsExpired = false;
        res.json({
            valid: true,
            profile: awsProfile,
            expiry: expiry ? expiry.toISOString() : null,
            minutesLeft: msLeft ? Math.floor(msLeft / 60000) : null,
            willExpireSoon: msLeft ? msLeft < 30 * 60 * 1000 : false // < 30 min
        });
    } catch (e) {
        awsCredentialsExpired = true;
        res.json({
            valid: false,
            profile: awsProfile,
            error: e.message,
            expiry: null,
            minutesLeft: null
        });
    }
});

// Trigger aws sso login for the active profile (opens browser on the server machine)
app.post('/api/auth/sso-refresh', (req, res) => {
    const profile = awsProfile;
    console.log(`[sso-refresh] Triggering: aws sso login --profile ${profile}`);
    // Non-blocking: run in background, frontend polls /api/auth/token-status
    exec(`aws sso login --profile ${profile} --no-browser 2>&1`, { timeout: 300000 }, (err, stdout, stderr) => {
        if (err) {
            console.error('[sso-refresh] Failed:', stderr || err.message);
        } else {
            awsCredentialsExpired = false;
            console.log('[sso-refresh] SSO login completed');
        }
    });
    res.json({
        success: true,
        message: `SSO login initiated for profile "${profile}". Run: aws sso login --profile ${profile}`,
        loginCommand: `aws sso login --profile ${profile}`,
        ssoStartUrl: 'https://view.awsapps.com/start'
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
        
        res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
        saveSessions();
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
        
        res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
        saveSessions();
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
            res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
        saveSessions();
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

// Use fromIni which re-reads ~/.aws/credentials on every credential resolution.
// This means updating the credentials file (via any SSO/STS refresh mechanism)
// automatically takes effect on the next API call — no server restart needed.
function makeAwsCredentials(profile) {
    return fromIni({ profile });
}

const awsConfig = {
    credentials: makeAwsCredentials(awsProfile),
    region: process.env.AWS_REGION || 'eu-west-2'
};

// Helper: detect AWS token expiry errors
function isTokenExpiredError(err) {
    const code = err?.name || err?.Code || err?.code || '';
    const msg  = err?.message || '';
    return (
        code === 'ExpiredTokenException' ||
        code === 'ExpiredToken' ||
        code === 'TokenExpiredException' ||
        msg.includes('expired') ||
        msg.includes('Expired')
    );
}

// Shared server-side flag so middleware can signal the frontend
let awsCredentialsExpired = false;

// Proactively check credentials every 30 min and set the flag
setInterval(async () => {
    try {
        const creds = await makeAwsCredentials(awsProfile)();
        awsCredentialsExpired = false;
        console.log('[credCheck] Credentials valid — expiry:', creds.expiration || 'no expiry');
    } catch (e) {
        awsCredentialsExpired = true;
        console.warn('[credCheck] Credentials expired or invalid:', e.message);
    }
}, 30 * 60 * 1000);

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
            
            res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200`);
        saveSessions();
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
            let aws_secret_name = null;

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
                if (line.startsWith('export AWS_SECRET_NAME=')) aws_secret_name = cleanValue(line.split('=')[1]);
            });

            tokens.github = synechron_github_token || github_token || github_pat;
            tokens.gitlab = gitlab_token || gitlab_pat;
            if (gitlab_url) tokens.instance_url = gitlab_url;
            tokens.github_client_id = gh_client_id;
            tokens.github_client_secret = gh_client_secret;
            tokens.gitlab_client_id = gl_client_id;
            tokens.gitlab_client_secret = gl_client_secret;
            tokens.aws_secret_name = aws_secret_name;
        }
        // Fallback to process.env (also sanitize just in case)
        const sanitizeEnv = (val) => val ? val.replace(/[\r\n]/g, '').trim() : null;
        if (!tokens.github) tokens.github = sanitizeEnv(process.env.SYNECHRON_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT);
        if (!tokens.gitlab) tokens.gitlab = sanitizeEnv(process.env.GITLAB_TOKEN || process.env.GITLAB_PAT);
        if (!tokens.github_client_id) tokens.github_client_id = sanitizeEnv(process.env.GITHUB_OAUTH_CLIENT_ID);
        if (!tokens.github_client_secret) tokens.github_client_secret = sanitizeEnv(process.env.GITHUB_OAUTH_CLIENT_SECRET);
        if (!tokens.gitlab_client_id) tokens.gitlab_client_id = sanitizeEnv(process.env.GITLAB_OAUTH_CLIENT_ID);
        if (!tokens.gitlab_client_secret) tokens.gitlab_client_secret = sanitizeEnv(process.env.GITLAB_OAUTH_CLIENT_SECRET);
        if (!tokens.aws_secret_name) tokens.aws_secret_name = sanitizeEnv(process.env.AWS_SECRET_NAME);
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

// Endpoint to save tokens to AWS Secrets Manager Vault
app.post('/api/config/vault/save', async (req, res) => {
    try {
        const {
            secretName,
            github,
            gitlab,
            instance_url,
            github_client_id,
            github_client_secret,
            gitlab_client_id,
            gitlab_client_secret
        } = req.body;

        if (!secretName) {
            return res.status(400).json({ success: false, error: 'Secret Name is required.' });
        }

        const payload = {
            github: github || '',
            gitlab: gitlab || '',
            instance_url: instance_url || '',
            github_client_id: github_client_id || '',
            github_client_secret: github_client_secret || '',
            gitlab_client_id: gitlab_client_id || '',
            gitlab_client_secret: gitlab_client_secret || ''
        };

        const secretString = JSON.stringify(payload);

        // Get dynamic or global client
        const { secrets } = getAwsClients(req);

        try {
            await secrets.send(new CreateSecretCommand({
                Name: secretName,
                SecretString: secretString,
                Description: 'Tokens for GitHub and GitLab stored by Calitti AWS Dashboard'
            }));
        } catch (err) {
            if (err.name === 'ResourceExistsException' || err.code === 'ResourceExistsException') {
                await secrets.send(new UpdateSecretCommand({
                    SecretId: secretName,
                    SecretString: secretString
                }));
            } else {
                throw err;
            }
        }

        // Write AWS_SECRET_NAME to .envrc and clear actual tokens from there
        const envrcPath = path.join(__dirname, '..', 'Synechron_ARC', 'sarc', '.envrc');
        let lines = [];
        if (fs.existsSync(envrcPath)) {
            lines = fs.readFileSync(envrcPath, 'utf8').split('\n');
        }

        lines = lines.filter(line => 
            !line.startsWith('export AWS_SECRET_NAME=') &&
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

        lines.push(`export AWS_SECRET_NAME="${secretName}"`);
        fs.writeFileSync(envrcPath, lines.join('\n').trim() + '\n');

        // Dynamically apply changes in-memory
        process.env.AWS_SECRET_NAME = secretName;
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

        res.json({ success: true, message: 'Settings saved to AWS Secrets Manager and AWS_SECRET_NAME persisted in .envrc' });
    } catch (err) {
        console.error('Error saving to AWS Secrets Manager:', err);
        if (isTokenExpiredError(err)) {
            awsCredentialsExpired = true;
            return res.status(401).json({
                success: false,
                tokenExpired: true,
                profile: awsProfile,
                error: 'AWS credentials have expired. Please login again.',
                loginCommand: `aws sso login --profile ${awsProfile}`
            });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to load tokens from AWS Secrets Manager Vault
app.post('/api/config/vault/load', async (req, res) => {
    try {
        const secretName = req.body.secretName || process.env.AWS_SECRET_NAME;
        if (!secretName) {
            return res.status(400).json({ success: false, error: 'No secret name specified and AWS_SECRET_NAME is not set.' });
        }

        const { secrets } = getAwsClients(req);
        const secretRes = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }));
        if (!secretRes.SecretString) {
            return res.status(404).json({ success: false, error: 'Secret is empty.' });
        }

        const data = JSON.parse(secretRes.SecretString);

        // Apply in-memory
        process.env.AWS_SECRET_NAME = secretName;
        if (data.github !== undefined) process.env.SYNECHRON_GITHUB_TOKEN = data.github;
        if (data.gitlab !== undefined) process.env.GITLAB_PAT = data.gitlab;
        if (data.instance_url !== undefined) {
            process.env.GITLAB_URL = data.instance_url;
            try {
                const url = new URL(data.instance_url);
                gitlabHost = url.hostname;
            } catch(e) {}
        }
        if (data.github_client_id !== undefined) {
            process.env.GITHUB_OAUTH_CLIENT_ID = data.github_client_id;
            githubClientId = data.github_client_id;
        }
        if (data.github_client_secret !== undefined) {
            process.env.GITHUB_OAUTH_CLIENT_SECRET = data.github_client_secret;
            githubClientSecret = data.github_client_secret;
        }
        if (data.gitlab_client_id !== undefined) {
            process.env.GITLAB_OAUTH_CLIENT_ID = data.gitlab_client_id;
            gitlabClientId = data.gitlab_client_id;
        }
        if (data.gitlab_client_secret !== undefined) {
            process.env.GITLAB_OAUTH_CLIENT_SECRET = data.gitlab_client_secret;
            gitlabClientSecret = data.gitlab_client_secret;
        }

        // Persist the AWS_SECRET_NAME in .envrc
        const envrcPath = path.join(__dirname, '..', 'Synechron_ARC', 'sarc', '.envrc');
        let lines = [];
        if (fs.existsSync(envrcPath)) {
            lines = fs.readFileSync(envrcPath, 'utf8').split('\n');
        }

        lines = lines.filter(line => !line.startsWith('export AWS_SECRET_NAME='));
        lines.push(`export AWS_SECRET_NAME="${secretName}"`);
        fs.writeFileSync(envrcPath, lines.join('\n').trim() + '\n');

        res.json({
            success: true,
            message: 'Tokens successfully loaded from AWS Secrets Manager',
            data: {
                secretName,
                github: data.github || '',
                gitlab: data.gitlab || '',
                instance_url: data.instance_url || '',
                github_client_id: data.github_client_id || '',
                github_client_secret: data.github_client_secret || '',
                gitlab_client_id: data.gitlab_client_id || '',
                gitlab_client_secret: data.gitlab_client_secret || ''
            }
        });
    } catch (err) {
        console.error('Error loading from AWS Secrets Manager:', err);
        if (isTokenExpiredError(err)) {
            awsCredentialsExpired = true;
            return res.status(401).json({
                success: false,
                tokenExpired: true,
                profile: awsProfile,
                error: 'AWS credentials have expired. Please login again.',
                loginCommand: `aws sso login --profile ${awsProfile}`
            });
        }
        res.status(500).json({ success: false, error: err.message });
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
                            const instanceTypes = r.nodegroup.instanceTypes || ['t3.medium'];
                            const instanceType = instanceTypes[0];
                            const desired = r.nodegroup.scalingConfig?.desiredSize ?? 0;
                            const costInfo = getEc2CostEstimate(instanceType);
                            const nodeGroupMonthlyCost = parseFloat(costInfo.monthlyEstimate) * desired;
                            return {
                                name: r.nodegroup.nodegroupName,
                                status: r.nodegroup.status,
                                instanceType,
                                instanceTypes,
                                capacityType: r.nodegroup.capacityType || 'ON_DEMAND',
                                desired,
                                min: r.nodegroup.scalingConfig?.minSize ?? 0,
                                max: r.nodegroup.scalingConfig?.maxSize ?? 0,
                                amiType: r.nodegroup.amiType || 'AL2_x86_64',
                                createdAt: r.nodegroup.createdAt,
                                nodeRole: r.nodegroup.nodeRole,
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
                    vpcId: cluster.resourcesVpcConfig?.vpcId || null,
                    subnetCount: cluster.resourcesVpcConfig?.subnetIds?.length || 0,
                    publicAccess: cluster.resourcesVpcConfig?.endpointPublicAccess ?? true,
                    privateAccess: cluster.resourcesVpcConfig?.endpointPrivateAccess ?? true,
                    loggingEnabled: (cluster.logging?.clusterLogging || []).some(l => l.enabled),
                    nodeGroups: validNGs,
                    totalNodes: validNGs.reduce((s, ng) => s + (ng.desired || 0), 0),
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
const lambdaClient = new LambdaClient(awsConfig);
const cfnClient = new CloudFormationClient(awsConfig);
const iamClient = new IAMClient(awsConfig);
const rdsClient = new RDSClient(awsConfig);
const dynamoClient = new DynamoDBClient(awsConfig);
const ecrClient = new ECRClient(awsConfig);
const snsClient = new SNSClient(awsConfig);
const sqsClient = new SQSClient(awsConfig);
const secretsClient = new SecretsManagerClient(awsConfig);
const elbClient = new ElasticLoadBalancingV2Client(awsConfig);
const asgClient = new AutoScalingClient(awsConfig);
const cwClient = new CloudWatchClient(awsConfig);
const route53Client = new Route53Client({ ...awsConfig, region: 'us-east-1' });
const ssmClient = new SSMClient(awsConfig);

async function loadTokensFromVault() {
    const secretName = process.env.AWS_SECRET_NAME;
    if (!secretName) {
        console.log('[vault] AWS_SECRET_NAME not set. Skipping autoload.');
        return;
    }
    try {
        console.log(`[vault] Attempting to load tokens from AWS secret "${secretName}"...`);
        const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretName }));
        if (res.SecretString) {
            const data = JSON.parse(res.SecretString);
            console.log('[vault] Successfully retrieved tokens from AWS Secret Manager.');
            
            if (data.github) process.env.SYNECHRON_GITHUB_TOKEN = data.github;
            if (data.gitlab) process.env.GITLAB_PAT = data.gitlab;
            if (data.instance_url) {
                process.env.GITLAB_URL = data.instance_url;
                try {
                    const url = new URL(data.instance_url);
                    gitlabHost = url.hostname;
                } catch (e) {}
            }
            if (data.github_client_id) {
                process.env.GITHUB_OAUTH_CLIENT_ID = data.github_client_id;
                githubClientId = data.github_client_id;
            }
            if (data.github_client_secret) {
                process.env.GITHUB_OAUTH_CLIENT_SECRET = data.github_client_secret;
                githubClientSecret = data.github_client_secret;
            }
            if (data.gitlab_client_id) {
                process.env.GITLAB_OAUTH_CLIENT_ID = data.gitlab_client_id;
                gitlabClientId = data.gitlab_client_id;
            }
            if (data.gitlab_client_secret) {
                process.env.GITLAB_OAUTH_CLIENT_SECRET = data.gitlab_client_secret;
                gitlabClientSecret = data.gitlab_client_secret;
            }
        }
    } catch (err) {
        console.error(`[vault] Error autoloading from secret "${secretName}":`, err.message);
    }
}



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
                eks: new EKSClient(config),
                lambda: new LambdaClient(config),
                cfn: new CloudFormationClient(config),
                iam: new IAMClient(config),
                rds: new RDSClient(config),
                dynamo: new DynamoDBClient(config),
                ecr: new ECRClient(config),
                sns: new SNSClient(config),
                sqs: new SQSClient(config),
                secrets: new SecretsManagerClient(config),
                elb: new ElasticLoadBalancingV2Client(config),
                asg: new AutoScalingClient(config),
                cw: new CloudWatchClient(config),
                route53: new Route53Client({ ...config, region: 'us-east-1' }),
                ssm: new SSMClient(config)
            };
        }
    }
    return {
        ec2: ec2Client,
        cloudtrail: cloudtrailClient,
        costexplorer: ceClient,
        budgets: bgClient,
        s3: s3Client,
        eks: eksClient,
        lambda: lambdaClient,
        cfn: cfnClient,
        iam: iamClient,
        rds: rdsClient,
        dynamo: dynamoClient,
        ecr: ecrClient,
        sns: snsClient,
        sqs: sqsClient,
        secrets: secretsClient,
        elb: elbClient,
        asg: asgClient,
        cw: cwClient,
        route53: route53Client,
        ssm: ssmClient
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

const resolveGroup = (tags, defaultGroup) => {
    if (!tags) return defaultGroup;
    const targetKeys = ['dashboardgroup', 'project', 'group', 'team', 'customer', 'demoservice', 'dashboard-group'];
    if (Array.isArray(tags)) {
        for (const tag of tags) {
            if (tag && tag.Key && typeof tag.Key === 'string') {
                const keyLower = tag.Key.toLowerCase();
                if (targetKeys.includes(keyLower) && tag.Value) {
                    return tag.Value;
                }
            }
        }
    } else if (typeof tags === 'object') {
        for (const key of Object.keys(tags)) {
            const keyLower = key.toLowerCase();
            if (targetKeys.includes(keyLower) && tags[key]) {
                return tags[key];
            }
        }
    }
    return defaultGroup;
};

const resolveOwner = (tags) => {
    if (!tags) return 'unknown';
    const targetKeys = ['owner', 'creator', 'createdby', 'created-by'];
    if (Array.isArray(tags)) {
        for (const tag of tags) {
            if (tag && tag.Key && typeof tag.Key === 'string') {
                const keyLower = tag.Key.toLowerCase();
                if (targetKeys.includes(keyLower) && tag.Value) {
                    return tag.Value;
                }
            }
        }
    } else if (typeof tags === 'object') {
        for (const key of Object.keys(tags)) {
            const keyLower = key.toLowerCase();
            if (targetKeys.includes(keyLower) && tags[key]) {
                return tags[key];
            }
        }
    }
    return 'unknown';
};

const resolveCreatedDate = (tags, defaultDate) => {
    if (tags) {
        const targetKeys = ['created', 'createddate', 'creationdate', 'created-date'];
        if (Array.isArray(tags)) {
            for (const tag of tags) {
                if (tag && tag.Key && typeof tag.Key === 'string') {
                    const keyLower = tag.Key.toLowerCase();
                    if (targetKeys.includes(keyLower) && tag.Value) {
                        return tag.Value;
                    }
                }
            }
        } else if (typeof tags === 'object') {
            for (const key of Object.keys(tags)) {
                const keyLower = key.toLowerCase();
                if (targetKeys.includes(keyLower) && tags[key]) {
                    return tags[key];
                }
            }
        }
    }
    if (defaultDate) {
        try {
            return new Date(defaultDate).toISOString().split('T')[0];
        } catch (_) {}
    }
    return 'unknown';
};

const resolveEolDate = (tags) => {
    if (!tags) return 'N/A';
    const targetKeys = ['eol', 'endoflife', 'end-of-life', 'terminationdate', 'termination-date'];
    if (Array.isArray(tags)) {
        for (const tag of tags) {
            if (tag && tag.Key && typeof tag.Key === 'string') {
                const keyLower = tag.Key.toLowerCase();
                if (targetKeys.includes(keyLower) && tag.Value) {
                    return tag.Value;
                }
            }
        }
    } else if (typeof tags === 'object') {
        for (const key of Object.keys(tags)) {
            const keyLower = key.toLowerCase();
            if (targetKeys.includes(keyLower) && tags[key]) {
                return tags[key];
            }
        }
    }
    return 'N/A';
};

// Endpoint to get all AWS resources (EC2 instances, S3 buckets, VPCs, Subnets, Security Groups)
app.get('/api/resources', async (req, res) => {
    try {
        const { ec2, s3, eks, lambda, cfn } = getAwsClients(req);
        const resources = [];

        // Fast-fail on expired credentials before fetching everything
        try {
            await ec2.send(new DescribeInstancesCommand({ MaxResults: 5 }));
            awsCredentialsExpired = false;
        } catch (credErr) {
            if (isTokenExpiredError(credErr)) {
                awsCredentialsExpired = true;
                return res.status(401).json({
                    success: false,
                    tokenExpired: true,
                    profile: awsProfile,
                    error: 'AWS credentials have expired. Please run: aws sso login --profile ' + awsProfile,
                    loginCommand: `aws sso login --profile ${awsProfile}`,
                    ssoStartUrl: 'https://view.awsapps.com/start'
                });
            }
            // Non-auth error — continue with partial results
        }

        // 1. Fetch EC2 instances (all states)
        try {
            const command = new DescribeInstancesCommand({});
            const response = await ec2.send(command);
            if (response.Reservations) {
                response.Reservations.forEach(reservation => {
                    if (reservation.Instances) {
                        reservation.Instances.forEach(instance => {
                            const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
                            const eksClusterTag = instance.Tags?.find(t => t.Key === 'eks:cluster-name');
                            const type = instance.InstanceType;
                            const cost = getEc2CostEstimate(type);
                            const stateName = instance.State?.Name || 'running';
                            // Exclude terminated instances to reduce noise
                            if (stateName === 'terminated') return;
                            resources.push({
                                id: instance.InstanceId,
                                name: nameTag ? nameTag.Value : 'Unnamed EC2',
                                type: type,
                                service: 'EC2',
                                group: resolveGroup(instance.Tags, eksClusterTag ? `EKS: ${eksClusterTag.Value}` : 'EC2 Instances'),
                                state: stateName,
                                launchTime: instance.LaunchTime,
                                publicIp: instance.PublicIpAddress || 'Private Only',
                                costEstimate: stateName === 'running' ? cost.monthlyEstimate : '0.00',
                                lastMonthUsage: cost.lastMonthUsage,
                                lastMonthCost: cost.lastMonthCost,
                                tags: instance.Tags
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
            const s3Response = await s3.send(new ListBucketsCommand({}));
            if (s3Response.Buckets) {
                s3Response.Buckets.forEach(bucket => {
                    const cost = getS3CostEstimate(bucket.Name);
                    resources.push({
                        id: bucket.Name,
                        name: bucket.Name,
                        type: 'Standard S3 Bucket',
                        service: 'S3',
                        group: resolveGroup(null, 'S3 Buckets'),
                        state: 'running',
                        launchTime: bucket.CreationDate,
                        publicIp: 'N/A (Object Storage)',
                        costEstimate: cost.monthlyEstimate,
                        lastMonthUsage: cost.lastMonthUsage,
                        lastMonthCost: cost.lastMonthCost
                    });
                });
            }
        } catch (s3Err) { console.error('Error fetching S3 buckets:', s3Err); }

        // 2b. Fetch CloudFormation Stacks — visible the moment provisioning starts
        // Statuses that mean the stack is actively being created/updated/deleted
        const CFN_TRANSIENT = new Set([
            'CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'DELETE_IN_PROGRESS',
            'ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_IN_PROGRESS',
            'REVIEW_IN_PROGRESS', 'IMPORT_IN_PROGRESS'
        ]);
        const CFN_FAILED = new Set(['CREATE_FAILED', 'ROLLBACK_FAILED', 'UPDATE_ROLLBACK_FAILED', 'DELETE_FAILED']);
        try {
            // ListStacks with all non-deleted filters
            const cfnStatuses = [
                'CREATE_IN_PROGRESS', 'CREATE_FAILED', 'CREATE_COMPLETE',
                'ROLLBACK_IN_PROGRESS', 'ROLLBACK_FAILED', 'ROLLBACK_COMPLETE',
                'UPDATE_IN_PROGRESS', 'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS', 'UPDATE_COMPLETE',
                'UPDATE_ROLLBACK_IN_PROGRESS', 'UPDATE_ROLLBACK_FAILED', 'UPDATE_ROLLBACK_COMPLETE',
                'REVIEW_IN_PROGRESS', 'IMPORT_IN_PROGRESS', 'IMPORT_COMPLETE', 'IMPORT_ROLLBACK_IN_PROGRESS'
            ];
            const cfnRes = await cfn.send(new ListCFNStacksCommand({ StackStatusFilter: cfnStatuses }));
            const stacks = cfnRes.StackSummaries || [];

            for (const stack of stacks) {
                const name = stack.StackName;
                const status = stack.StackStatus;

                // Derive logical group from eksctl naming convention:
                // eksctl-<cluster>-cluster → EKS: <cluster>
                // eksctl-<cluster>-nodegroup-<ng> → EKS: <cluster>
                let group = 'CloudFormation Stacks';
                const eksMatch = name.match(/^eksctl-([^-]+(?:-[^-]+)*?)-(cluster|nodegroup)/);
                if (eksMatch) group = `EKS: ${eksMatch[1]}`;

                const isTransient = CFN_TRANSIENT.has(status);
                const isFailed = CFN_FAILED.has(status);
                const state = isTransient ? 'creating' : isFailed ? 'failed' : status === 'CREATE_COMPLETE' || status === 'UPDATE_COMPLETE' ? 'running' : status.toLowerCase().replace(/_/g, '-');

                // Don't show ROLLBACK_COMPLETE (already cleaned up)
                if (status === 'ROLLBACK_COMPLETE') continue;

                resources.push({
                    id: stack.StackId || name,
                    name,
                    type: `CloudFormation Stack • ${status.replace(/_/g, ' ')}`,
                    service: 'CloudFormation',
                    group: resolveGroup(null, group),
                    state,
                    launchTime: stack.CreationTime,
                    publicIp: 'N/A (Infrastructure Stack)',
                    costEstimate: '0.00',
                    lastMonthUsage: status,
                    lastMonthCost: '0.00',
                    cfnStatus: status,
                    isTransient
                });
            }
        } catch (cfnErr) { console.error('Error fetching CloudFormation stacks:', cfnErr.message); }


        const vpcNameMap = {};
        try {
            const vpcResponse = await ec2.send(new DescribeVpcsCommand({}));
            if (vpcResponse.Vpcs) {
                vpcResponse.Vpcs.forEach(vpc => {
                    const nameTag = vpc.Tags?.find(t => t.Key === 'Name');
                    const vpcName = nameTag ? nameTag.Value : vpc.VpcId;
                    vpcNameMap[vpc.VpcId] = vpcName;
                    resources.push({
                        id: vpc.VpcId,
                        name: vpcName,
                        type: vpc.CidrBlock,
                        service: 'VPC',
                        group: resolveGroup(vpc.Tags, `Network: ${vpcName}`),
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Virtual Network)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: vpc.Tags
                    });
                });
            }
        } catch (e) { console.error('Error fetching VPCs:', e); }

        // 4. Fetch Subnets
        try {
            const subnetResponse = await ec2.send(new DescribeSubnetsCommand({}));
            if (subnetResponse.Subnets) {
                subnetResponse.Subnets.forEach(subnet => {
                    const nameTag = subnet.Tags?.find(t => t.Key === 'Name');
                    const vpcName = vpcNameMap[subnet.VpcId] || subnet.VpcId;
                    resources.push({
                        id: subnet.SubnetId,
                        name: nameTag ? nameTag.Value : 'Unnamed Subnet',
                        type: `${subnet.CidrBlock} (${subnet.AvailabilityZone})`,
                        service: 'Subnet',
                        group: resolveGroup(subnet.Tags, `Network: ${vpcName}`),
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Network Subnet)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: subnet.Tags
                    });
                });
            }
        } catch (e) { console.error('Error fetching Subnets:', e); }

        // 5. Fetch Security Groups
        try {
            const sgResponse = await ec2.send(new DescribeSecurityGroupsCommand({}));
            if (sgResponse.SecurityGroups) {
                sgResponse.SecurityGroups.forEach(sg => {
                    const nameTag = sg.Tags?.find(t => t.Key === 'Name');
                    const vpcName = sg.VpcId ? (vpcNameMap[sg.VpcId] || sg.VpcId) : 'Default';
                    resources.push({
                        id: sg.GroupId,
                        name: nameTag ? nameTag.Value : sg.GroupName,
                        type: sg.Description || 'Security Group',
                        service: 'SecurityGroup',
                        group: resolveGroup(sg.Tags, `Network: ${vpcName}`),
                        state: 'running',
                        launchTime: null,
                        publicIp: 'N/A (Firewall Rules)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: sg.Tags
                    });
                });
            }
        } catch (e) { console.error('Error fetching Security Groups:', e); }

        // 6. Fetch NAT Gateways — $0.045/h per AZ = ~$32.85/mo each
        try {
            const natResponse = await ec2.send(new DescribeNatGatewaysCommand({ Filter: [{ Name: 'state', Values: ['available'] }] }));
            if (natResponse.NatGateways) {
                natResponse.NatGateways.forEach(nat => {
                    const nameTag = nat.Tags?.find(t => t.Key === 'Name');
                    const vpcName = nat.VpcId ? (vpcNameMap[nat.VpcId] || nat.VpcId) : 'Unknown VPC';
                    const monthlyCost = (0.045 * 730).toFixed(2); // $32.85/mo
                    const publicIp = nat.NatGatewayAddresses?.[0]?.PublicIp || 'N/A';
                    resources.push({
                        id: nat.NatGatewayId,
                        name: nameTag ? nameTag.Value : nat.NatGatewayId,
                        type: `NAT Gateway (${nat.SubnetId || 'unknown subnet'})`,
                        service: 'NAT Gateway',
                        group: resolveGroup(nat.Tags, `Network: ${vpcName}`),
                        state: nat.State === 'available' ? 'running' : nat.State,
                        launchTime: nat.CreateTime,
                        publicIp,
                        costEstimate: monthlyCost,
                        lastMonthUsage: `EIP: ${publicIp}`,
                        lastMonthCost: monthlyCost,
                        region: process.env.AWS_REGION || 'eu-west-2',
                        tags: nat.Tags
                    });
                });
            }
        } catch (e) { console.error('Error fetching NAT Gateways:', e); }

        // 7. Fetch Internet Gateways — free, but important for visibility
        try {
            const igwResponse = await ec2.send(new DescribeInternetGatewaysCommand({}));
            if (igwResponse.InternetGateways) {
                igwResponse.InternetGateways.forEach(igw => {
                    const nameTag = igw.Tags?.find(t => t.Key === 'Name');
                    const attachedVpcId = igw.Attachments?.[0]?.VpcId;
                    const vpcName = attachedVpcId ? (vpcNameMap[attachedVpcId] || attachedVpcId) : 'Detached';
                    resources.push({
                        id: igw.InternetGatewayId,
                        name: nameTag ? nameTag.Value : igw.InternetGatewayId,
                        type: `Internet Gateway → ${vpcName}`,
                        service: 'Internet Gateway',
                        group: resolveGroup(igw.Tags, `Network: ${vpcName}`),
                        state: igw.Attachments?.[0]?.State === 'available' ? 'running' : 'detached',
                        launchTime: null,
                        publicIp: 'N/A (Gateway)',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: igw.Tags
                    });
                });
            }
        } catch (e) { console.error('Error fetching Internet Gateways:', e); }

        // 8. Fetch EKS Clusters — include control plane cost and VPC group
        try {
            const eksListRes = await eks.send(new ListClustersCommand({}));
            const clusterNames = eksListRes.clusters || [];
            await Promise.all(clusterNames.map(async (clusterName) => {
                try {
                    const descRes = await eks.send(new DescribeClusterCommand({ name: clusterName }));
                    const cluster = descRes.cluster;
                    const clusterVpcName = cluster.resourcesVpcConfig?.vpcId
                        ? (vpcNameMap[cluster.resourcesVpcConfig.vpcId] || cluster.resourcesVpcConfig.vpcId)
                        : 'unknown';

                    // Fetch node groups for cost
                    let nodeGroupCostTotal = 0;
                    let nodeGroupSummary = 'No node groups';
                    let validNGs = []; // hoisted so resources.push can reference it
                    try {
                        const ngListRes = await eks.send(new ListNodegroupsCommand({ clusterName }));
                        const ngNames = ngListRes.nodegroups || [];
                        const ngDetails = await Promise.all(ngNames.map(ng =>
                            eks.send(new DescribeNodegroupCommand({ clusterName, nodegroupName: ng })).catch(() => null)
                        ));
                        validNGs = ngDetails.filter(Boolean).map(r => r.nodegroup);
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

                    // $73/mo control plane + node groups
                    const totalCost = (73 + nodeGroupCostTotal).toFixed(2);

                    resources.push({
                        id:           cluster.arn || cluster.name,
                        name:         cluster.name,
                        type:         `EKS v${cluster.version} • ${nodeGroupSummary}`,
                        service:      'EKS',
                        group:        resolveGroup(cluster.tags, `EKS: ${cluster.name}`),
                        state:        cluster.status === 'ACTIVE' ? 'running' : cluster.status.toLowerCase(),
                        launchTime:   cluster.createdAt,
                        publicIp:     cluster.endpoint || null,
                        costEstimate: totalCost,
                        lastMonthCost: totalCost,
                        lastMonthUsage: nodeGroupSummary,
                        region:       cluster.arn?.split(':')[3] || 'eu-west-2',
                        // EKS detail panel fields
                        version:      cluster.version,
                        endpoint:     cluster.endpoint || null,
                        vpcId:        cluster.resourcesVpcConfig?.vpcId || null,
                        vpcName:      clusterVpcName,
                        subnetCount:  cluster.resourcesVpcConfig?.subnetIds?.length || 0,
                        publicAccess: cluster.resourcesVpcConfig?.endpointPublicAccess ?? true,
                        privateAccess: cluster.resourcesVpcConfig?.endpointPrivateAccess ?? true,
                        nodeCount:    nodeGroupCostTotal > 0 ? validNGs?.reduce((s,ng)=>s+(ng.scalingConfig?.desiredSize||0),0) : 0,
                        totalNodes:   validNGs?.reduce ? validNGs.reduce((s,ng)=>s+(ng.scalingConfig?.desiredSize||0),0) : 0,
                        tags: cluster.tags
                    });
                } catch (descErr) {
                    console.error('Error describing EKS cluster', clusterName, descErr.message);
                }
            }));
        } catch (eksErr) { console.error('Error fetching EKS clusters:', eksErr.message); }

        // 9. Fetch Lambda Functions
        try {
            let marker;
            const lambdaFunctions = [];
            do {
                const listRes = await lambda.send(new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }));
                lambdaFunctions.push(...(listRes.Functions || []));
                marker = listRes.NextMarker;
            } while (marker);

            for (const fn of lambdaFunctions) {
                // Try to get the Function URL if it exists
                let functionUrl = null;
                try {
                    const urlRes = await lambda.send(new GetFunctionUrlConfigCommand({ FunctionName: fn.FunctionName }));
                    functionUrl = urlRes.FunctionUrl;
                } catch (_) { /* no URL config */ }

                // Lambda cost: free tier 1M req/mo; estimate based on memory × duration
                // Most test functions = ~$0 to $1/mo
                const memoryCost = ((fn.MemorySize || 128) / 1024 * 0.0000166667 * 100 * 30 * 24).toFixed(2); // 100 req/day estimate

                resources.push({
                    id: fn.FunctionArn,
                    name: fn.FunctionName,
                    type: `Lambda ${fn.Runtime} • ${fn.MemorySize || 128}MB • ${fn.Timeout || 3}s timeout`,
                    service: 'Lambda',
                    group: resolveGroup(fn.Tags || null, 'Lambda Functions'),
                    state: fn.State === 'Active' || !fn.State ? 'running' : fn.State.toLowerCase(),
                    launchTime: fn.LastModified,
                    publicIp: functionUrl ? functionUrl.replace('https://', '').replace(/\/$/, '') : 'No public URL',
                    costEstimate: memoryCost,
                    lastMonthUsage: functionUrl ? 'Public Function URL' : 'Internal only',
                    lastMonthCost: memoryCost,
                    region: fn.FunctionArn.split(':')[3] || 'eu-west-2',
                    functionUrl,
                    tags: fn.Tags || null
                });
            }
        } catch (lambdaErr) { console.error('Error fetching Lambda functions:', lambdaErr.message); }

        const { iam, rds, dynamo, ecr, sns, sqs, secrets, elb, asg, cw, route53, ssm } = getAwsClients(req);

        // ── IAM: Roles ──────────────────────────────────────────────────────
        try {
            let marker;
            do {
                const r = await iam.send(new ListRolesCommand({ Marker: marker, MaxItems: 100 }));
                (r.Roles || []).forEach(role => {
                    // Skip AWS service-linked roles to reduce noise
                    if (role.Path === '/aws-service-role/') return;
                    resources.push({
                        id: role.RoleId,
                        name: role.RoleName,
                        type: `IAM Role • ${role.Path}`,
                        service: 'IAM Role',
                        group: resolveGroup(role.Tags || null, 'IAM'),
                        state: 'running',
                        launchTime: role.CreateDate,
                        publicIp: 'N/A',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: role.Tags || null
                    });
                });
                marker = r.IsTruncated ? r.Marker : null;
            } while (marker);
        } catch (e) { console.error('Error fetching IAM roles:', e.message); }

        // ── IAM: Users ──────────────────────────────────────────────────────
        try {
            let marker;
            do {
                const r = await iam.send(new ListUsersCommand({ Marker: marker, MaxItems: 100 }));
                (r.Users || []).forEach(user => {
                    resources.push({
                        id: user.UserId,
                        name: user.UserName,
                        type: `IAM User • ${user.Path}`,
                        service: 'IAM User',
                        group: resolveGroup(user.Tags || null, 'IAM'),
                        state: 'running',
                        launchTime: user.CreateDate,
                        publicIp: 'N/A',
                        costEstimate: '0.00',
                        lastMonthUsage: 'N/A',
                        lastMonthCost: '0.00',
                        tags: user.Tags || null
                    });
                });
                marker = r.IsTruncated ? r.Marker : null;
            } while (marker);
        } catch (e) { console.error('Error fetching IAM users:', e.message); }

        // ── RDS: DB Instances ────────────────────────────────────────────────
        try {
            const r = await rds.send(new DescribeDBInstancesCommand({}));
            (r.DBInstances || []).forEach(db => {
                const RDS_RATES = { 'db.t3.micro': 13.87, 'db.t3.small': 27.74, 'db.t3.medium': 55.48, 'db.m5.large': 150.40 };
                const cost = (RDS_RATES[db.DBInstanceClass] || 100).toFixed(2);
                resources.push({
                    id: db.DBInstanceIdentifier,
                    name: db.DBInstanceIdentifier,
                    type: `RDS ${db.Engine} ${db.EngineVersion} • ${db.DBInstanceClass}`,
                    service: 'RDS',
                    group: resolveGroup(db.TagList || null, 'Databases'),
                    state: db.DBInstanceStatus === 'available' ? 'running' : db.DBInstanceStatus,
                    launchTime: db.InstanceCreateTime,
                    publicIp: db.Endpoint?.Address || 'Private',
                    costEstimate: ['available', 'running'].includes(db.DBInstanceStatus) ? cost : '0.00',
                    lastMonthUsage: db.DBInstanceClass,
                    lastMonthCost: cost,
                    tags: db.TagList || null
                });
            });
        } catch (e) { console.error('Error fetching RDS instances:', e.message); }

        // ── RDS: Aurora Clusters ─────────────────────────────────────────────
        try {
            const r = await rds.send(new DescribeDBClustersCommand({}));
            (r.DBClusters || []).forEach(cluster => {
                resources.push({
                    id: cluster.DBClusterIdentifier,
                    name: cluster.DBClusterIdentifier,
                    type: `Aurora ${cluster.Engine} ${cluster.EngineVersion} Cluster`,
                    service: 'RDS Aurora',
                    group: resolveGroup(cluster.TagList || null, 'Databases'),
                    state: cluster.Status === 'available' ? 'running' : cluster.Status,
                    launchTime: cluster.ClusterCreateTime,
                    publicIp: cluster.Endpoint || 'Private',
                    costEstimate: '0.00', // billed at instance level
                    lastMonthUsage: cluster.Engine,
                    lastMonthCost: '0.00',
                    tags: cluster.TagList || null
                });
            });
        } catch (e) { console.error('Error fetching RDS clusters:', e.message); }

        // ── DynamoDB Tables ──────────────────────────────────────────────────
        try {
            const r = await dynamo.send(new ListTablesCommand({}));
            (r.TableNames || []).forEach(name => {
                resources.push({
                    id: name,
                    name,
                    type: 'DynamoDB Table',
                    service: 'DynamoDB',
                    group: resolveGroup(null, 'Databases'),
                    state: 'running',
                    launchTime: null,
                    publicIp: 'N/A (Serverless)',
                    costEstimate: '0.00', // usage-based
                    lastMonthUsage: 'On-demand',
                    lastMonthCost: '0.00'
                });
            });
        } catch (e) { console.error('Error fetching DynamoDB tables:', e.message); }

        // ── ECR Repositories ─────────────────────────────────────────────────
        try {
            const r = await ecr.send(new DescribeRepositoriesCommand({}));
            (r.repositories || []).forEach(repo => {
                resources.push({
                    id: repo.repositoryArn,
                    name: repo.repositoryName,
                    type: `ECR ${repo.imageTagMutability} • ${repo.encryptionConfiguration?.encryptionType || 'AES256'}`,
                    service: 'ECR',
                    group: resolveGroup(null, 'Container Registry'),
                    state: 'running',
                    launchTime: repo.createdAt,
                    publicIp: repo.repositoryUri,
                    costEstimate: '0.10', // ~$0.10/GB/month
                    lastMonthUsage: 'N/A',
                    lastMonthCost: '0.00'
                });
            });
        } catch (e) { console.error('Error fetching ECR repos:', e.message); }

        // ── SNS Topics ────────────────────────────────────────────────────────
        try {
            const r = await sns.send(new ListTopicsCommand({}));
            (r.Topics || []).forEach(t => {
                const name = t.TopicArn.split(':').pop();
                resources.push({
                    id: t.TopicArn,
                    name,
                    type: 'SNS Topic',
                    service: 'SNS',
                    group: resolveGroup(null, 'Messaging'),
                    state: 'running',
                    launchTime: null,
                    publicIp: 'N/A',
                    costEstimate: '0.00',
                    lastMonthUsage: 'N/A',
                    lastMonthCost: '0.00'
                });
            });
        } catch (e) { console.error('Error fetching SNS topics:', e.message); }

        // ── SQS Queues ────────────────────────────────────────────────────────
        try {
            const r = await sqs.send(new ListQueuesCommand({ MaxResults: 100 }));
            (r.QueueUrls || []).forEach(url => {
                const name = url.split('/').pop();
                resources.push({
                    id: url,
                    name,
                    type: name.endsWith('.fifo') ? 'SQS FIFO Queue' : 'SQS Standard Queue',
                    service: 'SQS',
                    group: resolveGroup(null, 'Messaging'),
                    state: 'running',
                    launchTime: null,
                    publicIp: 'N/A',
                    costEstimate: '0.00',
                    lastMonthUsage: 'N/A',
                    lastMonthCost: '0.00'
                });
            });
        } catch (e) { console.error('Error fetching SQS queues:', e.message); }

        // ── Secrets Manager ───────────────────────────────────────────────────
        try {
            const r = await secrets.send(new ListSecretsCommand({ MaxResults: 100 }));
            (r.SecretList || []).forEach(secret => {
                resources.push({
                    id: secret.ARN,
                    name: secret.Name,
                    type: `Secret • ${secret.SecretVersionsToStages ? 'Active' : 'Pending'}`,
                    service: 'Secrets Manager',
                    group: resolveGroup(secret.Tags || null, 'Security & Secrets'),
                    state: 'running',
                    launchTime: secret.CreatedDate,
                    publicIp: 'N/A',
                    costEstimate: '0.40', // $0.40/secret/month
                    lastMonthUsage: 'N/A',
                    lastMonthCost: '0.40',
                    tags: secret.Tags || null
                });
            });
        } catch (e) { console.error('Error fetching Secrets Manager:', e.message); }

        // ── Load Balancers (ALB/NLB) ──────────────────────────────────────────
        try {
            const r = await elb.send(new DescribeLoadBalancersCommand({}));
            (r.LoadBalancers || []).forEach(lb => {
                const cost = lb.Type === 'network' ? 17.52 : 18.25; // ALB $18.25/mo, NLB $17.52/mo approx
                resources.push({
                    id: lb.LoadBalancerArn,
                    name: lb.LoadBalancerName,
                    type: `${lb.Type?.toUpperCase() || 'ALB'} Load Balancer • ${lb.Scheme}`,
                    service: 'Load Balancer',
                    group: resolveGroup(null, 'Networking'),
                    state: lb.State?.Code === 'active' ? 'running' : lb.State?.Code || 'unknown',
                    launchTime: lb.CreatedTime,
                    publicIp: lb.DNSName || 'N/A',
                    costEstimate: lb.State?.Code === 'active' ? cost.toFixed(2) : '0.00',
                    lastMonthUsage: lb.Type,
                    lastMonthCost: cost.toFixed(2)
                });
            });
        } catch (e) { console.error('Error fetching Load Balancers:', e.message); }

        // ── Auto Scaling Groups ────────────────────────────────────────────────
        try {
            const r = await asg.send(new DescribeAutoScalingGroupsCommand({}));
            (r.AutoScalingGroups || []).forEach(g => {
                resources.push({
                    id: g.AutoScalingGroupARN,
                    name: g.AutoScalingGroupName,
                    type: `ASG • min:${g.MinSize} max:${g.MaxSize} desired:${g.DesiredCapacity}`,
                    service: 'Auto Scaling',
                    group: resolveGroup(g.Tags || null, 'Compute'),
                    state: g.DesiredCapacity > 0 ? 'running' : 'stopped',
                    launchTime: g.CreatedTime,
                    publicIp: 'N/A',
                    costEstimate: '0.00', // instances billed separately
                    lastMonthUsage: `${g.Instances?.length || 0} instances`,
                    lastMonthCost: '0.00',
                    tags: g.Tags || null
                });
            });
        } catch (e) { console.error('Error fetching ASGs:', e.message); }

        // ── CloudWatch Alarms ─────────────────────────────────────────────────
        try {
            const r = await cw.send(new DescribeAlarmsCommand({ MaxRecords: 100 }));
            (r.MetricAlarms || []).forEach(alarm => {
                const stateMap = { OK: 'running', ALARM: 'failed', INSUFFICIENT_DATA: 'updating' };
                resources.push({
                    id: alarm.AlarmArn,
                    name: alarm.AlarmName,
                    type: `CloudWatch Alarm • ${alarm.Statistic || alarm.ExtendedStatistic} ${alarm.MetricName}`,
                    service: 'CloudWatch',
                    group: resolveGroup(null, 'Monitoring'),
                    state: stateMap[alarm.StateValue] || 'unknown',
                    launchTime: alarm.AlarmConfigurationUpdatedTimestamp,
                    publicIp: alarm.StateValue,
                    costEstimate: '0.10', // $0.10/alarm/month
                    lastMonthUsage: alarm.StateValue,
                    lastMonthCost: '0.10'
                });
            });
        } catch (e) { console.error('Error fetching CloudWatch alarms:', e.message); }

        // ── Route 53 Hosted Zones ─────────────────────────────────────────────
        try {
            const r = await route53.send(new ListHostedZonesCommand({}));
            (r.HostedZones || []).forEach(zone => {
                resources.push({
                    id: zone.Id,
                    name: zone.Name.replace(/\.$/, ''),
                    type: `Route53 ${zone.Config?.PrivateZone ? 'Private' : 'Public'} Zone • ${zone.ResourceRecordSetCount} records`,
                    service: 'Route53',
                    group: resolveGroup(null, 'DNS & Domains'),
                    state: 'running',
                    launchTime: null,
                    publicIp: 'N/A',
                    costEstimate: zone.Config?.PrivateZone ? '0.50' : '0.50', // $0.50/zone/month
                    lastMonthUsage: `${zone.ResourceRecordSetCount} records`,
                    lastMonthCost: '0.50'
                });
            });
        } catch (e) { console.error('Error fetching Route53 zones:', e.message); }

        // ── SSM Parameter Store ───────────────────────────────────────────────
        try {
            const r = await ssm.send(new DescribeParametersCommand({ MaxResults: 50 }));
            (r.Parameters || []).forEach(p => {
                resources.push({
                    id: p.Name,
                    name: p.Name.split('/').pop(),
                    type: `SSM ${p.Type} Parameter`,
                    service: 'SSM Parameter',
                    group: resolveGroup(null, 'Security & Secrets'),
                    state: 'running',
                    launchTime: p.LastModifiedDate,
                    publicIp: 'N/A',
                    costEstimate: p.Type === 'SecureString' ? '0.05' : '0.00',
                    lastMonthUsage: p.Type,
                    lastMonthCost: '0.00'
                });
            });
        } catch (e) { console.error('Error fetching SSM parameters:', e.message); }

        // ── EBS Volumes ────────────────────────────────────────────────────────
        try {
            const r = await ec2.send(new DescribeVolumesCommand({}));
            (r.Volumes || []).forEach(vol => {
                const nameTag = vol.Tags?.find(t => t.Key === 'Name');
                const costPerGb = vol.VolumeType === 'io1' || vol.VolumeType === 'io2' ? 0.125 : 0.08;
                const cost = (vol.Size * costPerGb).toFixed(2);
                resources.push({
                    id: vol.VolumeId,
                    name: nameTag?.Value || vol.VolumeId,
                    type: `EBS ${vol.VolumeType?.toUpperCase()} • ${vol.Size}GB`,
                    service: 'EBS Volume',
                    group: resolveGroup(vol.Tags || null, 'Storage'),
                    state: vol.State === 'in-use' ? 'running' : vol.State,
                    launchTime: vol.CreateTime,
                    publicIp: vol.Attachments?.[0]?.InstanceId || 'Unattached',
                    costEstimate: cost,
                    lastMonthUsage: `${vol.Size}GB ${vol.VolumeType}`,
                    lastMonthCost: cost,
                    tags: vol.Tags || null
                });
            });
        } catch (e) { console.error('Error fetching EBS volumes:', e.message); }

        // ── Elastic IPs ────────────────────────────────────────────────────────
        try {
            const r = await ec2.send(new DescribeAddressesCommand({}));
            (r.Addresses || []).forEach(addr => {
                resources.push({
                    id: addr.AllocationId || addr.PublicIp,
                    name: addr.Tags?.find(t => t.Key === 'Name')?.Value || addr.PublicIp,
                    type: `Elastic IP • ${addr.Domain} • ${addr.AssociationId ? 'Associated' : 'Unassociated'}`,
                    service: 'Elastic IP',
                    group: resolveGroup(addr.Tags || null, 'Networking'),
                    state: 'running',
                    launchTime: null,
                    publicIp: addr.PublicIp,
                    costEstimate: addr.AssociationId ? '0.00' : '3.65', // $3.65/mo when idle
                    lastMonthUsage: addr.AssociationId ? 'In use' : 'IDLE (cost applies)',
                    lastMonthCost: addr.AssociationId ? '0.00' : '3.65',
                    tags: addr.Tags || null
                });
            });
        } catch (e) { console.error('Error fetching Elastic IPs:', e.message); }

        resources.forEach(r => {
            r.owner = resolveOwner(r.tags);
            r.createdDate = resolveCreatedDate(r.tags, r.launchTime);
            r.eolDate = resolveEolDate(r.tags);
            delete r.tags;
        });

        const hasTransient = resources.some(r =>
            ['creating', 'pending', 'updating', 'deleting'].includes(r.state) || r.isTransient
        );
        res.json({ success: true, count: resources.length, instances: resources, hasTransient });

    } catch (error) {
        console.error('Error in resources endpoint:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to get recent user logins from CloudTrail
// Queries multiple event types across multiple regions to capture all auth events
app.get('/api/logins', async (req, res) => {
    try {
        const { cloudtrail } = getAwsClients(req);
        const startTime = new Date();
        startTime.setDate(startTime.getDate() - 1); // 24 hours ago

        const region = process.env.AWS_REGION || 'eu-west-2';

        // CloudTrail clients: us-east-1 for global/IAM events, configured region for regional
        const buildCloudTrailClient = (r) => {
            if (req.user?.credentials && req.user.credentials.expiration > Date.now()) {
                const c = req.user.credentials;
                return new CloudTrailClient({ credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, sessionToken: c.sessionToken }, region: r });
            }
            return new CloudTrailClient({ ...cloudtrail.config, region: r });
        };

        const ctUsEast1 = buildCloudTrailClient('us-east-1');
        const ctRegional = buildCloudTrailClient(region);

        // Event types that represent human authentication/login actions
        const AUTH_EVENTS = [
            { name: 'ConsoleLogin',              client: ctUsEast1  }, // IAM user / root console login
            { name: 'ConsoleLogin',              client: ctRegional }, // Regional trail copy
            { name: 'AssumeRoleWithSAML',        client: ctUsEast1  }, // SAML federation (SSO)
            { name: 'AssumeRoleWithWebIdentity', client: ctUsEast1  }, // OIDC/web-identity federation
            { name: 'UserAuthentication',        client: ctUsEast1  }, // IAM Identity Center SSO
            { name: 'UserAuthentication',        client: ctRegional }, // Regional
        ];

        // Run all queries in parallel
        const results = await Promise.allSettled(AUTH_EVENTS.map(({ name, client }) =>
            client.send(new LookupEventsCommand({
                LookupAttributes: [{ AttributeKey: 'EventName', AttributeValue: name }],
                StartTime: startTime,
                MaxResults: 50
            }))
        ));

        // Collect and deduplicate events by EventId
        const seen = new Set();
        const logins = [];

        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const events = result.value.Events || [];
            for (const event of events) {
                if (seen.has(event.EventId)) continue;
                seen.add(event.EventId);
                try {
                    const ct = JSON.parse(event.CloudTrailEvent || '{}');
                    const uid = ct.userIdentity || {};
                    const eventName = event.EventName || '';

                    // Skip failures for AssumeRole events (only show successful auth)
                    if (eventName !== 'ConsoleLogin') {
                        const errorCode = ct.errorCode || ct.errorMessage;
                        if (errorCode) continue;
                    }

                    // Extract the best human-readable username depending on identity type
                    let username = uid.userName                                          // IAM user
                        || uid.sessionContext?.sessionIssuer?.userName                  // AssumedRole / SSO
                        || uid.principalId?.split(':')[1]                               // principalId fallback
                        || uid.arn?.split('/').pop()                                    // ARN tail
                        || 'Unknown';
                    let userType = uid.type || 'Unknown';
                    let accountId = uid.accountId || ct.recipientAccountId || '';
                    let roleName = uid.sessionContext?.sessionIssuer?.arn?.split('/').pop() || '';

                    // For SSO UserAuthentication events, prefer the onBehalfOf/user info
                    if (eventName === 'UserAuthentication') {
                        const req2 = ct.requestParameters || {};
                        username = req2.onBehalfOf || req2.username || username;
                        userType = 'SSO';
                    }

                    logins.push({
                        eventId: event.EventId,
                        eventName,
                        username,
                        userType: userType || 'Unknown',
                        roleName: roleName || null,
                        accountId,
                        time: event.EventTime,
                        sourceIp: event.SourceIpAddress || ct.sourceIPAddress || 'N/A',
                        region: ct.awsRegion || region,
                        success: eventName === 'ConsoleLogin'
                            ? ct.responseElements?.ConsoleLogin === 'Success'
                            : !ct.errorCode
                    });
                } catch (e) {
                    console.error('Error parsing CloudTrail event:', e.message);
                }
            }
        }

        // Sort by time descending (newest first)
        logins.sort((a, b) => new Date(b.time) - new Date(a.time));

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
    let costData = null;
    let budgetData = null;
    let tokenExpired = false;
    let errorLog = [];

    const dynamicClients = getAwsClients(req);
    const { costexplorer, budgets } = dynamicClients;

    // 1. Fetch Cost Explorer data
    try {
        const { start, end } = getCostDates();
        const ceResponse = await costexplorer.send(new GetCostAndUsageCommand({
            TimePeriod: { Start: start, End: end },
            Granularity: 'MONTHLY',
            Metrics: ['UnblendedCost']
        }));
        if (ceResponse.ResultsByTime?.length > 0) {
            const amount = ceResponse.ResultsByTime[0].Total?.UnblendedCost?.Amount;
            const unit   = ceResponse.ResultsByTime[0].Total?.UnblendedCost?.Unit;
            if (amount !== undefined) {
                costData = { amount: parseFloat(amount).toFixed(2), currency: unit || 'USD', isMock: false };
            }
        }
    } catch (err) {
        if (isTokenExpiredError(err)) {
            awsCredentialsExpired = true;
            return res.status(401).json({
                success: false,
                tokenExpired: true,
                profile: awsProfile,
                error: 'AWS credentials have expired.',
                loginCommand: `aws sso login --profile ${awsProfile}`,
                ssoStartUrl: 'https://view.awsapps.com/start'
            });
        }
        console.error('Cost Explorer query failed:', err.message);
        errorLog.push(`CE: ${err.message}`);
    }

    // 2. Fetch Budgets
    try {
        const config = getSSOConfig();
        const accountId = config.accountId || process.env.AWS_ACCOUNT_ID;
        if (accountId) {
            const bgResponse = await budgets.send(new DescribeBudgetsCommand({ AccountId: accountId }));
            if (bgResponse.Budgets?.length > 0) {
                const b = bgResponse.Budgets[0];
                budgetData = {
                    name:     b.BudgetName,
                    limit:    parseFloat(b.BudgetLimit?.Amount || 0).toFixed(2),
                    spent:    parseFloat(b.CalculatedSpend?.ActualSpend?.Amount || 0).toFixed(2),
                    currency: b.BudgetLimit?.Unit || 'USD',
                    isMock:   false
                };
            }
            // else: no budgets configured — budgetData stays null (that's correct)
        } else {
            errorLog.push('Budgets: Missing accountId for query');
        }
    } catch (err) {
        if (isTokenExpiredError(err)) {
            awsCredentialsExpired = true;
            // Cost Explorer already succeeded — just skip budgets
            errorLog.push('Budgets: token expired, skipped');
        } else {
            console.error('Budgets query failed:', err.message);
            errorLog.push(`Budgets: ${err.message}`);
        }
    }

    res.json({
        success: true,
        cost:    costData,   // null if CE failed for non-auth reason
        budget:  budgetData, // null if no budgets or fetch failed
        errors:  errorLog.length > 0 ? errorLog : null
    });
});

app.listen(port, () => {
    console.log(`AWS Dashboard backend running at http://localhost:${port}`);
    try {
        fs.writeFileSync(path.join(__dirname, '.server.pid'), process.pid.toString());
    } catch (e) {
        console.error("Failed to write .server.pid:", e);
    }
    loadTokensFromVault();
});
