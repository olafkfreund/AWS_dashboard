// Huginn MCP Bridge & OAuth Proxy
// Bridges stdio to WebSocket, and handles secure GitLab OAuth token exchange.

const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const PORT = 8765;

// --- Load .env File (Zero Dependency Parser) ---
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = val;
  });
  console.error('[Bridge] Loaded local .env file.');
} else {
  console.error('[Bridge] Warning: No .env file found. Copy .env.example to .env and fill in credentials.');
}

const CLIENT_ID = process.env.GITLAB_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET || '';
const GITLAB_URL = process.env.GITLAB_URL || 'https://gitlab.com';

// --- HTTP Server for OAuth Proxy & Config ---
const server = createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // GET /config - Exposes the Client ID and GitLab URL to the client-side app
  if (req.method === 'GET' && req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      client_id: CLIENT_ID,
      gitlab_url: GITLAB_URL
    }));
    return;
  }

  // POST /oauth/exchange - Securely exchanges the temporary code for an access token
  if (req.method === 'POST' && req.url === '/oauth/exchange') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { code, redirect_uri } = JSON.parse(body);
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing authorization code' }));
          return;
        }

        if (!CLIENT_ID || !CLIENT_SECRET) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'OAuth credentials not configured in bridge .env' }));
          return;
        }

        console.error('[Bridge] Exchanging authorization code for token...');
        const response = await fetch(`${GITLAB_URL}/oauth/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirect_uri
          })
        });

        const data = await response.json();
        if (data.error) {
          console.error('[Bridge] GitLab OAuth exchange failed:', data.error_description || data.error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: data.error_description || data.error }));
        } else {
          console.error('[Bridge] OAuth exchange successful!');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
          }));
        }
      } catch (err) {
        console.error('[Bridge] Error during OAuth exchange:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error during OAuth exchange' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// --- WebSocket Server for WebMCP Bridge ---
const wss = new WebSocketServer({ noServer: true });
let browserSocket = null;
const pendingRequests = new Map();

// Integrate WS upgrade with our HTTP server
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws) => {
  console.error('[Bridge] Browser tab connected!');
  browserSocket = ws;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.id !== undefined && pendingRequests.has(data.id)) {
        const originalId = data.id;
        const response = pendingRequests.get(originalId);
        pendingRequests.delete(originalId);

        sendToStdout({
          jsonrpc: '2.0',
          id: originalId,
          result: data.result,
          error: data.error
        });
      }
    } catch (err) {
      console.error('[Bridge] Error parsing browser message:', err.message);
    }
  });

  ws.on('close', () => {
    console.error('[Bridge] Browser tab disconnected.');
    if (browserSocket === ws) {
      browserSocket = null;
    }
  });
});

// Start listening
server.listen(PORT, () => {
  console.error(`[Bridge] Unified Server listening on http://localhost:${PORT}`);
});

// --- stdio MCP Interface ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const request = JSON.parse(line);
    handleClientRequest(request);
  } catch (err) {
    console.error('[Bridge] Error parsing stdin JSON:', err.message);
    sendToStdout({
      jsonrpc: '2.0',
      error: { code: -32700, message: 'Parse error' }
    });
  }
});

function handleClientRequest(req) {
  const { method, id, params } = req;

  if (method === 'initialize') {
    sendToStdout({
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'huginn-mcp-bridge',
          version: '1.0.0'
        }
      }
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (!browserSocket) {
    sendToStdout({
      jsonrpc: '2.0',
      id: id,
      error: { 
        code: -32603, 
        message: 'No browser tab connected. Please open Huginn portal in your browser.' 
      }
    });
    return;
  }

  pendingRequests.set(id, req);
  browserSocket.send(JSON.stringify({
    jsonrpc: '2.0',
    method: method,
    id: id,
    params: params
  }));
}

function sendToStdout(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}
