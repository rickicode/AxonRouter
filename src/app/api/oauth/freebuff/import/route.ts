import { NextResponse } from "next/server";
import {
  createCurrentProviderConnection,
  getCurrentProviderConnections,
  updateCurrentProviderConnection,
} from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { getFreebuffSession } from "@/lib/freebuff/probe";

type FreebuffImportBody = {
  authToken?: unknown;
  name?: unknown;
  email?: unknown;
  accountId?: unknown;
  fingerprintId?: unknown;
  fingerprintHash?: unknown;
  instanceId?: unknown;
  authMethod?: unknown;
  /** If set, update this connection instead of creating a new one (reset flow). */
  replaceConnectionId?: unknown;
};

/** Deduplicate by email — return the existing connection with the same email, if any. */
async function findConnectionByEmail(
  email: string,
  excludeId?: string,
): Promise<{ id: string } | null> {
  const all = await getCurrentProviderConnections({ provider: "freebuff" });
  if (!Array.isArray(all)) return null;
  for (const conn of all) {
    if (conn.email === email && conn.id !== excludeId) {
      return { id: conn.id };
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FreebuffImportBody;
    const authToken = typeof body.authToken === "string" ? body.authToken.trim() : "";
    if (!authToken) {
      return NextResponse.json({ error: "Auth token is required" }, { status: 400 });
    }

    // Validate token against Freebuff API
    const session = await getFreebuffSession(authToken);
    const sessionPayload = session.data && typeof session.data === "object" ? session.data : null;
    const validToken = session.response.ok || session.response.status === 429;
    if (!validToken) {
      return NextResponse.json({
        error: sessionPayload?.message || sessionPayload?.error || "Invalid Freebuff token",
      }, { status: 400 });
    }

    // ── Resolve fields ──────────────────────────────────────────────────
    const email = typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : null;
    const displayName = email
      || (typeof body.name === "string" && body.name.trim() ? body.name.trim() : null)
      || (typeof body.accountId === "string" && body.accountId.trim() ? body.accountId.trim() : null)
      || "Freebuff Account";
    const fingerprintId = typeof body.fingerprintId === "string" && body.fingerprintId.trim()
      ? body.fingerprintId.trim()
      : null;
    const fingerprintHash = typeof body.fingerprintHash === "string" && body.fingerprintHash.trim()
      ? body.fingerprintHash.trim()
      : null;
    const instanceId = typeof body.instanceId === "string" && body.instanceId.trim()
      ? body.instanceId.trim()
      : null;
    const accountId = typeof body.accountId === "string" && body.accountId.trim()
      ? body.accountId.trim()
      : null;
    const userName = typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : null;
    const authMethod = typeof body.authMethod === "string" && body.authMethod.trim()
      ? body.authMethod.trim()
      : "import-session";
    const replaceConnectionId = typeof body.replaceConnectionId === "string" && body.replaceConnectionId.trim()
      ? body.replaceConnectionId.trim()
      : null;

    // ── Dedup: reject same email ────────────────────────────────────────
    if (email) {
      const colliding = await findConnectionByEmail(email, replaceConnectionId ?? undefined);
      if (colliding) {
        const reason = replaceConnectionId
          ? "Akun ini sudah terhubung sebagai koneksi lain. Import gagal."
          : "Email ini sudah terhubung di koneksi Freebuff lain. Gunakan Reset Credentials untuk mengganti.";
        return NextResponse.json({ error: reason }, { status: 409 });
      }
    }

    const providerSpecificData = {
      authMethod,
      accountId,
      fingerprint: fingerprintId,
      fingerprintHash,
      instanceId,
      name: userName,
      email,
    };
    const connectionPayload = {
      provider: "freebuff",
      authType: "apikey" as const,
      name: displayName,
      email,
      apiKey: authToken,
      routingStatus: "eligible" as const,
      quotaState: (session.response.status === 429 ? "cooldown" : "ok") as "cooldown" | "ok",
      authState: "ok" as const,
      healthStatus: "healthy" as const,
      reasonCode: session.response.status === 429 ? ("quota_exhausted" as const) : null,
      reasonDetail: session.response.status === 429
        ? (sessionPayload?.message || "Daily session limit reached")
        : null,
      nextRetryAt: sessionPayload?.resetAt || null,
      resetAt: sessionPayload?.resetAt || null,
      lastCheckedAt: new Date().toISOString(),
      providerSpecificData,
    };

    // ── Create or update ────────────────────────────────────────────────
    const connection = replaceConnectionId
      ? await updateCurrentProviderConnection(replaceConnectionId, connectionPayload)
      : await createCurrentProviderConnection(connectionPayload);

    const latestConnection = await finalizePostConnectValidation(connection, `Freebuff ${replaceConnectionId ? "Reset" : "Import"}`);

    return NextResponse.json({
      success: true,
      replaced: !!replaceConnectionId,
      connection: {
        id: latestConnection.id,
        provider: latestConnection.provider,
        email: latestConnection.email,
        displayName: latestConnection.displayName,
        name: latestConnection.name,
        routingStatus: latestConnection.routingStatus,
        healthStatus: latestConnection.healthStatus,
        quotaState: latestConnection.quotaState,
        authState: latestConnection.authState,
        reasonCode: latestConnection.reasonCode,
        reasonDetail: latestConnection.reasonDetail,
        lastCheckedAt: latestConnection.lastCheckedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}