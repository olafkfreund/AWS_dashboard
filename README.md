# AWS Dashboard with WebMCP

A modern, clean, and interactive static dashboard for monitoring AWS resources, featuring the emerging WebMCP standard to expose data directly to browser-based AI agents (like Claude, Gemini, and Copilot extensions).

## Features
- **Running Resources**: Automatically lists all running EC2 instances using the local AWS profile.
- **Recent Logins**: Pulls CloudTrail data to show who has successfully logged into the AWS console in the last 24 hours.
- **WebMCP Enabled**: Uses `navigator.modelContext.registerTool` to declare browser tools that LLMs can invoke.
- **Premium Design**: Built with Tailwind CSS, featuring glassmorphism, dark mode, and micro-animations.

## Requirements
- Node.js installed.
- Valid AWS credentials in `~/.aws/credentials` under the `[Synechron]` profile.
- The IAM user/role needs permissions for:
  - `ec2:DescribeInstances`
  - `cloudtrail:LookupEvents`

## How to Run

1. Navigate to this directory:
   ```bash
   cd /home/olafkfreund/Source/Calitti/AWS_dashboard
   ```

2. Start the backend proxy server:
   ```bash
   node server.js
   ```

3. Open your browser and go to:
   ```
   http://localhost:8889
   ```

## Why this Architecture?
Due to browser security sandboxing, a static HTML page cannot natively read your local `~/.aws/credentials` file. 

To solve this securely:
1. We run a lightweight **Node.js backend proxy** (`server.js`) that securely uses the AWS SDK and your local `Synechron` profile.
2. It serves the **static frontend page** (`public/index.html`).
3. The frontend fetches data from the proxy and then uses **WebMCP** to expose this data to browser AI extensions.
