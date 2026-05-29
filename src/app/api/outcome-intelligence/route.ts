import { NextResponse } from "next/server";
import { getCurrentCombos } from "@/lib/modelCatalogAccess";
import { getAutoRoutingTelemetryBreakdown } from "@/lib/routing/autoRoutingTelemetry";
import {
	VIRTUAL_SYSTEM_MODELS,
	resolveVirtualModelExecution,
} from "@/lib/routing/virtualModelResolver";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { getUsageAnalyticsFromDb } from "@/lib/usageDb/queries/analytics";

export async function GET() {
	const analytics = getUsageAnalyticsFromDb({ period: "30d" });
	const settings: any = await getCurrentSettings();
	const combos = await getCurrentCombos();
	const providers = analytics?.byProvider || [];
	const spendLeaders = [...providers]
		.sort((a, b) => b.cost - a.cost)
		.slice(0, 3);
	const enterprise = settings?.enterprise || {
		regionPolicy: "global",
		complianceMode: "standard",
		tenantSegregation: false,
	};
	const enterpriseInsights = [];
	if (enterprise.regionPolicy !== "global") {
		enterpriseInsights.push({
			type: "region-policy",
			summary: `Region policy is constrained to ${enterprise.regionPolicy}. Review provider placement and failover assumptions.`,
		});
	}
	if (enterprise.complianceMode !== "standard") {
		enterpriseInsights.push({
			type: "compliance-mode",
			summary: `Compliance mode ${enterprise.complianceMode} is active. Validate provider/tool usage against policy.`,
		});
	}
	if (enterprise.tenantSegregation === true) {
		enterpriseInsights.push({
			type: "tenant-segregation",
			summary:
				"Tenant segregation is enabled. Cross-tenant shared routing assumptions should be reviewed.",
		});
	}

	const telemetryBreakdown = getAutoRoutingTelemetryBreakdown();
	const virtualModelResolutions = await Promise.all(
		Object.keys(VIRTUAL_SYSTEM_MODELS).map(async (modelStr) => ({
			model: modelStr,
			resolution: await resolveVirtualModelExecution({
				modelStr,
				settings,
				telemetry: telemetryBreakdown.byVirtualModel?.[modelStr] || null,
			} as any),
			telemetry: telemetryBreakdown.byVirtualModel?.[modelStr] || null,
		})),
	);

	return NextResponse.json(
		{
			insights: [
				...spendLeaders.map((item) => ({
					type: "spend-leader",
					provider: item.provider,
					summary: `${item.provider} leads spend with $${item.cost.toFixed(2)} across ${item.requests} requests`,
				})),
				...enterpriseInsights,
			],
			context: {
				lastEvalRunAt:
					(settings as any)?.evalRuns?.history?.[0]?.timestamp || null,
				comboCount: Array.isArray(combos) ? combos.length : 0,
				enterprise,
			},
			virtualModels: virtualModelResolutions,
			telemetryBreakdown,
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
