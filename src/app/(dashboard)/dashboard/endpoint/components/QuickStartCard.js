"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Card, Button, SegmentedControl } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Icon from "@/shared/components/Icon";

const TABS = [
  { value: "curl", label: "cURL" },
  { value: "python", label: "Python" },
  { value: "node", label: "Node.js" },
  { value: "claude", label: "Claude Code" },
  { value: "ide", label: "Cursor / Cline" },
];

export default function QuickStartCard({
  baseUrl,
  gatewayUrl,
  activeKey,
}) {
  const [activeTab, setActiveTab] = useState("curl");
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testResult, setTestResult] = useState(null);
  const { copied, copy } = useCopyToClipboard();

  const targetUrl = gatewayUrl || baseUrl;
  const keyDisplay = activeKey || "YOUR_AXONROUTER_KEY";

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setTestResult(null);
    const t0 = performance.now();
    try {
      const headers = {};
      if (activeKey) {
        headers["Authorization"] = `Bearer ${activeKey}`;
      }
      const res = await fetch("/v1/models", { headers });
      const t1 = performance.now();
      const latency = Math.round(t1 - t0);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const count = Array.isArray(data?.data) ? data.data.length : null;
        setTestStatus("success");
        setTestResult({
          latency,
          count,
          message: count ? `${count} models available` : "Connected",
        });
      } else {
        setTestStatus("error");
        setTestResult({
          status: res.status,
          message: data?.error?.message || data?.error || `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      setTestStatus("error");
      setTestResult({
        message: err.message || "Connection failed",
      });
    }
  };

  const getCodeSnippet = () => {
    switch (activeTab) {
      case "curl":
        return `# 1. Test Endpoint Status & Models
curl -X GET "${targetUrl}/models" \\
  -H "Authorization: Bearer ${keyDisplay}"

# 2. Chat Completion
curl -X POST "${targetUrl}/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${keyDisplay}" \\
  -d '{
    "model": "auto/coding",
    "messages": [
      {"role": "user", "content": "Hello AxonRouter!"}
    ]
  }'`;

      case "python":
        return `from openai import OpenAI

client = OpenAI(
    base_url="${targetUrl}",
    api_key="${keyDisplay}",
)

response = client.chat.completions.create(
    model="auto/coding",
    messages=[
        {"role": "user", "content": "Hello AxonRouter!"}
    ],
)

print(response.choices[0].message.content)`;

      case "node":
        return `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${targetUrl}",
  apiKey: "${keyDisplay}",
});

const completion = await openai.chat.completions.create({
  model: "auto/coding",
  messages: [{ role: "user", content: "Hello AxonRouter!" }],
});

console.log(completion.choices[0].message.content);`;

      case "claude":
        return `# Export environment variables for Claude Code CLI
export ANTHROPIC_BASE_URL="${targetUrl}"
export ANTHROPIC_API_KEY="${keyDisplay}"

# Launch Claude Code
claude`;

      case "ide":
        return `# Cursor / Cline / Roo Code Settings:
#
# 1. API Provider: OpenAI Compatible
# 2. Base URL:     ${targetUrl}
# 3. API Key:      ${keyDisplay}
# 4. Model ID:     auto/coding (or any active provider combo)`;

      default:
        return "";
    }
  };

  const snippet = getCodeSnippet();

  return (
    <Card
      title="Client Integration"
      subtitle="Connect any OpenAI-compatible client, IDE extension, or CLI tool to AxonRouter"
      icon="terminal"
      action={
        <div className="flex items-center gap-2">
          {testStatus && (
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-mono font-medium border ${
                testStatus === "testing"
                  ? "bg-surface-3 text-text-muted border-border"
                  : testStatus === "success"
                  ? "bg-success/10 text-success border-success/30"
                  : "bg-danger/10 text-danger border-danger/30"
              }`}
            >
              {testStatus === "testing" && (
                <Icon name="progress_activity" size={14} className="animate-spin" />
              )}
              {testStatus === "success" && (
                <Icon name="check_circle" size={14} />
              )}
              {testStatus === "error" && (
                <Icon name="error" size={14} />
              )}
              <span>
                {testStatus === "testing" && "Pinging /v1/models…"}
                {testStatus === "success" &&
                  `${testResult.latency}ms · ${testResult.message}`}
                {testStatus === "error" &&
                  `Failed: ${testResult.message}`}
              </span>
            </div>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon="network_check"
            onClick={handleTestConnection}
            disabled={testStatus === "testing"}
            title="Send live test ping to /v1/models"
          >
            Test Connection
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Tab selection */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SegmentedControl
            options={TABS}
            value={activeTab}
            onChange={setActiveTab}
            size="touch"
            snap
            aria-label="Code snippet language"
          />
          <Button
            size="sm"
            variant="ghost"
            icon={copied === "quickstart_snippet" ? "check" : "content_copy"}
            onClick={() => copy(snippet, "quickstart_snippet")}
            className="text-xs"
          >
            {copied === "quickstart_snippet" ? "Copied Snippet!" : "Copy Snippet"}
          </Button>
        </div>

        {/* Code Block Container */}
        <div className="relative rounded-sm border border-border bg-bg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 bg-surface text-[11px] font-mono text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary/60 inline-block" />
              {activeTab === "curl" && "Bash / cURL"}
              {activeTab === "python" && "Python 3.8+ (openai>=1.0.0)"}
              {activeTab === "node" && "Node.js / Bun (openai)"}
              {activeTab === "claude" && "Claude Code CLI Shell Setup"}
              {activeTab === "ide" && "IDE Extension Configuration"}
            </span>
            <span>Target: {targetUrl}</span>
          </div>
          <pre className="p-3.5 text-xs font-mono text-text-main overflow-x-auto leading-relaxed custom-scrollbar selection:bg-primary/20">
            <code>{snippet}</code>
          </pre>
        </div>

        <p className="text-[11px] text-text-muted font-mono">
          Tip: AxonRouter supports streaming (SSE), JSON mode, function calling, tool use, and multi-turn chat for all configured upstream providers.
        </p>
      </div>
    </Card>
  );
}

QuickStartCard.propTypes = {
  baseUrl: PropTypes.string.isRequired,
  gatewayUrl: PropTypes.string,
  activeKey: PropTypes.string,
};
