"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import Link from "@/lib/ui/link.jsx";
import { Card, Button, Badge, Modal, CardSkeleton } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { formatTokens } from "@/shared/utils/formatTokens";
import { AI_PROVIDERS } from "@/shared/constants/providers";

const emptySubscribe = () => () => {};

const fmt = (n) => new Intl.NumberFormat().format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;

export default function OverviewTab({
  stats,
  connections = [],
  keys = [],
  loading = false,
  period = "24h",
  onSwitchToEndpoint,
}) {
  const { copied, copy } = useCopyToClipboard();
  const [selectedError, setSelectedError] = useState(null);

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const baseUrl = isClient && typeof window !== "undefined"
    ? `${window.location.origin}/v1`
    : "/v1";

  // Top Providers: aggregate from stats.byProvider and sort by highest requests
  const topProviders = useMemo(() => {
    if (!stats?.byProvider) return [];
    const list = Object.entries(stats.byProvider)
      .map(([providerId, data]) => {
        const requests = data.requests || 0;
        const failed = data.failedRequests || 0;
        const success = Math.max(0, requests - failed);
        const rate = requests > 0 ? ((success / requests) * 100).toFixed(1) : "100";
        const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
        const provConfig = AI_PROVIDERS[providerId];
        return {
          id: providerId,
          name: provConfig?.name || providerId,
          color: provConfig?.color,
          requests,
          failed,
          successRate: Number(rate),
          totalTokens,
          cost: data.cost || 0,
        };
      })
      .filter((p) => p.requests > 0)
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    return list;
  }, [stats]);

  // Fallback active providers if no usage exists yet
  const configuredProviders = useMemo(() => {
    const active = connections.filter((c) => c.isActive !== false);
    const seen = new Set();
    const list = [];
    for (const c of active) {
      const pid = c.provider || "unknown";
      if (!seen.has(pid)) {
        seen.add(pid);
        list.push({
          id: pid,
          name: AI_PROVIDERS[pid]?.name || c.name || pid,
          color: AI_PROVIDERS[pid]?.color,
          accountCount: active.filter((x) => x.provider === pid).length,
        });
      }
    }
    return list.slice(0, 5);
  }, [connections]);

  // Top Models: aggregate from stats.byModel, sorted by requests & high success rate
  const topModels = useMemo(() => {
    if (!stats?.byModel) return [];
    const list = Object.entries(stats.byModel)
      .map(([key, data]) => {
        const requests = data.requests || 0;
        const failed = data.failedRequests || 0;
        const success = Math.max(0, requests - failed);
        const rate = requests > 0 ? ((success / requests) * 100).toFixed(1) : "100";
        const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);

        // Derive clean model name and provider id
        let modelName = data.rawModel;
        let providerId = data.provider;
        if (!modelName) {
          const match = key.match(/^(.*) \((.*)\)$/);
          if (match) {
            modelName = match[1];
            if (!providerId) providerId = match[2];
          } else {
            const parts = key.split("|");
            modelName = parts[0];
            if (!providerId && parts[1]) providerId = parts[1];
          }
        }

        const provConfig = AI_PROVIDERS[providerId];
        return {
          key,
          modelName: modelName || key,
          providerId: providerId || "unknown",
          providerName: provConfig?.name || providerId || "Gateway Router",
          requests,
          failed,
          successRate: Number(rate),
          totalTokens,
        };
      })
      .filter((m) => m.requests > 0)
      .sort((a, b) => {
        if (b.requests !== a.requests) return b.requests - a.requests;
        return b.successRate - a.successRate;
      })
      .slice(0, 5);

    return list;
  }, [stats]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <CardSkeleton />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  const activeKey = keys.find((k) => k.isActive !== false)?.key || keys[0]?.key || "";
  const maskedKey = activeKey
    ? `${activeKey.slice(0, 7)}...${activeKey.slice(-4)}`
    : "No API key created";

  const totalReq = stats?.totalRequests || 0;
  const failedReq = stats?.totalFailedRequests || 0;
  const successRate = totalReq > 0
    ? (((totalReq - failedReq) / totalReq) * 100).toFixed(1)
    : "100";

  const periodLabel = period === "today" ? "Today" : period === "7d" ? "7 Days" : "24 Hours";
  const recentRequests = (stats?.recentRequests || []).slice(0, 8);

  const curlCommand = `curl -X POST ${baseUrl}/chat/completions \\
  -H "Authorization: Bearer ${activeKey || "YOUR_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "auto", "messages": [{"role": "user", "content": "Hello"}]}'`;

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Quick Connect Endpoints */}
      <Card
        title="Quick Connect"
        subtitle="OpenAI-compatible connection URLs and active credentials"
        icon="link"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Main API Endpoint */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3.5 gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                  <Icon name="api" size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-text-main">Base Endpoint URL</h4>
                  <p className="text-[10px] text-text-muted">Standard OpenAI /v1 compatibility</p>
                </div>
              </div>
              <Badge variant="primary" size="sm">OpenAI v1</Badge>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2">
              <code className="font-mono text-xs text-text-main truncate select-all">{baseUrl}</code>
              <Button
                size="xs"
                variant="secondary"
                icon={copied === "base_url" ? "check" : "content_copy"}
                onClick={() => copy(baseUrl, "base_url")}
                className="shrink-0 min-h-9 min-w-9 sm:min-h-7 sm:min-w-7 px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs"
                aria-label={copied === "base_url" ? "Copied Base URL" : "Copy Base URL"}
              >
                {copied === "base_url" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Active API Key */}
          <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-3.5 gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  <Icon name="key" size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-text-main">Default API Key</h4>
                  <p className="text-[10px] text-text-muted">{keys.length} key(s) configured</p>
                </div>
              </div>
              {onSwitchToEndpoint ? (
                <button
                  type="button"
                  onClick={onSwitchToEndpoint}
                  className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5 focus-visible:outline-none cursor-pointer"
                >
                  Manage
                  <Icon name="arrow_forward" size={18} />
                </button>
              ) : (
                <Link
                  href="/dashboard?tab=endpoint"
                  className="text-[11px] font-medium text-primary hover:underline flex items-center gap-0.5"
                >
                  Manage
                  <Icon name="arrow_forward" size={18} />
                </Link>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2">
              <code className="font-mono text-xs text-text-main truncate select-all">
                {maskedKey}
              </code>
              <Button
                size="xs"
                variant="secondary"
                disabled={!activeKey}
                icon={copied === "api_key" ? "check" : "content_copy"}
                onClick={() => copy(activeKey, "api_key")}
                className="shrink-0 min-h-9 min-w-9 sm:min-h-7 sm:min-w-7 px-3 py-1.5 sm:px-2.5 sm:py-1 text-xs"
                aria-label={copied === "api_key" ? "Copied API key" : "Copy API key"}
              >
                {copied === "api_key" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Requests */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Requests ({periodLabel})
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-3 text-text-main">
              <Icon name="swap_horiz" size={18} />
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {fmt(totalReq)}
            </span>
            <span className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
              <span className={failedReq > 0 ? "text-warning font-medium" : "text-success font-medium"}>
                {successRate}%
              </span>
              <span>success</span>
            </span>
          </div>
        </div>

        {/* Input Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Input Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <Icon name="input" size={18} />
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalPromptTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Prompt payload</span>
          </div>
        </div>

        {/* Output Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Output Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <Icon name="output" size={18} />
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalCompletionTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Completion payload</span>
          </div>
        </div>

        {/* Cached Tokens */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Cached Tokens
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Icon name="database" size={18} />
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {formatTokens(stats?.totalCachedTokens || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">Prompt cache hits</span>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="flex min-w-0 flex-col justify-between rounded-lg border border-border bg-surface px-3 py-2.5 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted truncate">
              Estimated Cost
            </span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <Icon name="payments" size={18} />
            </span>
          </div>
          <div className="mt-1 flex min-w-0 flex-col">
            <span className="text-lg font-semibold tabular-nums text-text-main font-mono">
              {fmtCost(stats?.totalCost || 0)}
            </span>
            <span className="text-[11px] text-text-muted mt-0.5">{periodLabel} usage</span>
          </div>
        </div>
      </div>

      {/* 3. Two-Column Analytics: Top Providers & Top Models */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top Providers */}
        <Card
          title="Top Providers"
          subtitle={`Most active upstream providers in ${periodLabel.toLowerCase()}`}
          icon="dns"
          action={
            <Link
              href="/dashboard/providers"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              All Providers
              <Icon name="arrow_forward" size={18} />
            </Link>
          }
        >
          {topProviders.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topProviders.map((prov, idx) => (
                <Link
                  key={prov.id}
                  href={`/dashboard/providers/${prov.id}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors min-w-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-xs font-mono text-text-muted w-4 shrink-0 text-center">
                      {idx + 1}
                    </span>
                    <div className="size-7 shrink-0 rounded flex items-center justify-center bg-surface-3">
                      <ProviderIcon providerId={prov.id} alt={prov.name} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-main truncate">{prov.name}</p>
                      <p className="text-[10px] text-text-muted font-mono truncate">
                        {formatTokens(prov.totalTokens)} tokens
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-semibold font-mono text-text-main">
                        {fmt(prov.requests)}
                      </span>
                      <p className="text-[10px] text-text-muted">reqs</p>
                    </div>
                    <Badge
                      variant={prov.successRate >= 95 ? "success" : prov.successRate >= 80 ? "warning" : "error"}
                      size="sm"
                      dot
                    >
                      {prov.successRate.toFixed(1)}%
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          ) : configuredProviders.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-text-muted mb-1">
                No request volume yet in this period. Configured providers ready for traffic:
              </p>
              {configuredProviders.map((prov) => (
                <Link
                  key={prov.id}
                  href={`/dashboard/providers/${prov.id}`}
                  className="flex items-center justify-between gap-2.5 p-2 rounded-lg border border-border bg-surface hover:bg-surface-2 transition-colors min-w-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="size-6 shrink-0 rounded flex items-center justify-center bg-surface-3">
                      <ProviderIcon providerId={prov.id} alt={prov.name} size={18} />
                    </div>
                    <span className="text-xs font-medium text-text-main truncate">{prov.name}</span>
                  </div>
                  <Badge variant="default" size="sm">
                    {prov.accountCount} account{prov.accountCount > 1 ? "s" : ""}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border rounded-lg bg-surface-2/40">
              <Icon className="text-3xl text-text-muted mb-2" name="dns" size={18} />
              <p className="text-xs font-medium text-text-main">No active providers</p>
              <p className="text-[11px] text-text-muted mt-1 mb-3 max-w-xs">
                Connect OpenAI, Claude, Kiro, Codex, or local models to start routing.
              </p>
              <Link href="/dashboard/providers">
                <Button size="sm" variant="primary" icon="add">Add Provider</Button>
              </Link>
            </div>
          )}
        </Card>

        {/* Top Models */}
        <Card
          title="Top Models"
          subtitle="Models with high volume and high success rate"
          icon="smart_toy"
          action={
            <Link
              href="/dashboard/usage"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              Model Analytics
              <Icon name="arrow_forward" size={18} />
            </Link>
          }
        >
          {topModels.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topModels.map((model, idx) => (
                <div
                  key={model.key}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border bg-surface min-w-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-xs font-mono text-text-muted w-4 shrink-0 text-center">
                      {idx + 1}
                    </span>
                    <div className="size-7 shrink-0 rounded flex items-center justify-center bg-surface-3">
                      <ProviderIcon providerId={model.providerId} alt={model.providerName} size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-text-main truncate font-mono">
                        {model.modelName}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-text-muted">
                        <span className="truncate">{model.providerName}</span>
                        <span>•</span>
                        <span className="font-mono">{formatTokens(model.totalTokens)} tok</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-semibold font-mono text-text-main">
                        {fmt(model.requests)}
                      </span>
                      <p className="text-[10px] text-text-muted">calls</p>
                    </div>
                    <Badge
                      variant={model.successRate >= 95 ? "success" : model.successRate >= 80 ? "warning" : "error"}
                      size="sm"
                      dot
                    >
                      {model.successRate.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-border rounded-lg bg-surface-2/40">
              <Icon className="text-3xl text-text-muted mb-2" name="model_training" size={18} />
              <p className="text-xs font-medium text-text-main">No model traffic recorded yet</p>
              <p className="text-[11px] text-text-muted mt-1 max-w-xs">
                Route requests to /v1 using your tools or combos to populate model performance.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* 4. Recent Requests Stream with Error Inspection */}
      <Card
        title="Recent Requests"
        subtitle="Live traffic routed through the gateway (click failed row to inspect error)"
        icon="history"
        action={
          <Link
            href="/dashboard/usage"
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            Usage Logs
            <Icon name="arrow_forward" size={18} />
          </Link>
        }
      >
        {recentRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center border border-dashed border-border rounded-lg bg-surface-2/30">
            <Icon className="text-3xl text-text-muted mb-2" name="swap_calls" size={18} />
            <p className="text-xs font-medium text-text-main">No recent requests recorded</p>
            <p className="text-[11px] text-text-muted mt-1 mb-3 max-w-sm">
              Send a request to {baseUrl} using your favorite coding tool or test with cURL below.
            </p>
            <Button
              size="xs"
              variant="secondary"
              icon={copied === "test_curl" ? "check" : "terminal"}
              onClick={() => copy(curlCommand, "test_curl")}
              className="min-h-9 px-3 py-1.5 text-xs"
              aria-label="Copy test curl command"
            >
              {copied === "test_curl" ? "Copied test cURL!" : "Copy Test cURL"}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse" aria-label="Recent gateway requests">
              <thead>
                <tr className="border-b border-border text-text-muted text-[10px] uppercase font-mono tracking-wider">
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2.5">Model</th>
                  <th className="py-2 px-2.5">Provider</th>
                  <th className="py-2 px-2.5 text-right">Tokens</th>
                  <th className="py-2 px-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentRequests.map((req, idx) => {
                  const isOk = req.status === "ok";
                  const time = req.timestamp
                    ? new Date(req.timestamp).toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })
                    : "—";

                  const totalT = (req.promptTokens || 0) + (req.completionTokens || 0);

                  return (
                    <tr
                      key={`${req.timestamp}-${idx}`}
                      onClick={!isOk ? () => setSelectedError(req) : undefined}
                      className={`transition-colors ${
                        !isOk
                          ? "hover:bg-danger/5 cursor-pointer"
                          : "hover:bg-surface-2/60"
                      }`}
                      title={!isOk ? "Click to inspect failure reason" : undefined}
                    >
                      <td className="py-2 px-2.5 font-mono text-text-muted whitespace-nowrap text-[11px]">
                        {time}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-text-main truncate max-w-[180px]">
                        {req.model || "unknown"}
                      </td>
                      <td className="py-2 px-2.5 text-text-muted truncate max-w-[120px]">
                        {req.provider || "—"}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono tabular-nums text-text-main">
                        {formatTokens(totalT)}
                      </td>
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <Badge
                          variant={isOk ? "success" : "error"}
                          size="sm"
                          dot
                          className={!isOk ? "cursor-pointer" : undefined}
                        >
                          {isOk ? "200 OK" : req.status || "Failed"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Error Inspection Modal */}
      {selectedError && (
        <Modal
          isOpen={!!selectedError}
          onClose={() => setSelectedError(null)}
          title="Request Failure Details"
          size="md"
        >
          <div className="flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-surface p-2.5 rounded-sm border border-border">
              <div>
                <span className="text-[10px] uppercase font-mono text-text-muted">Model</span>
                <p className="font-semibold text-text-main mt-0.5">{selectedError.model || "unknown"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-text-muted">Provider</span>
                <p className="font-semibold text-text-main mt-0.5">{selectedError.provider || "unknown"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-text-muted">Status</span>
                <p className="font-semibold text-danger mt-0.5">{selectedError.status || "Error"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono text-text-muted">Time</span>
                <p className="font-mono text-text-main mt-0.5">
                  {selectedError.timestamp && !isNaN(new Date(selectedError.timestamp).getTime())
                    ? new Date(selectedError.timestamp).toLocaleString("en-US")
                    : "—"}
                </p>
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-mono text-text-muted block mb-1">
                Upstream Error Message
              </span>
              <pre className="p-3 bg-bg border border-border rounded-sm font-mono text-[11px] text-danger whitespace-pre-wrap break-all max-h-48 overflow-y-auto custom-scrollbar select-all">
                {typeof selectedError.error === "object"
                  ? JSON.stringify(selectedError.error, null, 2)
                  : String(selectedError.error || "No detailed upstream error message returned.")}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <Link
                href="/dashboard/usage"
                className="text-primary hover:underline text-xs font-medium"
              >
                Inspect in Usage Logs →
              </Link>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedError(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

OverviewTab.propTypes = {
  stats: PropTypes.object,
  connections: PropTypes.array,
  keys: PropTypes.array,
  loading: PropTypes.bool,
  period: PropTypes.string,
  onSwitchToEndpoint: PropTypes.func,
};
