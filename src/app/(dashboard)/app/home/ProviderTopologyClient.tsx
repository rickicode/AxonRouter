"use client";

import { useMemo, useCallback, useRef } from "react";
import { ReactFlow, Handle, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { fetchJson, queryKeys } from "@/shared/query";

function getProviderConfig(providerId: string) {
	return (
		(AI_PROVIDERS as Record<string, any>)[providerId] || {
			color: "#6366f1",
			name: providerId,
		}
	);
}

// Custom provider node — with pulsing dot + transitions matching usage page
function ProviderNode({ data }: { data: any }) {
	const { label, color, iconName, textIcon, active } = data;
	return (
		<div
			className="flex items-center gap-2.5 rounded-[4px] border px-4 py-3 transition-colors duration-300 bg-[color:color-mix(in_srgb,var(--color-surface-strong)_88%,white_12%)] shadow-[var(--shadow-soft)] backdrop-blur-xl"
			style={{
				borderColor: active
					? color
					: `color-mix(in srgb, ${color} 38%, var(--color-border))`,
				boxShadow: active
					? `0 0 0 1px ${color}22, 0 14px 38px ${color}18`
					: "var(--shadow-soft)",
				minWidth: "150px",
			}}
		>
			<Handle
				type="target"
				position={Position.Top}
				id="top"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="target"
				position={Position.Bottom}
				id="bottom"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="target"
				position={Position.Left}
				id="left"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="target"
				position={Position.Right}
				id="right"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>

			<div
				className="flex h-8 w-8 shrink-0 items-center justify-center rounded"
				style={{
					backgroundColor: `${color}15`,
					boxShadow: `inset 0 0 0 1px ${color}22`,
				}}
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
					<span className="text-sm font-bold" style={{ color }}>
						{textIcon}
					</span>
				)}
			</div>

			<span
				className="truncate text-sm font-semibold"
				style={{ color: active ? color : "var(--color-text-main)" }}
			>
				{label}
			</span>

			{active && (
				<span className="relative flex h-2.5 w-2.5 shrink-0">
					<span
						className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
						style={{ backgroundColor: color }}
					/>
					<span
						className="relative inline-flex rounded-full h-2.5 w-2.5"
						style={{ backgroundColor: color }}
					/>
				</span>
			)}
		</div>
	);
}

// Center router node
function RouterNode({ data }: { data: any }) {
	return (
		<div className="flex min-w-[144px] items-center justify-center rounded-[4px] border border-[var(--color-primary)]/30 bg-[color:color-mix(in_srgb,var(--color-primary-soft)_82%,white_18%)] px-5 py-3 shadow-[var(--shadow-soft)]">
			<Handle
				type="source"
				position={Position.Top}
				id="top"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="source"
				position={Position.Bottom}
				id="bottom"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="source"
				position={Position.Left}
				id="left"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<Handle
				type="source"
				position={Position.Right}
				id="right"
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>

			<ProviderIcon
				src="/axonrouter-logo-mark.svg"
				alt="AxonRouter"
				size={24}
				className="mr-2 size-6 object-contain"
				fallbackText="AR"
				fallbackColor="hsl(var(--primary))"
			/>
			<span className="text-sm font-bold text-[var(--color-primary)]">
				AxonRouter
			</span>
			{data.activeCount > 0 && (
				<span className="ml-2 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-xs font-bold text-white">
					{data.activeCount}
				</span>
			)}
		</div>
	);
}

const nodeTypes = { provider: ProviderNode, router: RouterNode };

function buildLayout(providers: any[], activeSet: Set<string>) {
	const nodeW = 180;
	const nodeH = 30;
	const routerW = 120;
	const routerH = 44;
	const nodeGap = 24;
	const count = providers.length;

	if (count === 0) {
		return {
			nodes: [
				{
					id: "router",
					type: "router" as const,
					position: { x: 0, y: 0 },
					data: { providerCount: 0 },
					draggable: false,
				},
			],
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
		data: { providerCount: count, activeCount: activeSet.size },
		draggable: false,
	});

	providers.forEach((p, i) => {
		const providerId = p.provider || p.id || "";
		const config = getProviderConfig(providerId);
		const active = activeSet.has(providerId.toLowerCase());
		const nodeId = `provider-${providerId}`;

		const data = {
			label: config.name || p.name || providerId,
			color: config.color || "#6366f1",
			iconName: providerId,
			textIcon:
				(config as any).textIcon ||
				(providerId || "?").slice(0, 2).toUpperCase(),
			active,
		};

		const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
		const cx = rx * Math.cos(angle);
		const cy = ry * Math.sin(angle);

		let sourceHandle: string;
		let targetHandle: string;
		if (
			Math.abs(angle + Math.PI / 2) < Math.PI / 4 ||
			Math.abs(angle - (3 * Math.PI) / 2) < Math.PI / 4
		) {
			sourceHandle = "top";
			targetHandle = "bottom";
		} else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
			sourceHandle = "bottom";
			targetHandle = "top";
		} else if (cx > 0) {
			sourceHandle = "right";
			targetHandle = "left";
		} else {
			sourceHandle = "left";
			targetHandle = "right";
		}

		nodes.push({
			id: nodeId,
			type: "provider",
			position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
			data,
			draggable: false,
		});

		const edgeColor = active
			? "var(--color-success)"
			: config.color || "#6366f1";

		edges.push({
			id: `e-${nodeId}`,
			source: "router",
			sourceHandle,
			target: nodeId,
			targetHandle,
			animated: active,
			style: {
				stroke: edgeColor,
				strokeWidth: active ? 2.5 : 1.5,
				opacity: active ? 0.9 : 0.32,
			},
		});
	});

	return { nodes, edges };
}

export default function ProviderTopologyClient() {
	const { data, isLoading } = useQuery({
		queryKey: ["providers-topology"],
		queryFn: ({ signal }) =>
			fetchJson<{ connections?: any[]; totalRequests?: number }>(
				"/api/providers",
				{ signal },
			),
	});

	// Poll for live request activity to animate edges like the usage page
	const { data: usageData } = useQuery({
		queryKey: queryKeys.usageStats("live"),
		queryFn: ({ signal }) =>
			fetchJson<any>("/api/usage/stats?period=live", { signal }),
		refetchInterval: 5_000,
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
	const activeConnections = useMemo(
		() =>
			providers.filter((p: any) => {
				const pid = (p.provider || p.id || "").toLowerCase();
				const activeRequests = usageData?.activeRequests || [];
				return activeRequests.some(
					(r: any) => r.provider?.toLowerCase() === pid,
				);
			}).length,
		[providers, usageData],
	);
	const totalRequests = (data as any)?.totalRequests ?? 0;

	// Build activeSet from live usage data
	const activeSet = useMemo<Set<string>>(() => {
		const activeRequests = usageData?.activeRequests || [];
		return new Set<string>(
			activeRequests.map((r: any) => r.provider?.toLowerCase()).filter(Boolean),
		);
	}, [usageData]);

	const { nodes, edges } = useMemo(
		() => buildLayout(providers, activeSet),
		[providers, activeSet],
	);

	const providersKey = useMemo(
		() =>
			providers
				.map((p: any) => p.provider || p.id)
				.sort()
				.join(","),
		[providers],
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
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Providers
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-foreground">
							{totalProviders}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Active Connections
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-foreground">
							{activeConnections}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Requests
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold text-foreground">
							{totalRequests}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Topology visualization */}
			<div
				className="w-full overflow-hidden rounded-[4px] border border-[var(--color-primary)]/15 bg-[color:color-mix(in_srgb,var(--color-surface)_84%,var(--color-primary-soft)_16%)] shadow-[var(--shadow-card)]"
				style={{ height: 520 }}
			>
				{providers.length === 0 ? (
					<div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
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
