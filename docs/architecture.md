# System Architecture & WebMCP

This document details the backend proxy model, the WebMCP integration layer, and the static fallback mechanism.

## High-Level Overview

Due to browser sandboxing, static client-side web pages cannot read local AWS credentials (e.g. `~/.aws/credentials`). To circumvent this securely, the project implements a hybrid proxy architecture:

```
┌──────────────────┐               ┌──────────────────┐               ┌──────────────┐
│  Client Browser  │ ────────────> │ Node.js Backend  │ ────────────> │   AWS API    │
│  (index.html)    │ <──────────── │    (server.js)   │ <──────────── │  (EC2/Trail) │
└──────────────────┘               └──────────────────┘               └──────────────┘
         │
         │ WebMCP (navigator.modelContext)
         ▼
┌──────────────────┐
│  Browser Agent   │
│ (Claude/Gemini)  │
└──────────────────┘
```

1. **Node.js Backend Proxy (`server.js`)**: Runs locally, authenticates using the `Synechron` AWS profile via the AWS SDK, and exposes two core endpoints:
   - `/api/resources`: Fetching EC2 instance statuses.
   - `/api/logins`: Fetching recent console logins from CloudTrail.
2. **Frontend Client (`public/index.html`)**: Fetches data from the local proxy, renders the glassmorphic dashboard, and registers browser tools.
3. **WebMCP Bridge (`mcp-bridge.js`)**: Declares and registers client-side tools with browser agents so that the agent can retrieve current dashboard telemetry.

---

## WebMCP Implementation

The frontend utilizes the `navigator.modelContext.registerTool` function to register tools that the browser's AI agent can call. This is declared dynamically:

```javascript
navigator.modelContext.registerTool({
  name: "get_aws_resources",
  description: "Retrieve active running EC2 instances from the AWS status dashboard.",
  execute: async () => {
    return JSON.stringify(window.dashboardState.resources);
  }
});
```

---

## Static Pages Demo Mode

To showcase this application without requiring a running backend proxy (e.g. on GitHub Pages), the client detects if it is hosted on `github.io` or runs from a local `file://` protocol. 

When **Demo Mode** is activated:
- The global `window.fetch` is intercepted.
- Calls to `/api/resources` and `/api/logins` are intercepted and serve realistic mock telemetry.
- An orange **"GitHub Pages Demo"** badge appears next to the title.
- The built-in assistant chatbot falls back to local simulated responses unless a GitHub Personal Access Token is saved in the **Settings** tab to access the live GitHub Models API.
