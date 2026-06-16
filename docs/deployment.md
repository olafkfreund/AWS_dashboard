# Deployment & Docker Containerization

This document details how to package the AWS Status Dashboard into a production-ready Docker image.

## Container Architecture

The dashboard is packaged using a multi-stage `Dockerfile`:
1. **Builder Stage**: Uses Node.js Alpine to copy dependency specs and install production dependencies via `npm ci --omit=dev`.
2. **Runner Stage**: Copy dependencies and codes into a clean runtime container, exposing port `3000`.

---

## Build Image

To build the Docker image locally:

```bash
docker build -t aws-status-dashboard:latest .
```

---

## Run Image

To run the container, you must map your local AWS credentials so that the backend proxy can read the `Synechron` profile.

### Option 1: Map local AWS Configuration (Recommended)

Mount your `~/.aws` directory into the container:

```bash
docker run -d \
  -p 3000:3000 \
  -v "$HOME/.aws:/root/.aws:ro" \
  -e AWS_PROFILE=Synechron \
  --name aws-dashboard \
  aws-status-dashboard:latest
```

### Option 2: Provide Explicit Environment Keys

If you do not want to mount local configuration, pass explicit credentials directly:

```bash
docker run -d \
  -p 3000:3000 \
  -e AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE \
  -e AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  -e AWS_DEFAULT_REGION=us-east-1 \
  --name aws-dashboard \
  aws-status-dashboard:latest
```

---

## Accessing the Dashboard

Once the container is running:
- Open your browser and go to `http://localhost:3000`.
- Log in and verify EC2 resources and CloudTrail events.
