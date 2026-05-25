import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getConnectionStatusDetails } from "@/lib/connectionStatus";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";
import { updateCurrentProviderConnection } from "@/lib/connectionStateWriteAccess";
import {
	buildCooldownClearPatch,
	getProviderWideAvailabilityState,
} from "@/lib/providerCooldown";

const MODEL_LOCK_PREFIX = "modelLock_";

type ConnectionRecord = Record<string, unknown> & {
	id: string;
	provider: string;
	name?: string | null;
	email?: string | null;
	reasonDetail?: string | null;
	routingStatus?: string | null;
	quotaState?: string | null;
	nextRetryAt?: string | null;
	resetAt?: string | null;
	backoffLevel?: number;
	reasonCode?: string | null;
};

type StatusLock = {
	key?: string;
	model?: string;
	until?: string;
};

type StatusDetails = {
	status: string;
	activeModelLocks?: StatusLock[];
};

type AvailabilityEntry = {
	provider: string;
	model: string;
	status: string;
	until?: string;
	connectionId: string;
	connectionName: string;
	lastError: string | null;
};

type AvailabilityRequestBody = {
	action?: string;
	provider?: string;
	model?: string;
};

function getConnectionName(connection: ConnectionRecord): string {
	return connection.name || connection.email || connection.id;
}

function getAvailabilityEntries(
	connection: ConnectionRecord,
): AvailabilityEntry[] {
	const availability = getProviderWideAvailabilityState(connection);

	const modelEntries = (availability.statusDetails.activeModelLocks || []).map(
		(lock: StatusLock) => ({
			provider: connection.provider,
			model: lock.model || "",
			status: "cooldown",
			until: lock.until,
			connectionId: connection.id,
			connectionName: getConnectionName(connection),
			lastError: connection.reasonDetail || null,
		}),
	);

	const entries = [...modelEntries];

	if (availability.hasProviderWideStatusEntry) {
		entries.unshift({
			provider: connection.provider,
			model: "__all",
			status: availability.providerStatus,
			until:
				availability.providerStatus === "exhausted"
					? availability.cooldownUntil || undefined
					: undefined,
			connectionId: connection.id,
			connectionName: getConnectionName(connection),
			lastError: connection.reasonDetail || null,
		});
	}

	return entries;
}

export async function GET(request: Request) {
	const authError = await requireManagementAuth(request);
	if (authError) return authError;

	try {
		const connections =
			(await getCurrentProviderConnections()) as ConnectionRecord[];
		const models: AvailabilityEntry[] = [];

		for (const connection of connections) {
			models.push(...getAvailabilityEntries(connection));
		}

		return NextResponse.json({
			models,
			unavailableCount: models.length,
		});
	} catch (error) {
		console.error("[API] Failed to get model availability:", error);
		return NextResponse.json(
			{ error: "Failed to fetch model availability" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const authError = await requireManagementAuth(request);
	if (authError) return authError;

	try {
		const { action, provider, model } =
			(await request.json()) as AvailabilityRequestBody;

		if (action !== "clearCooldown" || !provider || !model) {
			return NextResponse.json({ error: "Invalid request" }, { status: 400 });
		}

		const connections = (await getCurrentProviderConnections({
			provider,
		})) as ConnectionRecord[];
		const lockKey = `${MODEL_LOCK_PREFIX}${model}`;

		await Promise.all(
			connections
				.filter((connection) => {
					const availability = getProviderWideAvailabilityState(connection);
					if (model === "__all") {
						return availability.canClearAll;
					}
					return (availability.statusDetails.activeModelLocks || []).some(
						(lock: StatusLock) => lock.key === lockKey,
					);
				})
				.map((connection) => {
					const clearPatch = buildCooldownClearPatch(connection, model);
					const clearedConnection = { ...connection, ...clearPatch };
					const clearedStatusDetails = getConnectionStatusDetails(
						clearedConnection as Record<string, unknown>,
					) as StatusDetails;
					const shouldReactivate =
						model === "__all" && clearedStatusDetails.status === "eligible";

					return updateCurrentProviderConnection(connection.id, {
						...clearPatch,
						...(shouldReactivate
							? {
									backoffLevel: 0,
									reasonCode: null,
									reasonDetail: null,
								}
							: {}),
					});
				}),
		);

		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("[API] Failed to clear model cooldown:", error);
		return NextResponse.json(
			{ error: "Failed to clear cooldown" },
			{ status: 500 },
		);
	}
}
