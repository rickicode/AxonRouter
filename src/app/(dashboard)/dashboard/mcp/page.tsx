"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppIcon from "@/shared/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { fetchJson, queryKeys } from "@/shared/query";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button variant="ghost" size="icon-xs" className="absolute right-2 top-2" onClick={() => copy(text)} title="Copy">
      <AppIcon name={copied ? "check" : "copy"} size={14} />
    </Button>
  );
}

function buildMcpUrl() {
  if (typeof window === "undefined") return `${DEFAULT_AXONROUTER_BASE_URL}/api/mcp/stream`;
  return `${window.location.origin}/api/mcp/stream`;
}

function buildMcpSseUrl() {
  if (typeof window === "undefined") return `${DEFAULT_AXONROUTER_BASE_URL}/api/mcp/sse`;
  return `${window.location.origin}/api/mcp/sse`;
}

function getStdioConfigs() {
  return [
    {
      id: "claude",
      label: "Claude Code",
      file: "~/.claude/config.json",
      hint: "Or run: claude mcp add axonrouter npx axonrouter-mcp",
      config: `{
  "mcpServers": {
    "axonrouter": {
      "command": "npx",
      "args": ["axonrouter-mcp"]
    }
  }
}`,
    },
    {
      id: "vscode",
      label: "VS Code / Cursor",
      file: ".vscode/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "command": "npx",
      "args": ["axonrouter-mcp"]
    }
  }
}`,
    },
    {
      id: "codex",
      label: "Codex",
      file: "~/.codex/config.toml",
      hint: "Or run: codex mcp add axonrouter npx \"axonrouter-mcp\"",
      config: `[mcp_servers.axonrouter]
command = "npx"
args = ["axonrouter-mcp"]`,
    },
    {
      id: "pi",
      label: "Pi Agent",
      file: "~/.pi/agent/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "type": "stdio",
      "command": "npx",
      "args": ["axonrouter-mcp"],
      "disabled": false,
      "directTools": true
    }
  }
}`,
    },
    {
      id: "kiro",
      label: "Kiro",
      file: ".kiro/settings/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "command": "npx",
      "args": ["axonrouter-mcp"]
    }
  }
}`,
    },
  ];
}

function getHttpConfigs(mcpUrl: string) {
  return [
    {
      id: "claude",
      label: "Claude Code",
      file: "~/.claude/config.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "url": "${mcpUrl}"
    }
  }
}`,
    },
    {
      id: "vscode",
      label: "VS Code / Cursor",
      file: ".vscode/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "url": "${mcpUrl}"
    }
  }
}`,
    },
    {
      id: "codex",
      label: "Codex",
      file: "~/.codex/config.toml",
      hint: null,
      config: `[mcp_servers.axonrouter]
url = "${mcpUrl}"`,
    },
    {
      id: "pi",
      label: "Pi Agent",
      file: "~/.pi/agent/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "type": "http",
      "url": "${mcpUrl}",
      "disabled": false,
      "directTools": true
    }
  }
}`,
    },
    {
      id: "kiro",
      label: "Kiro",
      file: ".kiro/settings/mcp.json",
      hint: null,
      config: `{
  "mcpServers": {
    "axonrouter": {
      "url": "${mcpUrl}"
    }
  }
}`,
    },
  ];
}

export default function McpPage() {
  const [mode, setMode] = useState<"local" | "remote">("local");
  const [activeClient, setActiveClient] = useState("claude");
  const [mcpUrl, setMcpUrl] = useState(buildMcpUrl);
  const [mcpSseUrl] = useState(buildMcpSseUrl);

  const toolsQuery = useQuery({
    queryKey: queryKeys.mcpRuntime(),
    queryFn: ({ signal }) => fetchJson<{ tools?: any[] }>("/api/mcp/tools", { signal, cache: "no-store" }).catch(() => ({ tools: [] })),
  });
  const tools = toolsQuery.data?.tools || [];

  const configs = mode === "local" ? getStdioConfigs() : getHttpConfigs(mcpUrl);
  const selectedConfig = configs.find((c) => c.id === activeClient) || configs[0];

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-main)]">MCP Server</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Let your coding agent control AxonRouter — check quota, switch combos, and manage routing directly from your editor.
        </p>
      </div>

      {/* Connection mode */}
      <Card className="border-border/60 p-0">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-main)]">Connection mode</h2>
        </div>
        <CardContent className="flex flex-col gap-3 p-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "local" | "remote")}>
            <TabsList>
              <TabsTrigger value="local">Local (stdio)</TabsTrigger>
              <TabsTrigger value="remote">Remote (HTTP)</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-[var(--color-text-muted)]">
            {mode === "local"
              ? "Each client spawns its own MCP server process. Best when AxonRouter runs on the same machine as your editor."
              : "All clients connect to this AxonRouter instance via HTTP. Use when AxonRouter runs on a remote server or you want a single shared MCP endpoint."}
          </p>
          {mode === "remote" && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">Streamable HTTP:</span>
                <code className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-main)]">{mcpUrl}</code>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">SSE:</span>
                <code className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] px-3 py-1.5 font-mono text-xs text-[var(--color-text-main)]">{mcpSseUrl}</code>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Config per client */}
      <Card className="border-border/60 p-0">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text-main)]">Setup guide</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Add this config to your tool, then restart it.</p>
        </div>
        <div className="p-4">
          <Tabs value={activeClient} onValueChange={setActiveClient}>
            <TabsList>
              {configs.map((cfg) => (
                <TabsTrigger key={cfg.id} value={cfg.id}>{cfg.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              File: <code className="rounded bg-[var(--color-bg-alt)] px-1.5 py-0.5">{selectedConfig.file}</code>
            </p>
            <div className="relative">
              <pre className="overflow-auto rounded border border-[var(--color-border)] bg-[var(--color-bg-alt)] p-4 pr-10 font-mono text-xs text-[var(--color-text-main)]">{selectedConfig.config}</pre>
              <CopyButton text={selectedConfig.config} />
            </div>
            {selectedConfig.hint && <p className="text-xs text-[var(--color-text-muted)]">{selectedConfig.hint}</p>}
          </div>
        </div>
      </Card>

      {/* Available tools */}
      <Card className="border-border/60 p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <AppIcon name="terminal" size={15} className="text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-main)]">Available tools</h2>
          </div>
          <Badge variant="secondary">{tools.length} tools</Badge>
        </div>
        {tools.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">Connect a client to load the tool inventory.</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--color-bg)]">
                <tr className="border-b border-[var(--color-border)]/60 text-xs text-[var(--color-text-muted)]">
                  <th className="px-4 py-2 font-medium">Tool</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.name} className="border-b border-[var(--color-border)]/40 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-[var(--color-text-main)]">{tool.name}</td>
                    <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{tool.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
