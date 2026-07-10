import json
import os
from datetime import datetime, timezone

def handler(event, context):
    """
    Minimal status dashboard web app served via Lambda Function URL.
    No API Gateway needed — Lambda URL provides a direct HTTPS endpoint.
    """
    path    = event.get("rawPath", "/")
    method  = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if path == "/health":
        return _json({"status": "ok", "timestamp": _now()})

    if path == "/api/status":
        return _json({
            "service": "SARC Portal Test App",
            "version": "1.0.0",
            "status": "running",
            "region": os.environ.get("AWS_REGION", "eu-west-2"),
            "runtime": context.function_name,
            "memory": f"{context.memory_limit_in_mb} MB",
            "timestamp": _now()
        })

    # Default: serve HTML dashboard
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SARC Portal Test App</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f1f5f9;
    }}
    .card {{
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 48px;
      max-width: 520px;
      width: 90%;
      text-align: center;
      backdrop-filter: blur(12px);
    }}
    .badge {{
      display: inline-block;
      background: #22c55e22;
      border: 1px solid #22c55e55;
      color: #4ade80;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 4px 12px;
      border-radius: 99px;
      text-transform: uppercase;
      margin-bottom: 20px;
    }}
    .dot {{
      display: inline-block;
      width: 8px; height: 8px;
      background: #22c55e;
      border-radius: 50%;
      margin-right: 6px;
      animation: pulse 1.5s infinite;
    }}
    @keyframes pulse {{
      0%,100% {{ opacity: 1; transform: scale(1); }}
      50% {{ opacity: .5; transform: scale(1.3); }}
    }}
    h1 {{ font-size: 28px; font-weight: 800; margin-bottom: 8px; }}
    p {{ color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }}
    .meta {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; text-align: left; }}
    .meta-item {{ background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px 16px; }}
    .meta-label {{ font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }}
    .meta-value {{ font-size: 13px; font-weight: 600; color: #e2e8f0; margin-top: 4px; font-family: monospace; }}
    .aws-badge {{ margin-top: 24px; font-size: 11px; color: #64748b; }}
    a {{ color: #60a5fa; text-decoration: none; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span>Running</div>
    <h1>SARC Test App</h1>
    <p>Minimal AWS Lambda web application deployed for portal testing.<br/>
       Running serverless — no EC2, no containers.</p>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Service</div>
        <div class="meta-value">AWS Lambda</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Region</div>
        <div class="meta-value">{os.environ.get("AWS_REGION", "eu-west-2")}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Deployed</div>
        <div class="meta-value">{_now()[:10]}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Status</div>
        <div class="meta-value" style="color:#4ade80">Healthy</div>
      </div>
    </div>
    <div class="aws-badge">
      Endpoints: <a href="/health">/health</a> &nbsp;|&nbsp; <a href="/api/status">/api/status</a>
    </div>
  </div>
</body>
</html>"""

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html; charset=utf-8"},
        "body": html
    }


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def _json(data, status=200):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data, indent=2)
    }
