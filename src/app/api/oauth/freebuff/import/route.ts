import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { getFreebuffSession } from "@/lib/freebuff/probe";

type FreebuffImportBody = {
  authToken?: unknown;
  name?: unknown;
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

    const session = await getFreebuffSession(authToken);
    const sessionPayload = session.data && typeof session.data === "object" ? session.data : null;
    const validToken = session.response.ok || session.response.status === 429;
    if (!validToken) {
      return NextResponse.json({
        error: sessionPayload?.message || sessionPayload?.error || "Invalid Freebuff token",
      }, { status: 400 });
    }

    const name = typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : typeof body.accountId === "string" && body.accountId.trim()
        ? body.accountId.trim()
        : "Freebuff Account";

    const connection = await createCurrentProviderConnection({
      provider: "freebuff",
      authType: "apikey",
      name,
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
        authMethod: typeof body.authMethod === "string" && body.authMethod.trim() ? body.authMethod.trim() : "import-session",
        ...(typeof body.accountId === "string" && body.accountId.trim() ? { accountId: body.accountId.trim() } : {}),
        ...(typeof body.fingerprintId === "string" && body.fingerprintId.trim() ? { fingerprint: body.fingerprintId.trim() } : {}),
        ...(typeof body.fingerprintHash === "string" && body.fingerprintHash.trim() ? { fingerprintHash: body.fingerprintHash.trim() } : {}),
        ...(typeof body.instanceId === "string" && body.instanceId.trim() ? { instanceId: body.instanceId.trim() } : {}),
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
