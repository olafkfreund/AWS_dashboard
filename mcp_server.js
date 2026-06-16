#!/usr/bin/env node
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
const { CloudTrailClient, LookupEventsCommand } = require("@aws-sdk/client-cloudtrail");
const { fromIni } = require("@aws-sdk/credential-providers");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

// Load environment variables from SARC .envrc on startup if we are running in the repo context
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
                    let val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                    val = val.replace(/\$([a-zA-Z0-9_]+)/g, (match, varName) => {
                        return process.env[varName] || '';
                    });
                    process.env[key] = val;
                }
            }
        });
    }
} catch (e) {
    console.error('Error parsing .envrc for env vars:', e);
}

// AWS Configuration using the "Synechron" SSO profile
const awsConfig = {
    credentials: fromIni({ profile: 'Synechron' }),
    region: process.env.AWS_REGION || 'us-east-1'
};

const ec2Client = new EC2Client(awsConfig);
const cloudtrailClient = new CloudTrailClient(awsConfig);

// Create MCP Server
const server = new Server({
    name: "aws-status-dashboard-mcp-server",
    version: "1.0.0"
}, {
    capabilities: {
        tools: {}
    }
});

// Register List Tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_ec2_instances",
                description: "Query active, running EC2 instances from the AWS Synechron profile.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "list_console_logins",
                description: "Retrieve console logins from CloudTrail for the past 24 hours.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            },
            {
                name: "trigger_sso_login",
                description: "Run 'aws sso login' locally to refresh expired AWS SSO credentials for the Synechron profile.",
                inputSchema: {
                    type: "object",
                    properties: {}
                }
            }
        ]
    };
});

// Register Call Tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    
    try {
        if (name === "list_ec2_instances") {
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
            
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ count: instances.length, instances }, null, 2)
                }]
            };
        }
        
        if (name === "list_console_logins") {
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
                        // Skip parsing error events
                    }
                });
            }
            
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({ count: logins.length, logins }, null, 2)
                }]
            };
        }
        
        if (name === "trigger_sso_login") {
            return new Promise((resolve) => {
                exec('aws sso login --profile Synechron', (error, stdout, stderr) => {
                    if (error) {
                        resolve({
                            content: [{
                                type: "text",
                                text: `Failed to trigger AWS SSO Login: ${error.message}\nStderr: ${stderr}`
                            }],
                            isError: true
                        });
                    } else {
                        resolve({
                            content: [{
                                type: "text",
                                text: "AWS SSO Login triggered successfully. Check your browser to complete verification."
                            }]
                        });
                    }
                });
            });
        }
        
        throw new Error(`Tool not found: ${name}`);
    } catch (error) {
        return {
            content: [{
                type: "text",
                text: `Error executing tool: ${error.message}`
            }],
            isError: true
        };
    }
});

// Run Server
async function run() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

run().catch((error) => {
    console.error("Fatal error running MCP Server:", error);
    process.exit(1);
});
