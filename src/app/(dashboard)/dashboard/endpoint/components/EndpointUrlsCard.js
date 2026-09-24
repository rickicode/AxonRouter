"use client";

import PropTypes from "prop-types";
import { Card, Button, Badge } from "@/shared/components";
import Icon from "@/shared/components/Icon";

export default function EndpointUrlsCard({
  baseUrl,
  gatewayUrl,
  copied,
  onCopy,
}) {
  const statusChip = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs px-2.5 py-1 rounded-sm font-medium border flex items-center gap-1.5 bg-success/10 text-success border-success/30">
        <span className="relative flex size-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full size-2 bg-success" />
        </span>
        ACTIVE
      </span>
    </div>
  );

  return (
    <Card
      title="API Endpoints"
      subtitle="OpenAI-compatible base URLs for local applications, IDE agents, and remote clients"
      icon="api"
      action={statusChip}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Gateway Endpoint (Recommended) */}
        {gatewayUrl && (
          <div className="flex flex-col justify-between rounded-lg border border-primary/30 bg-primary/[0.03] p-4 gap-3 relative overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary border border-primary/20">
                  <Icon name="bolt" size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-semibold text-text-main">
                      Gateway Endpoint
                    </h4>
                  </div>
                  <p className="text-[11px] font-mono text-text-muted">
                    Port 3778 · High Performance
                  </p>
                </div>
              </div>
              <Badge variant="primary" size="sm" dot className="font-semibold uppercase tracking-wider text-[10px]">
                Recommended
              </Badge>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Dedicated streaming reverse proxy with zero GC pauses. Optimized for high-throughput coding agents, CLI tools, and background tasks.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2.5 sm:px-3 sm:py-2">
              <code className="font-mono text-xs sm:text-sm text-text-main break-all select-all sm:truncate">
                {gatewayUrl}
              </code>
              <Button
                size="sm"
                variant="secondary"
                icon={copied === "gateway_url" ? "check" : "content_copy"}
                onClick={() => onCopy(gatewayUrl, "gateway_url")}
                className="shrink-0 text-xs w-full sm:w-auto"
                aria-label={copied === "gateway_url" ? "Copied Gateway URL" : "Copy Gateway URL"}
              >
                {copied === "gateway_url" ? "Copied!" : "Copy"}
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-1 border-t border-border/40">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary inline-block" />
                OpenAI v1 Spec
              </span>
              <span>SSE Streaming Enabled</span>
            </div>
          </div>
        )}

        {/* Direct Dashboard Endpoint */}
        <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-4 gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-3 text-text-muted border border-border">
                <Icon name="dns" size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-sm font-semibold text-text-main">
                    Direct Endpoint
                  </h4>
                </div>
                <p className="text-[11px] font-mono text-text-muted">
                  Port 3777 · Dashboard Runtime
                </p>
              </div>
            </div>
            <Badge variant="default" size="sm" className="font-semibold uppercase tracking-wider text-[10px]">
              Standard
            </Badge>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Direct route through the Next.js application server. Convenient for single-port deployments or reverse proxies that forward to port 3777.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-sm border border-border bg-bg p-2.5 sm:px-3 sm:py-2">
            <code className="font-mono text-xs sm:text-sm text-text-main break-all select-all sm:truncate">
              {baseUrl}
            </code>
            <Button
              size="sm"
              variant="secondary"
              icon={copied === "local_url" ? "check" : "content_copy"}
              onClick={() => onCopy(baseUrl, "local_url")}
              className="shrink-0 text-xs w-full sm:w-auto"
              aria-label={copied === "local_url" ? "Copied Direct URL" : "Copy Direct URL"}
            >
              {copied === "local_url" ? "Copied!" : "Copy"}
            </Button>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-text-muted pt-1 border-t border-border/40">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-text-muted inline-block" />
              OpenAI v1 Spec
            </span>
            <span>Single-Port Route</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

EndpointUrlsCard.propTypes = {
  baseUrl: PropTypes.string.isRequired,
  gatewayUrl: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};
