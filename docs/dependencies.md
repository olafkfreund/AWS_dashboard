# Package and Environment Dependencies

This document details the dependencies of the AWS Status Dashboard, categorizing them by project scope, Node.js packages, and system-level tools.

## System-Level Tooling

These tools are provisioned declaratively through the Nix development shell to ensure consistency across developer platforms:

- **Node.js**: Version 22 (LTS runtime engine).
- **AWS CLI**: Version 2 (used for checking credentials and verifying authentication configurations via the command line).
- **Just**: Version 1 (command execution tool for running scripts, syntax checks, and starting local services).

---

## Node.js Application Dependencies

The application runs on the Express.js framework and utilizes modular clients from the AWS SDK for JavaScript (v3).

### Web Server
- **express**: Backend API routing and web server hosting.
- **cors**: Enables cross-origin resource sharing for communication between the frontend client and the backend proxy.

### AWS SDK Client Libraries (v3)
- **@aws-sdk/client-ec2**: Discovers running virtual machine instances, subnets, VPCs, NAT gateways, internet gateways, and Elastic IPs.
- **@aws-sdk/client-eks**: Lists and retrieves details for Amazon EKS Kubernetes clusters and node scaling configurations.
- **@aws-sdk/client-s3**: Lists S3 storage buckets.
- **@aws-sdk/client-lambda**: Retrieves function definitions and configurations.
- **@aws-sdk/client-cloudformation**: Monitors provisioned stacks and deployment status.
- **@aws-sdk/client-cloudtrail**: Audits active login history and ConsoleLogin events.
- **@aws-sdk/client-cost-explorer**: Queries daily and monthly resource spending totals.
- **@aws-sdk/client-budgets**: Retrieves budget limits, spend progress, and alerts.
- **@aws-sdk/client-iam**: Retrieves IAM roles, users, groups, and policies.
- **@aws-sdk/client-rds**: Discovers database instances and clusters.
- **@aws-sdk/client-dynamodb**: Discovers NoSQL tables.
- **@aws-sdk/client-ecr**: Lists container image repositories.
- **@aws-sdk/client-sns**: Lists pub/sub topics.
- **@aws-sdk/client-sqs**: Lists message queues.
- **@aws-sdk/client-secrets-manager**: Lists encrypted secrets.
- **@aws-sdk/client-elastic-load-balancing-v2**: Monitors Application/Network Load Balancers.
- **@aws-sdk/client-auto-scaling**: Tracks EC2 auto-scaling groups.
- **@aws-sdk/client-cloudwatch**: Discovers metric alarms.
- **@aws-sdk/client-route-53**: Discovers hosted DNS zones.
- **@aws-sdk/client-ssm**: Retrieves systems manager configuration parameters.
- **@aws-sdk/client-sso**: Authenticates sessions via AWS SSO.
- **@aws-sdk/client-sso-oidc**: Dynamic client registration and token flows.
- **@aws-sdk/credential-providers**: Provides INI credential resolution (fromIni) to monitor credentials files for changes without requiring server restarts.

### Model Context Protocol
- **@modelcontextprotocol/sdk**: Implements the stdio-based MCP server for integration with desktop AI clients like Claude Desktop.

---

## Development Dependencies

- **nodemon**: Automatically watches application files (`server.js`, `/public`, etc.) and restarts the Node process on save to simplify development.
