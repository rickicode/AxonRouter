import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  generateCloudSecret,
  registerWithWorker,
  probeCloudHealth,
  unregisterWorker,
} from "@/lib/cloudWorkerClient";
import { hasValidCloudRouteOrigin } from "@/lib/cloudRequestAuth";
import { atomicUpdateCurrentSettings, getCurrentSettings } from "@/lib/settingsAccess";

type CloudUrlStatus = "unknown" | "online" | "offline" | "error" | "unauthorized" | "not_registered";

type CloudUrlEntry = {
  id: string;
  name: string;
  url: string;
  status: CloudUrlStatus;
  version: string | null;
  latencyMs: number | null;
  lastChecked: string | null;
  registeredAt: string | null;
  lastSyncAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  providersCount: number | null;
  secret?: string;
};

type CloudSettings = {
  cloudUrls?: CloudUrlEntry[];
  cloudSharedSecret?: string;
  r2RuntimePublicBaseUrl?: string;
  r2RuntimeCacheTtlSeconds?: number;
};

type CloudRouteRequestBody = {
  action?: string;
  id?: string;
  lastChecked?: string | null;
  name?: string;
  status?: CloudUrlStatus;
  url?: string;
};

const VALID_STATUSES = new Set<CloudUrlStatus>([
  "unknown",
  "online",
  "offline",
  "error",
  "unauthorized",
  "not_registered",
]);

function maskSecret(secret: string): string | null {
  if (secret.length < 12) return null;
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}

function sanitizeForResponse(entry: CloudUrlEntry | null | undefined): Omit<CloudUrlEntry, "secret"> | null | undefined {
  if (!entry || typeof entry !== "object") return entry;
  const { secret, ...rest } = entry;
  return rest;
}

function sanitizeListForResponse(entries: CloudUrlEntry[] | undefined): Array<Omit<CloudUrlEntry, "secret">> {
  return Array.isArray(entries) ? entries.map((entry) => sanitizeForResponse(entry) as Omit<CloudUrlEntry, "secret">) : [];
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
}

function validateUrl(urlString: string): string {
  try {
    const url = new URL(urlString);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("URL must be a valid HTTP or HTTPS address");
    }

    const isProduction = process.env.NODE_ENV === "production";
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    const hostname = url.hostname;
    const privateIpPatterns = [
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^::1$/,
      /^fe80:/i,
      /^fc00:/i,
    ];

    if (isProduction && url.protocol === "http:" && !isLocalhost) {
      throw new Error("HTTPS required for production URLs");
    }

    if (isProduction && privateIpPatterns.some((pattern) => pattern.test(hostname)) && !isLocalhost) {
      throw new Error("Private IP addresses not allowed");
    }

    return url.toString();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid URL format");
  }
}

async function readCloudUrls(): Promise<CloudUrlEntry[]> {
  const settings = (await getCurrentSettings()) as CloudSettings;
  return Array.isArray(settings.cloudUrls) ? settings.cloudUrls : [];
}

async function ensureGlobalCloudSecret(): Promise<{ settings: CloudSettings; secret: string; created: boolean }> {
  const settings = (await getCurrentSettings()) as CloudSettings;
  if (typeof settings.cloudSharedSecret === "string" && settings.cloudSharedSecret.length >= 16) {
    return { settings, secret: settings.cloudSharedSecret, created: false };
  }

  const secret = generateCloudSecret();
  const updated = (await atomicUpdateCurrentSettings((currentSettings: CloudSettings) => ({
    ...currentSettings,
    cloudSharedSecret: secret,
  }))) as CloudSettings;
  return { settings: updated, secret, created: true };
}

function shouldRevealSecret(request: Request): boolean {
  try {
    return new URL(request.url).searchParams.get("includeSecret") === "1";
  } catch {
    return false;
  }
}

function buildCloudSecretPayload(secret: string, { regeneratedAt = null }: { regeneratedAt?: string | null } = {}) {
  return {
    hasGlobalSecret: secret.length >= 16,
    cloudSharedSecretMasked: maskSecret(secret),
    cloudSharedSecret: secret,
    regeneratedAt,
  };
}

function buildWorkerRegistrationMetadata(settings: CloudSettings = {}): any {
  const runtimeUrl = normalizeUrl(settings.r2RuntimePublicBaseUrl);
  const cacheTtlSeconds = Number.isInteger(settings.r2RuntimeCacheTtlSeconds)
    ? settings.r2RuntimeCacheTtlSeconds
    : undefined;

  return {
    ...(runtimeUrl ? { runtimeUrl } : {}),
    ...(cacheTtlSeconds ? { cacheTtlSeconds } : {}),
  };
}

async function writeCloudUrls(
  mutator: (cloudUrls: CloudUrlEntry[]) => CloudUrlEntry[] | Promise<CloudUrlEntry[]>
): Promise<CloudUrlEntry[]> {
  const settings = (await atomicUpdateCurrentSettings(async (currentSettings: CloudSettings) => {
    const currentUrls = Array.isArray(currentSettings.cloudUrls) ? currentSettings.cloudUrls : [];
    const clonedUrls = currentUrls.map((entry) => structuredClone(entry));
    const nextUrls = await mutator(clonedUrls);

    return {
      ...currentSettings,
      cloudUrls: nextUrls,
    };
  })) as CloudSettings;

  return settings.cloudUrls ?? [];
}

function getNextId(): string {
  return uuidv4();
}

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { secret } = await ensureGlobalCloudSecret();
    return NextResponse.json({
      cloudUrls: sanitizeListForResponse(await readCloudUrls()),
      hasGlobalSecret: true,
      cloudSharedSecretMasked: maskSecret(secret),
      cloudSharedSecret: shouldRevealSecret(request) ? secret : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load cloud URLs" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    if (!hasValidCloudRouteOrigin(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const body = (await request.json()) as CloudRouteRequestBody;
    const rawUrl = normalizeUrl(body?.url);
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";

    if (!rawUrl) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const url = validateUrl(rawUrl);
    const { settings, secret } = await ensureGlobalCloudSecret();

    const probe = await probeCloudHealth(url);
    if (!probe.ok) {
      return NextResponse.json(
        { error: `Worker is not reachable: ${probe.error || "unknown error"}` },
        { status: 502 }
      );
    }

    let registerResult;
    try {
      registerResult = await registerWithWorker(url, secret, buildWorkerRegistrationMetadata(settings));
    } catch (error) {
      return NextResponse.json(
        { error: `Worker registration failed: ${error instanceof Error ? error.message : "unknown error"}` },
        { status: 502 }
      );
    }

    let createdEntry: CloudUrlEntry | null = null;
    const updated = await writeCloudUrls((cloudUrls) => {
      if (cloudUrls.some((entry) => normalizeUrl(entry.url) === url)) {
        throw new Error("Cloud URL already exists");
      }

      const nextEntry: CloudUrlEntry = {
        id: getNextId(),
        name: name || new URL(url).hostname,
        url,
        status: "online",
        version: registerResult?.version || probe.version || null,
        latencyMs: probe.latencyMs ?? null,
        lastChecked: new Date().toISOString(),
        registeredAt: registerResult?.registeredAt || new Date().toISOString(),
        lastSyncAt: null,
        lastSyncOk: null,
        lastSyncError: null,
        providersCount: null,
      };

      createdEntry = nextEntry;
      return [...cloudUrls, nextEntry];
    });

    return NextResponse.json(
      {
        cloudUrls: sanitizeListForResponse(updated),
        created: sanitizeForResponse(createdEntry),
        hasGlobalSecret: true,
        cloudSharedSecretMasked: maskSecret(secret),
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create cloud URL";
    const status = message === "Cloud URL already exists" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    if (!hasValidCloudRouteOrigin(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const body = (await request.json()) as CloudRouteRequestBody;
    const { id, status } = body;
    if (body?.action === "regenerate-secret") {
      const secret = generateCloudSecret();
      await atomicUpdateCurrentSettings((currentSettings: CloudSettings) => ({
        ...currentSettings,
        cloudSharedSecret: secret,
      }));
      return NextResponse.json({
        success: true,
        warning: "Global cloud secret regenerated in AxonRouter. Update CLOUD_SHARED_SECRET on every worker before syncing again.",
        ...buildCloudSecretPayload(secret, { regeneratedAt: new Date().toISOString() }),
      });
    }

    let lastChecked = body?.lastChecked ?? null;

    if (lastChecked) {
      const date = new Date(lastChecked);
      if (Number.isNaN(date.getTime()) || date > new Date()) {
        lastChecked = null;
      }
    }

    if (!id) {
      return NextResponse.json({ error: "Valid cloud URL id is required" }, { status: 400 });
    }

    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const updatedUrls = await writeCloudUrls((cloudUrls) => {
      const index = cloudUrls.findIndex((entry) => entry.id === id);
      if (index === -1) throw new Error("Cloud URL not found");

      if (status) cloudUrls[index].status = status;
      if (lastChecked !== undefined) cloudUrls[index].lastChecked = lastChecked;

      return cloudUrls;
    });

    return NextResponse.json({ success: true, cloudUrls: sanitizeListForResponse(updatedUrls) });
  } catch (error) {
    const statusMap: Record<string, number> = {
      "Cloud URL not found": 404,
    };
    const message = error instanceof Error ? error.message : "Failed to update cloud URL";
    return NextResponse.json({ error: message }, { status: statusMap[message] || 500 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    if (!hasValidCloudRouteOrigin(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }

    const body = (await request.json()) as CloudRouteRequestBody;
    const id = String(body?.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "Valid cloud URL id is required" }, { status: 400 });
    }

    const settings = (await getCurrentSettings()) as CloudSettings;
    const entry = Array.isArray(settings.cloudUrls)
      ? settings.cloudUrls.find((cloudUrl) => cloudUrl.id === id) ?? null
      : null;
    const secret = typeof settings.cloudSharedSecret === "string" ? settings.cloudSharedSecret : "";

    if (!entry) {
      return NextResponse.json({ error: "Cloud URL not found" }, { status: 404 });
    }

    let remoteUnregistered = false;

    if (entry.url && secret) {
      try {
        await unregisterWorker(entry.url, secret);
        remoteUnregistered = true;
      } catch (error) {
        const workerError = error as { status?: number; message?: string };
        const remoteMissing = workerError?.status === 404;
        if (workerError?.status === 401) {
          return NextResponse.json(
            { error: "Worker unregister failed: secret rejected by worker. Remote record was not removed." },
            { status: 409 }
          );
        }
        if (!remoteMissing) {
          return NextResponse.json(
            { error: `Worker unregister failed: ${workerError?.message || "unknown error"}` },
            { status: 502 }
          );
        }
      }
    }

    const updated = await writeCloudUrls((cloudUrls) => {
      const index = cloudUrls.findIndex((cloudUrl) => cloudUrl.id === id);
      if (index === -1) {
        throw new Error("Cloud URL not found");
      }
      return cloudUrls.filter((cloudUrl) => cloudUrl.id !== id);
    });

    return NextResponse.json({ cloudUrls: sanitizeListForResponse(updated), remoteUnregistered });
  } catch (error) {
    const statusMap: Record<string, number> = {
      "Valid cloud URL id is required": 400,
      "Cloud URL not found": 404,
    };
    const message = error instanceof Error ? error.message : "Failed to delete cloud URL";
    return NextResponse.json({ error: message }, { status: statusMap[message] || 500 });
  }
}
