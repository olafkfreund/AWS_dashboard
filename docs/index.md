# AWS Status Dashboard

Welcome to the technical documentation for the **AWS Status Dashboard**. 

This project provides a modern, responsive, and interactive dashboard for monitoring AWS resources, featuring the emerging WebMCP standard to expose cloud telemetry directly to browser-based AI agents.

## Key Features

- **EC2 Resource Monitoring**: Displays active running EC2 instances with details like instance ID, type, and public/private IP addresses.
- **CloudTrail Login Audit**: Displays console logins from the last 24 hours, classifying users and roles, and displaying source IPs.
- **WebMCP Integration**: Native browser tools registered using `navigator.modelContext.registerTool` to enable browser-based LLM agents to query AWS resources on your behalf.
- **Dynamic Demo Mode**: Detects static environments (such as GitHub Pages) and falls back to mock telemetry with interactive chatbot simulation for a zero-setup preview.
- **NixOS DevShell**: Reproducible development shell managed via `devenv` and Nix flakes.
- **Containerized Build**: Optimized Docker build using multi-stage builds and Node.js Alpine.

## Quickstart (Local Development)

To run the dashboard locally:

1. **Enter Development Shell**:
   ```bash
   nix develop   # Or direct via devenv shell
   ```
2. **Start Backend Server**:
   ```bash
   npm install
   node server.js
   ```
3. **Open Browser**:
   Navigate to `http://localhost:8889`.
