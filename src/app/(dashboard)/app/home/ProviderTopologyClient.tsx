"use client";

import { useMemo, useCallback, useRef } from "react";
import {
  ReactFlow,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { fetchJson } from "@/shared/query";

function getProviderConfig(providerId: string) {
  return (AI_PROVIDERS as Record<string, any>)[providerId] || { color: "#6366f1", name: providerId };
}

function getStatus(provider: any): "active" | "error" | "idle" {
  if (provider.error || provider.status === "error") return "error";
  if (provider.enabled === false || provider.status === "idle") return "idle";
  return "active";
}

// Custom provider node
function ProviderNode({ data }: { data: any }) {
  const { label, color, iconName, textIcon, status } = data;
  const statusColor = status === "active" ? "#22c55e" : status === "error" ? "#ef4444" : "#6b7280";

  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border bg-card px-4 py-3 shadow-sm"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
        minWidth: "160px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
        style={{ backgroundColor: `${color}15` }}
      >
        {iconName ? (
          <ProviderIcon
            src={iconName}
            alt={label}
            size={24}
            className="rounded-sm"
            fallbackText={textIcon}
            fallbackColor={color}
          />
        ) : (
          <span className="text-sm font-bold" style={{ color }}>{textIcon}</span>
        )}
      </div>

      <span className="truncate text-sm font-semibold text-foreground">
        {label}
      </span>

      <span
        className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: statusColor }}
      />
    </div>
  );
}

// Center router node
function RouterNode({ data }: { data: any }) {
  return (
    <div className="flex min-w-[144px] items-center justify-center rounded-lg border border-primary/30 bg-primary/5 px-5 py-3 shadow-sm">
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <ProviderIcon src="/axonrouter-logo-mark.svg" alt="AxonRouter" size={24} className="mr-2 size-6 object-contain" fallbackText="AR" fallbackColor="hsl(var(--primary))" />
      <span className="text-sm font-bold text-primary">AxonRouter</span>
      {data.providerCount > 0 && (
        <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
          {data.providerCount}
        </span>
      )}
    </div>
  );
}

const nodeTypes = { provider: ProviderNode, router: RouterNode };

function buildLayout(providers: any[]) {
  const nodeW = 180;
  const nodeH = 30;
  const routerW = 120;
  const routerH = 44;
  const nodeGap = 24;
  const count = providers.length;

  if (count === 0) {
    return {
      nodes: [{ id: "router", type: "router" as const, position: { x: 0, y: 0 }, data: { providerCount: 0 }, draggable: false }],
      edges: [],
    };
  }

  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(320, minRx);
  const ry = Math.max(200, rx * 0.55);

  const nodes: any[] = [];
  const edges: any[] = [];

  nodes.push({
    id: "router",
    type: "router",
    position: { x: -routerW / 2, y: -routerH / 2 },
    data: { providerCount: count },
    draggable: false,
  });

  providers.forEach((p, i) => {
    const providerId = p.provider || p.id || "";
    const config = getProviderConfig(providerId);
    const status = getStatus(p);
    const nodeId = `provider-${providerId}`;

    const data = {
      label: config.name || p.name || providerId,
      color: config.color || "#6366f1",
      iconName: providerId,
      textIcon: (config as any).textIcon || (providerId || "?").slice(0, 2).toUpperCase(),
      status,
    };

    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    const cx = rx * Math.cos(angle);
    const cy = ry * Math.sin(angle);

    let sourceHandle: string;
    let targetHandle: string;
    if (Math.abs(angle + Math.PI / 2) < Math.PI / 4 || Math.abs(angle - 3 * Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "top"; targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom"; targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right"; targetHandle = "left";
    } else {
      sourceHandle = "left"; targetHandle = "right";
    }

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
      data,
      draggable: false,
    });

    const edgeColor = status === "active" ? "#22c55e" : status === "error" ? "#ef4444" : (config.color || "#6366f1");
    edges.push({
      id: `e-${nodeId}`,
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: status === "active",
      style: {
        stroke: edgeColor,
        strokeWidth: status === "active" ? 2 : 1.5,
        opacity: status === "active" ? 0.9 : 0.35,
      },
    });
  });

  return { nodes, edges };
}

export default function ProviderTopologyClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["providers-topology"],
    queryFn: ({ signal }) => fetchJson<{ connections?: any[]; totalRequests?: number }>("/api/providers", { signal }),
  });

  const providers = useMemo(() => {
    const connections = data?.connections || [];
    const seen = new Set<string>();
    return connections.filter((c: any) => {
      const id = c.provider || c.id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [data]);

  const totalProviders = providers.length;
  const activeConnections = providers.filter((p: any) => getStatus(p) === "active").length;
  const totalRequests = (data as any)?.totalRequests ?? 0;

  const { nodes, edges } = useMemo(() => buildLayout(providers), [providers]);

  const providersKey = useMemo(
    () => providers.map((p: any) => p.provider || p.id).sort().join(","),
    [providers]
  );

  const rfInstance = useRef<any>(null);
  const onInit = useCallback((instance: any) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.3 }), 50);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Providers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{totalProviders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Connections</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{activeConnections}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">{totalRequests}</p>
          </CardContent>
        </Card>
      </div>

      {/* Topology visualization */}
      <div className="w-full overflow-hidden rounded-lg border border-border bg-card shadow-sm" style={{ height: 520 }}>
        {providers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No providers connected. Add providers to see the topology.
          </div>
        ) : (
          <ReactFlow
            key={providersKey}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            onInit={onInit}
            proOptions={{ hideAttribution: true }}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
          />
        )}
      </div>
    </div>
  );
}
