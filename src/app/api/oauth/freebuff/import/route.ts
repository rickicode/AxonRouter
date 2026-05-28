import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
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
};

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

    // Resolve display name: email > name > accountId > fallback
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

    const connection = await createCurrentProviderConnection({
      provider: "freebuff",
      authType: "apikey",
      name: displayName,
      email, // Store email so it shows like OAuth connections
      apiKey: authToken,
      routingStatus: "eligible",
      quotaState: session.response.status === 429 ? "cooldown" : "ok",
      authState: "ok",
      healthStatus: "healthy",
      reasonCode: session.response.status === 429 ? "quota_exhausted" : null,
      reasonDetail: session.response.status === 429 ? (sessionPayload?.message || "Daily session limit reached") : null,
      nextRetryAt: sessionPayload?.resetAt || null,
      resetAt: sessionPayload?.resetAt || null,
      lastCheckedAt: new Date().toISOString(),
      providerSpecificData: {
        authMethod,
        accountId,
        fingerprint: fingerprintId,
        fingerprintHash,
        instanceId,
        name: userName, // Store original name from credentials.json
        email, // Also store email in providerSpecificData for executor use
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "Freebuff Import");

    return NextResponse.json({
      success: true,
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
