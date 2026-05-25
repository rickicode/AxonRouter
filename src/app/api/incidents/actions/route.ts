import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { getConnectionStatusDetails } from "@/lib/connectionStatus";
import { buildCooldownClearPatch } from "@/lib/providerCooldown";
import { updateCurrentProviderConnection } from "@/lib/connectionStateWriteAccess";

type IncidentAction = "disable-route" | "reroute" | "retry-auth";

type IncidentActionRequestBody = {
	action?: unknown;
	provider?: unknown;
};

type ProviderConnectionPatch = {
	isActive?: boolean;
	routingStatus?: string;
	healthStatus?: string;
	authState?: string;
	reasonCode?: string | null;
	reasonDetail?: string | null;
	lastCheckedAt?: string;
	backoffLevel?: number;
	nextRetryAt?: string | null;
	resetAt?: string | null;
	[key: string]: unknown;
};

type ProviderConnectionRecord = {
	id: string;
	provider?: string;
	[key: string]: unknown;
};

function isIncidentAction(value: unknown): value is IncidentAction {
	return (
		value === "disable-route" || value === "reroute" || value === "retry-auth"
	);
}

export async function POST(request: Request) {
	const authError = await requireManagementAuth(request);
	if (authError) return authError;

	try {
		const body = (await request
			.json()
			.catch(() => ({}))) as IncidentActionRequestBody;
		const action = body?.action;
		const provider = typeof body?.provider === "string" ? body.provider : null;

		if (!isIncidentAction(action) || !provider) {
			return NextResponse.json(
				{ error: "action and provider are required" },
				{ status: 400 },
			);
		}

		const connections = (await getCurrentProviderConnections({ provider })) as
			| ProviderConnectionRecord[]
			| null
			| undefined;
		const targets = (connections || []).filter(Boolean);
		if (targets.length === 0) {
			return NextResponse.json(
				{ error: "No provider connections found" },
				{ status: 404 },
			);
		}

		const now = new Date().toISOString();
		let patch: ProviderConnectionPatch | null = null;

		if (action === "disable-route") {
			patch = {
				isActive: false,
				routingStatus: "blocked",
				reasonCode: "manual_disabled",
				reasonDetail: "Disabled from incidents panel",
				lastCheckedAt: now,
			};
		} else if (action === "reroute") {
			patch = {
				reasonCode: "manual_reroute",
				reasonDetail: "Manual reroute requested from incidents panel",
				lastCheckedAt: now,
			};
		} else if (action === "retry-auth") {
			patch = {
				authState: "unknown",
				reasonCode: "manual_retry_auth",
				reasonDetail: "Manual auth retry requested from incidents panel",
				lastCheckedAt: now,
			};
		}

		const updated = await Promise.all(
			targets.map((connection) => {
				if (action !== "reroute") {
					return updateCurrentProviderConnection(connection.id, patch);
				}

				const clearPatch = buildCooldownClearPatch(connection, "__all");
				const clearedConnection = { ...connection, ...clearPatch };
				const clearedStatusDetails = getConnectionStatusDetails(
					clearedConnection as Record<string, unknown>,
				);

				return updateCurrentProviderConnection(connection.id, {
					...clearPatch,
					...(clearedStatusDetails.status === "eligible"
						? {
								backoffLevel: 0,
								reasonCode: "manual_reroute",
								reasonDetail: "Manual reroute requested from incidents panel",
								lastCheckedAt: now,
							}
						: {
								reasonCode: "manual_reroute",
								reasonDetail: "Manual reroute requested from incidents panel",
								lastCheckedAt: now,
							}),
				});
			}),
		);

		return NextResponse.json({
			ok: true,
			action,
			provider,
			updatedCount: updated.filter(Boolean).length,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return NextResponse.json(
			{ error: "Failed to apply incident action", message },
			{ status: 500 },
		);
	}
}
