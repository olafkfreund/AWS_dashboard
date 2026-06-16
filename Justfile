default:
    @just --list

# Start the AWS Dashboard proxy server in the background
start:
    #!/usr/bin/env bash
    if [ -f .server.pid ] && kill -0 $(cat .server.pid) 2>/dev/null; then
        echo "Server is already running (PID: $(cat .server.pid))"
    else
        # We start node server.js in background and capture PID
        nohup node server.js > server.log 2>&1 &
        echo $! > .server.pid
        echo "Server started in background (PID: $(cat .server.pid), logs: server.log)"
    fi

# Stop the AWS Dashboard proxy server
stop:
    #!/usr/bin/env bash
    if [ -f .server.pid ]; then
        PID=$(cat .server.pid)
        if kill -0 $PID 2>/dev/null; then
            echo "Stopping server (PID: $PID)..."
            kill $PID
            for i in {1..10}; do
                if ! kill -0 $PID 2>/dev/null; then
                    rm -f .server.pid
                    echo "Server stopped successfully."
                    exit 0
                fi
                sleep 0.5
            done
            echo "Server did not stop. Force killing (PID: $PID)..."
            kill -9 $PID
        fi
        rm -f .server.pid
    else
        echo "No server running (no .server.pid found)."
    fi

# Run the server in the foreground
run:
    node server.js

# Run with nodemon — auto-reloads server.js on changes (no manual restart needed)
dev:
    #!/usr/bin/env bash
    if [ -f .server.pid ] && kill -0 $(cat .server.pid) 2>/dev/null; then
        echo "Stopping background server (PID: $(cat .server.pid)) before starting dev mode..."
        just stop
    fi
    source .envrc 2>/dev/null || true
    ./node_modules/.bin/nodemon \
        --watch server.js \
        --watch public/ \
        --ext js,json,html \
        --ignore 'node_modules/*' \
        --ignore '.sessions.json' \
        --ignore 'server.log' \
        server.js

# Refresh AWS SSO credentials
login:
    aws sso login --profile Synechron

# Display backend server logs
logs:
    tail -n 50 -f server.log

# Show status of the server
status:
    #!/usr/bin/env bash
    if [ -f .server.pid ] && kill -0 $(cat .server.pid) 2>/dev/null; then
        echo "Server is RUNNING (PID: $(cat .server.pid))"
    else
        echo "Server is STOPPED"
    fi

# Run syntax check on Javascript files
check:
    node --check server.js mcp_server.js compile.js mcp-bridge.js

# Deploy the Lambda test web app to AWS (idempotent)
deploy-webapp:
    bash infra/webapp/deploy-webapp.sh

# Create the minimal EKS test cluster (~15 min)
eks-create:
    eksctl create cluster -f infra/eks/cluster.yaml

# Delete the EKS test cluster and all its resources
eks-delete:
    eksctl delete cluster -f infra/eks/cluster.yaml --disable-nodegroup-eviction

# Show EKS cluster status
eks-status:
    eksctl get cluster --name sarc-portal-test --region eu-west-2
