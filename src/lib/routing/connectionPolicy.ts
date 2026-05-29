import {
	getConnectionRoutingOrderLock,
	getConnectionUsageAvailabilityScore,
	getRecentTransientFailurePenalty,
	isConnectionRoutingOrderLockActive,
} from "@/lib/connectionUsageRank";

export function resolveRoutingPolicy(
	settings: any = {},
	providerId: any = null,
) {
	const routing: any = settings?.routing || {};
	const providerStrategies: any =
		routing.providerStrategies || settings.providerStrategies || {};
	const providerOverride: any = providerStrategies[providerId] || {};
	const strategy =
		providerOverride.strategy ||
		providerOverride.fallbackStrategy ||
		routing.strategy ||
		settings.fallbackStrategy ||
		"fill-first";
	const stickyLimit =
		providerOverride.stickyLimit ||
		providerOverride.stickyRoundRobinLimit ||
		routing.stickyLimit ||
		settings.stickyRoundRobinLimit ||
		3;

	return { strategy, stickyLimit };
}

export function scoreConnection(connection: any = {}, telemetry: any = {}) {
	const providerTelemetry =
		telemetry?.byProvider?.[connection?.provider] || null;
	const priority = Number.isFinite(connection?.priority)
		? connection.priority
		: 999;
	const usageAvailabilityScore =
		getConnectionUsageAvailabilityScore(connection);
	const maxUsageAvailability = Number(telemetry?.maxUsageAvailability || 0);
	const providerCost = Number(providerTelemetry?.cost || 0);
	const maxCost = Number(telemetry?.maxCost || 0);
	const costScore =
		usageAvailabilityScore !== null && maxUsageAvailability > 0
			? Math.max(0, Math.min(usageAvailabilityScore / maxUsageAvailability, 1))
			: maxCost > 0
				? Math.max(0, 1 - Math.min(providerCost / maxCost, 1))
				: Math.max(0, 1 - Math.min(priority / 10, 1));
	const providerRequests = Number(providerTelemetry?.requests || 0);
	const latencyScore =
		providerRequests > 0
			? Math.max(
					0.1,
					Math.min(
						1,
						1 -
							Math.min(
								providerRequests /
									Math.max(Number(telemetry?.maxRequests || 1), 1),
								1,
							) *
								0.5,
					),
				)
			: 0.5;
	const qualityScore =
		connection?.healthStatus === "healthy"
			? 1
			: connection?.healthStatus === "degraded"
				? 0.5
				: 0.2;
	const transientPenalty = getRecentTransientFailurePenalty(connection);

	const score = Math.max(
		0,
		costScore * 0.34 +
			latencyScore * 0.33 +
			qualityScore * 0.33 -
			transientPenalty * 0.35,
	);
	return {
		score,
		breakdown: {
			cost: Number(costScore.toFixed(3)),
			latency: Number(latencyScore.toFixed(3)),
			quality: Number(qualityScore.toFixed(3)),
			transientPenalty: Number(transientPenalty.toFixed(3)),
		},
	};
}

export function rankConnectionsForRouting(
	connections: any[] = [],
	telemetry: any = {},
) {
	const maxUsageAvailability = connections.reduce((max, connection) => {
		const score = getConnectionUsageAvailabilityScore(connection);
		return score !== null ? Math.max(max, score) : max;
	}, 0);
	const scoringTelemetry = { ...telemetry, maxUsageAvailability };

	return [...connections]
		.map((connection) => {
			const scored = scoreConnection(connection, scoringTelemetry);
			return {
				...connection,
				routingScore: scored.score,
				routingScoreBreakdown: scored.breakdown,
			};
		})
		.sort((left, right) => {
			const leftLockActive = isConnectionRoutingOrderLockActive(left);
			const rightLockActive = isConnectionRoutingOrderLockActive(right);

			if (leftLockActive || rightLockActive) {
				if (leftLockActive && !rightLockActive) return -1;
				if (!leftLockActive && rightLockActive) return 1;

				const leftOrder = getConnectionRoutingOrderLock(left).order ?? 999;
				const rightOrder = getConnectionRoutingOrderLock(right).order ?? 999;
				if (leftOrder !== rightOrder) return leftOrder - rightOrder;
			}

			return right.routingScore - left.routingScore;
		});
}
