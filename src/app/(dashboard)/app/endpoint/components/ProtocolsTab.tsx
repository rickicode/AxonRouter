"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import AppIcon from "@/shared/components/AppIcon";

function ProtocolBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className="font-mono uppercase tracking-[0.04em]">
      {children}
    </Badge>
  );
}

type ProtocolStatus = {
  id: string;
  label: string;
  status?: string;
  handshake?: string;
  runtimeFlow?: string;
  toolCount?: number;
  transport?: string[];
  capabilities?: string[];
};

export default function ProtocolsTab() {
  const [protocols, setProtocols] = useState<ProtocolStatus[]>([]);

  useEffect(() => {
    fetch("/api/protocols/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setProtocols(data.protocols || []))
      .catch(() => setProtocols([]));
  }, []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Protocol Interop</CardTitle>
            <CardDescription>
              Operational overview for MCP and A2A compatibility surfaces. MCP now reads from the final /api/mcp/* runtime while the legacy protocol namespace remains available as a compat shim.
            </CardDescription>
          </div>
          <CardAction>
            <Button asChild size="sm" variant="secondary">
              <a href="/app/mcp">Open MCP Runtime</a>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary" className="uppercase tracking-[0.18em]">
            Protocol runtime
          </Badge>
        </CardContent>
      </Card>

      {protocols.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia><AppIcon name="hub" /></EmptyMedia>
            <EmptyTitle>No protocol runtimes reported</EmptyTitle>
            <EmptyDescription>MCP and A2A runtime status will appear here after the status endpoint reports available surfaces.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        protocols.map((protocol) => {
          const transports = protocol.transport || [];
          const capabilities = protocol.capabilities || [];

          return (
            <Card key={protocol.id}>
              <CardHeader>
                <div>
                  <CardTitle>{protocol.label}</CardTitle>
                  <CardDescription>Handshake: {protocol.handshake || "unknown"}</CardDescription>
                </div>
                <CardAction>
                  <Badge variant={protocol.status === "ready" ? "default" : "secondary"}>{protocol.status}</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-foreground">Runtime flow</span>
                      <div>{protocol.runtimeFlow || "unknown"}</div>
                    </div>
                    {protocol.toolCount !== undefined ? (
                      <div>
                        <span className="font-semibold text-foreground">Tool count</span>
                        <div>{protocol.toolCount}</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0 rounded-[4px] border border-border bg-muted/40 px-4 py-3 text-sm md:max-w-sm">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {transports.length > 0 ? transports.map((transport) => (
                        <ProtocolBadge key={transport}>{transport}</ProtocolBadge>
                      )) : <ProtocolBadge>no transport</ProtocolBadge>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {capabilities.length > 0 ? capabilities.map((capability) => (
                        <Badge key={capability} variant="secondary">
                          {capability}
                        </Badge>
                      )) : (
                        <Badge variant="secondary">no capabilities</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
