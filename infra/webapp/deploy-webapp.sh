#!/usr/bin/env bash
# deploy-webapp.sh — Deploy the SARC test Lambda web app
# Usage: bash infra/webapp/deploy-webapp.sh
set -euo pipefail

REGION="eu-west-2"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
FUNCTION_NAME="sarc-portal-test-webapp"
ROLE_NAME="sarc-portal-lambda-role"
ZIP_FILE="/tmp/sarc-webapp.zip"

echo "==> Account: $ACCOUNT_ID  Region: $REGION"

# ---- 1. Create IAM Role (idempotent) ----
echo "==> Creating/checking IAM role: $ROLE_NAME"
TRUST_POLICY='{
  "Version":"2012-10-17",
  "Statement":[{
    "Effect":"Allow",
    "Principal":{"Service":"lambda.amazonaws.com"},
    "Action":"sts:AssumeRole"
  }]
}'
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null || true)
if [ -z "$ROLE_ARN" ]; then
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --tags '[{"Key":"Project","Value":"AWS-Dashboard"},{"Key":"Environment","Value":"test"}]' \
    --query 'Role.Arn' --output text)
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "    Created role: $ROLE_ARN"
  echo "    Waiting 10s for IAM propagation..."
  sleep 10
else
  echo "    Role already exists: $ROLE_ARN"
fi

# ---- 2. Package Lambda ----
echo "==> Packaging Lambda function"
cd "$(dirname "$0")"
zip -q "$ZIP_FILE" handler.py
echo "    Packaged: $ZIP_FILE ($(wc -c < "$ZIP_FILE") bytes)"
cd - >/dev/null

# ---- 3. Create or update Lambda function ----
echo "==> Deploying Lambda: $FUNCTION_NAME"
EXISTS=$(aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'Configuration.FunctionName' --output text 2>/dev/null || true)

if [ -z "$EXISTS" ]; then
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime python3.12 \
    --handler handler.handler \
    --zip-file "fileb://$ZIP_FILE" \
    --role "$ROLE_ARN" \
    --timeout 10 \
    --memory-size 128 \
    --region "$REGION" \
    --tags 'Project=AWS-Dashboard,Environment=test' \
    --output table
  echo "    Waiting for function to be Active..."
  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
else
  echo "    Function exists — updating code"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$REGION" \
    --output table
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
fi

# ---- 4. Add / ensure Function URL (free HTTPS endpoint, no API Gateway) ----
echo "==> Setting up Function URL"
URL_CONFIG=$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'FunctionUrl' --output text 2>/dev/null || true)

if [ -z "$URL_CONFIG" ]; then
  URL_CONFIG=$(aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","HEAD"]}' \
    --region "$REGION" \
    --query 'FunctionUrl' --output text)

  # Allow public invocation via the URL (requires ~15s propagation)
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --action lambda:InvokeFunctionUrl \
    --principal '*' \
    --statement-id allow-public-invoke \
    --function-url-auth-type NONE \
    --region "$REGION" \
    --output table
fi

echo ""
echo "==> Waiting 20s for IAM permission propagation..."
sleep 20

# Verify the URL is reachable (retry up to 5 times)
HEALTH_URL="${URL_CONFIG}health"
for i in 1 2 3 4 5; do
  HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 10 "$HEALTH_URL" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "==> Health check passed (attempt $i): $HEALTH_URL"
    break
  else
    echo "    Attempt $i: HTTP $HTTP_CODE — retrying in 10s..."
    sleep 10
  fi
done

echo ""
echo "================================================================"
echo " ✅  SARC Test Web App deployed!"
echo "================================================================"
echo " Function:  $FUNCTION_NAME"
echo " Region:    $REGION"
echo " URL:       $URL_CONFIG"
echo " Health:    ${URL_CONFIG}health"
echo " Status:    ${URL_CONFIG}api/status"
echo ""
echo " Cost:  ~\$0.00/mo at test volumes (free tier: 1M req/mo)"
echo "================================================================"
