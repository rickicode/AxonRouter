// Clean, non-generic, responsive landing page for the dedicated API Gateway port (3778).
//
// Explains clearly to browser visitors that this port is a machine-to-machine
// streaming API endpoint, NOT a browsing destination. Does not link or expose
// the dashboard path.

export function renderGatewayLandingHtml({ mode = "cluster", workers = 1, port = 3778 } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Gateway Endpoint</title>
  <meta name="robots" content="noindex, nofollow">
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(17, 24, 39, 0.75);
      --border: rgba(255, 255, 255, 0.08);
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --text: #f1f5f9;
      --muted: #94a3b8;
      --subtle: #475569;
      --code-bg: rgba(15, 23, 42, 0.9);
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(56, 189, 248, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(99, 102, 241, 0.06) 0px, transparent 50%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      line-height: 1.5;
    }
    .container {
      width: 100%;
      max-width: 580px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
      padding: 2.25rem;
      position: relative;
      overflow: hidden;
    }
    .container::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent), transparent);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 12px var(--success);
      animation: pulse 2s infinite ease-in-out;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.9); }
    }
    .badge {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      background: var(--accent-glow);
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      border: 1px solid rgba(56, 189, 248, 0.2);
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 0.6rem;
    }
    p.desc {
      color: var(--muted);
      font-size: 0.925rem;
      margin-bottom: 1.75rem;
    }
    .notice-box {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 10px;
      padding: 0.85rem 1rem;
      margin-bottom: 1.75rem;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
    }
    .notice-icon {
      color: #ef4444;
      font-weight: bold;
      font-size: 1.1rem;
      line-height: 1.2;
    }
    .notice-text {
      color: #fca5a5;
      font-size: 0.825rem;
      line-height: 1.4;
    }
    .section-title {
      font-size: 0.775rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--subtle);
      font-weight: 700;
      margin-bottom: 0.65rem;
    }
    .endpoint-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 1.75rem;
    }
    .endpoint-item {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .endpoint-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.825rem;
      color: var(--accent);
    }
    .endpoint-method {
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.05);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .footer {
      border-top: 1px solid var(--border);
      padding-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--subtle);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    @media (max-width: 480px) {
      .container { padding: 1.5rem; }
      h1 { font-size: 1.2rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="status-dot"></div>
      <span class="badge">API Gateway</span>
    </div>
    <h1>Machine-to-Machine Gateway</h1>
    <p class="desc">
      This service is a high-throughput API gateway dedicated to streaming inference traffic (OpenAI & Anthropic protocols). It does not serve human-interactive web pages.
    </p>

    <div class="notice-box">
      <span class="notice-icon">✕</span>
      <div class="notice-text">
        <strong>Not a browsing destination</strong><br>
        Direct browser navigation to root (<code>/</code>) returns this notice. Configure your AI coding tools, agents, or API clients to send HTTP POST requests directly to the endpoints below.
      </div>
    </div>

    <div class="section-title">Acceptable Client Protocols</div>
    <div class="endpoint-list">
      <div class="endpoint-item">
        <span class="endpoint-path">/v1/chat/completions</span>
        <span class="endpoint-method">POST</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-path">/v1/messages</span>
        <span class="endpoint-method">POST</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-path">/v1/models</span>
        <span class="endpoint-method">GET</span>
      </div>
      <div class="endpoint-item">
        <span class="endpoint-path">/api/health</span>
        <span class="endpoint-method">GET</span>
      </div>
    </div>

    <div class="footer">
      <span>Service: Active</span>
      <span>Port: ${port}</span>
      <span>Topology: ${mode} (${workers}w)</span>
    </div>
  </div>
</body>
</html>`;
}
