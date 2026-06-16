# Contributing to AWS Status Dashboard

Thank you for your interest in contributing! Below are guidelines to help you get started with contributing code, documentations, or bug reports to this repository.

## Development Setup

We use Nix and `devenv` to manage development dependencies cleanly.

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Olaf-KrasickiFreund_syne/AWS_dashboard.git
   cd AWS_dashboard
   ```

2. **Load DevShell**:
   Ensure Nix is installed and run:
   ```bash
   nix develop   # Or use `devenv shell`
   ```
   *Note: If you have `direnv` configured, it will load Node.js and AWS CLI automatically on directory entry.*

3. **Install Packages**:
   ```bash
   npm install
   ```

4. **Launch Local Servers**:
   - Web application backend proxy:
     ```bash
     node server.js
     ```
   - MCP Server:
     ```bash
     node mcp_server.js
     ```

## Workflow and Pull Requests

1. **Create a Branch**:
   Use descriptive branch names (e.g., `feat/add-metrics` or `fix/auth-cookie`).
2. **Commit Conventions**:
   Follow Conventional Commits (e.g. `feat: ...`, `fix: ...`, `chore: ...`).
3. **Open a Pull Request**:
   Fill out the provided PR template. Make sure tests pass locally before opening.
