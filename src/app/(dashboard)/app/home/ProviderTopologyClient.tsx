"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ProviderTopology from "@/app/(dashboard)/app/usage/components/ProviderTopology";
import { fetchJson, queryKeys } from "@/shared/query";

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

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-24 text-muted-foreground">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			{/* Card header matching Usage page pattern */}
			<Card className="bg-card/95 shadow-[var(--shadow-card)]">
				<CardHeader>
					<Badge variant="outline" className="mb-3 rounded-[4px] px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
						Network topology
					</Badge>
					<CardTitle className="text-2xl font-extrabold tracking-[-0.03em]">Provider topology</CardTitle>
					<CardDescription className="mt-2 max-w-2xl leading-6">
						Real-time view of connected providers and active routing across AxonRouter.
					</CardDescription>
				</CardHeader>
			</Card>

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

			{/* Topology visualization using shared component */}
			<ProviderTopology
				providers={providers}
				activeRequests={usageData?.activeRequests || []}
				lastProvider=""
				errorProvider=""
			/>
		</div>
	);
}
