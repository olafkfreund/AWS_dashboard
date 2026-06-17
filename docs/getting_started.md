# Getting Started and Troubleshooting Guide

This guide provides setup instructions and solutions for common issues encountered when running the AWS Status Dashboard.

## Getting Started

### Prerequisites

Ensure you have the following installed on your host system:
- **Nix** (with flakes enabled) or a manual installation of **Node.js 22** and **AWS CLI v2**.
- An active AWS account with a profile named `Synechron` configured in `~/.aws/config`.

---

### Setup Instructions

1. **Clone the Repository and Navigate to the Directory**:
   ```bash
   git clone <repository_url>
   cd AWS_dashboard
   ```

2. **Load the Development Environment**:
   If using Nix with direnv:
   ```bash
   direnv allow
   ```
   Otherwise, enter the devshell manually:
   ```bash
   nix develop
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Authenticate with AWS SSO**:
   Refresh your AWS credentials for the `Synechron` profile:
   ```bash
   just login
   ```
   Complete the verification in your browser window.

5. **Start the Dashboard Backend**:
   - To run in the background:
     ```bash
     just start
     ```
   - To run in the foreground with nodemon hot-reloads:
     ```bash
     just dev
     ```

6. **Access the Portal**:
   Open your browser and navigate to:
   ```
   http://localhost:8889/
   ```
   If you do not have an active session, you will be redirected to the login page. Click **Verify Active AWS SSO Session** to authenticate.

---

## Troubleshooting Common Issues

### 1. AWS Credentials Expired Error
* **Symptom**: Red banners show up on the dashboard stating `The security token included in the request is expired`, or API calls return `tokenExpired: true`.
* **Cause**: The temporary STS credentials in `~/.aws/credentials` under the `[Synechron]` profile have expired.
* **Resolution**:
  1. Open your terminal and run `just login`.
  2. Complete the authentication prompt in your browser.
  3. Return to the portal and refresh the page. The backend uses the `fromIni` credential provider, which automatically detects updates to your credentials file—**no server restart is required**.
  4. If you were logged out completely, navigate to `/login.html` and click **Verify Active AWS SSO Session**.

### 2. GitHub or GitLab SSO Buttons are Disabled
* **Symptom**: The GitHub and GitLab buttons on `/login.html` are greyed out and show "GitHub/GitLab Auth is not configured".
* **Cause**: These login methods require registering an OAuth App on your target provider and configuring the Client ID and Secret in your configuration.
* **Resolution**:
  1. Authenticate using the **AWS SSO** login method first to access the dashboard.
  2. Navigate to the **Settings** tab.
  3. Input your OAuth Application Client ID and Secret.
  4. Click **Save all to .envrc**. The server dynamically loads these values into memory and writes them to the environment config, enabling the buttons on your next logout.

### 3. Port Conflict (Error: listen EADDRINUSE)
* **Symptom**: The backend server fails to start and outputs a port conflict error.
* **Cause**: A background instance of the server is already running (e.g., started via `just start`).
* **Resolution**:
  Kill the background server using the Justfile command before starting development mode:
  ```bash
  just stop
  just dev
  ```

### 4. No EKS Clusters or Resources Displayed
* **Symptom**: The AWS Overview page loads successfully, but displays "No Amazon EKS clusters exist".
* **Cause**: Your current AWS profile session does not have resources in the `eu-west-2` region (which is hardcoded for the Synechron portal profile).
* **Resolution**:
  Verify that your active AWS CLI profile is showing the correct identity and region:
  ```bash
  aws sts get-caller-identity --profile Synechron
  aws eks list-clusters --profile Synechron --region eu-west-2
  ```
