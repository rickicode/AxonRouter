const MAX_ADMIN_LOGS = 200;

type AdminLogValue = string | number | boolean | null | AdminLogValue[] | { [key: string]: AdminLogValue };

type AdminLogEntry = {
	id: string;
	timestamp: string;
	level: string;
	tag: string;
	message: string;
	data: AdminLogValue | undefined;
};

const adminLogs: AdminLogEntry[] = [];

function cloneValue(value: unknown): AdminLogValue | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return value;
	}
	try {
		return JSON.parse(JSON.stringify(value)) as AdminLogValue;
	} catch {
		return String(value);
	}
}

export function pushAdminLog(level: string, tag: string, message: string, data: unknown = null) {
	const entry = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		timestamp: new Date().toISOString(),
		level,
		tag,
		message,
		data: cloneValue(data),
	};

	adminLogs.push(entry);
	if (adminLogs.length > MAX_ADMIN_LOGS) {
		adminLogs.splice(0, adminLogs.length - MAX_ADMIN_LOGS);
	}

	return entry;
}

export function getAdminLogs(limit = 100) {
	const normalizedLimit = Number.isFinite(limit)
		? Math.max(1, Math.min(500, Math.trunc(limit)))
		: 100;
	return adminLogs.slice(-normalizedLimit).reverse();
}

export function clearAdminLogs() {
	adminLogs.length = 0;
}
