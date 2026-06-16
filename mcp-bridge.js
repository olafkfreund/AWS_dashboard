#!/usr/bin/env node
const http = require('http');
const crypto = require('crypto');
const readline = require('readline');

// Configuration
const PORT = 8765;
let activeSocket = null;
let socketBuffer = Buffer.alloc(0);

// Initialize Stdio Interface for Local AI Clients
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// Create HTTP Server to handle WebSocket Upgrade
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebMCP Fallback Bridge Server is running.\n');
});

server.on('upgrade', (req, socket) => {
    if (req.headers['upgrade'] !== 'websocket') {
        socket.destroy();
        return;
    }

    const key = req.headers['sec-websocket-key'];
    const acceptKey = crypto.createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: ' + acceptKey + '\r\n\r\n'
    );

    activeSocket = socket;
    socketBuffer = Buffer.alloc(0);
    console.error('[Bridge] Browser dashboard connected via WebSocket.');

    socket.on('data', (data) => {
        socketBuffer = Buffer.concat([socketBuffer, data]);
        socketBuffer = parseFrames(socketBuffer, (message) => {
            // Forward browser message to local AI client via stdout
            process.stdout.write(message + '\n');
        });
    });

    socket.on('close', () => {
        console.error('[Bridge] Browser dashboard disconnected.');
        activeSocket = null;
    });

    socket.on('error', (err) => {
        console.error('[Bridge] Socket error:', err.message);
        socket.destroy();
    });
});

// Read incoming JSON-RPC from Local AI Client (stdin) and forward to Browser (WebSocket)
rl.on('line', (line) => {
    if (!line.trim()) return;
    
    // Intercept client config request locally if no browser is connected
    if (line.includes('tools/list') && !activeSocket) {
        // Return empty list of tools if browser is not connected
        process.stdout.write(JSON.stringify({
            jsonrpc: '2.0',
            id: JSON.parse(line).id,
            result: { tools: [] }
        }) + '\n');
        return;
    }

    if (activeSocket) {
        sendFrame(activeSocket, line);
    } else {
        console.error('[Bridge] Cannot forward request: No browser dashboard connected.');
    }
});

// WebSocket Protocol Helper: Send text frame
function sendFrame(socket, payload) {
    const buf = Buffer.from(payload);
    const len = buf.length;
    let header;
    if (len <= 125) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = len;
    } else if (len <= 65535) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    try {
        socket.write(Buffer.concat([header, buf]));
    } catch (e) {
        console.error('[Bridge] Failed to write frame to socket:', e.message);
    }
}

// WebSocket Protocol Helper: Parse incoming frames
function parseFrames(buffer, onMessage) {
    let offset = 0;
    while (offset < buffer.length) {
        if (buffer.length - offset < 2) break;
        const byte1 = buffer[offset];
        const byte2 = buffer[offset + 1];
        const fin = (byte1 & 0x80) !== 0;
        const opcode = byte1 & 0x0f;
        const masked = (byte2 & 0x80) !== 0;
        let payloadLen = byte2 & 0x7f;

        let headerLen = 2;
        if (payloadLen === 126) {
            if (buffer.length - offset < 4) break;
            payloadLen = buffer.readUInt16BE(offset + 2);
            headerLen = 4;
        } else if (payloadLen === 127) {
            if (buffer.length - offset < 10) break;
            payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
            headerLen = 10;
        }

        let maskBytes = null;
        if (masked) {
            if (buffer.length - offset < headerLen + 4) break;
            maskBytes = buffer.subarray(offset + headerLen, offset + headerLen + 4);
            headerLen += 4;
        }

        if (buffer.length - offset < headerLen + payloadLen) break;
        const rawPayload = buffer.subarray(offset + headerLen, offset + headerLen + payloadLen);

        const payload = Buffer.alloc(payloadLen);
        if (masked) {
            for (let i = 0; i < payloadLen; i++) {
                payload[i] = rawPayload[i] ^ maskBytes[i % 4];
            }
        } else {
            rawPayload.copy(payload);
        }

        offset += headerLen + payloadLen;

        if (opcode === 1) { // Text frame
            onMessage(payload.toString('utf8'));
        } else if (opcode === 8) { // Close
            activeSocket = null;
        }
    }
    return buffer.subarray(offset);
}

// Start Bridge Server
server.listen(PORT, () => {
    console.error(`[Bridge] WebMCP Fallback Bridge Server listening on port ${PORT}`);
});
