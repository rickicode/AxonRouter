import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { KiroService } from "@/lib/oauth/services/kiro";

type ImportRequestBody = {
  refreshToken?: unknown;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  authMethod?: string;
  startUrl?: string;
};

/**
 * POST /api/oauth/kiro/import
 * Import and validate refresh token from Kiro IDE
 */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetProvider = searchParams.get("targetProvider") === "amazon-q" ? "amazon-q" : "kiro";
    const { refreshToken, clientId, clientSecret, region, authMethod, startUrl }: ImportRequestBody = await request.json();

    if (!refreshToken || typeof refreshToken !== "string") {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    const kiroService = new KiroService();

    // Build providerSpecificData for Builder ID tokens that need clientId/clientSecret
    const providerSpecificData = clientId && clientSecret
      ? { clientId, clientSecret, region: region || "us-east-1", authMethod: authMethod || "builder-id", startUrl: startUrl || "https://view.awsapps.com/start" }
      : undefined;

    // Validate and refresh token
    const tokenData = await kiroService.validateImportToken(refreshToken.trim(), providerSpecificData);

    // Extract email from JWT if available
    const email = kiroService.extractEmailFromJWT(tokenData.accessToken);

    // Save to database with the same canonical healthy defaults used by the shared OAuth route.
    const connection = await createCurrentProviderConnection({
      provider: targetProvider,
      authType: "oauth",
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: new Date(Date.now() + tokenData.expiresIn * 1000).toISOString(),
      email: email || null,
      name: email || undefined,
      displayName: email || undefined,
      routingStatus: "eligible",
      quotaState: "ok",
      authState: "ok",
      healthStatus: "healthy",
      reasonCode: null,
      reasonDetail: null,
      nextRetryAt: null,
      resetAt: null,
      lastCheckedAt: new Date().toISOString(),
      providerSpecificData: {
        profileArn: tokenData.profileArn,
        authMethod: tokenData.providerSpecificData?.authMethod || providerSpecificData?.authMethod || "imported",
        provider: "Imported",
        clientId: tokenData.providerSpecificData?.clientId || providerSpecificData?.clientId || undefined,
        clientSecret: tokenData.providerSpecificData?.clientSecret || providerSpecificData?.clientSecret || undefined,
        region: tokenData.providerSpecificData?.region || providerSpecificData?.region || "us-east-1",
        startUrl: tokenData.providerSpecificData?.startUrl || providerSpecificData?.startUrl || "https://view.awsapps.com/start",
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "Kiro Import");

    return NextResponse.json({
      success: true,
      connection: {
        id: latestConnection.id,
        provider: latestConnection.provider,
        email: latestConnection.email,
        displayName: latestConnection.displayName,
        routingStatus: latestConnection.routingStatus,
        healthStatus: latestConnection.healthStatus,
        quotaState: latestConnection.quotaState,
        authState: latestConnection.authState,
        reasonCode: latestConnection.reasonCode,
        reasonDetail: latestConnection.reasonDetail,
        lastCheckedAt: latestConnection.lastCheckedAt,
      },
    });
  } catch (error: unknown) {
    console.log("Kiro-compatible import token error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
