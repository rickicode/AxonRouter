import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { SUPERGROK_CONFIG } from "@/lib/oauth/constants/oauth";

const BASE64_BLOCK_SIZE = 4;

function extractEmailFromJwt(token: string): string | undefined {
  try {
    if (!token || typeof token !== "string") return undefined;
    const parts = token.split(".");
    if (parts.length !== 3) return undefined;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const missingPadding = (BASE64_BLOCK_SIZE - (base64.length % BASE64_BLOCK_SIZE)) % BASE64_BLOCK_SIZE;
    const padded = base64 + "=".repeat(missingPadding);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return payload.email || payload.preferred_username || payload.sub || undefined;
  } catch {
    return undefined;
  }
}

type ImportRequestBody = {
  refreshToken?: string;
  accessToken?: string;
  expiresIn?: number;
};

/**
 * POST /api/oauth/supergrok/import
 * Import and validate SuperGrok OAuth credentials (headless flow)
 */
export async function POST(request: Request) {
  try {
    const { refreshToken, accessToken, expiresIn }: ImportRequestBody = await request.json();

    if (!refreshToken && !accessToken) {
      return NextResponse.json(
        { error: "Either refreshToken or accessToken is required" },
        { status: 400 }
      );
    }

    let finalAccessToken = accessToken;
    let finalRefreshToken = refreshToken;
    let finalExpiresIn = expiresIn || 3600;

    // If refreshToken provided, validate by refreshing to get a fresh access token
    if (refreshToken && !accessToken) {
      const refreshResponse = await fetch(SUPERGROK_CONFIG.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: SUPERGROK_CONFIG.clientId,
        }),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        return NextResponse.json(
          { error: `Token refresh failed: ${errorText}` },
          { status: 401 }
        );
      }

      const tokens = await refreshResponse.json();
      finalAccessToken = tokens.access_token;
      finalRefreshToken = tokens.refresh_token || refreshToken;
      finalExpiresIn = tokens.expires_in || 3600;
    }

    // Validate access token by calling xAI models endpoint
    if (finalAccessToken) {
      const validateResponse = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${finalAccessToken}` },
      });

      if (validateResponse.status === 403) {
        return NextResponse.json(
          { error: "OAuth connected but API access denied - SuperGrok subscription may be required" },
          { status: 403 }
        );
      }

      if (!validateResponse.ok) {
        return NextResponse.json(
          { error: `Token validation failed with status ${validateResponse.status}` },
          { status: 401 }
        );
      }
    }

    // Extract email from JWT if available
    const email = finalAccessToken ? extractEmailFromJwt(finalAccessToken) : undefined;

    // Save connection
    const connection = await createCurrentProviderConnection({
      provider: "xai",
      authType: "supergrok_oauth",
      accessToken: finalAccessToken || null,
      refreshToken: finalRefreshToken || null,
      expiresAt: new Date(Date.now() + finalExpiresIn * 1000).toISOString(),
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
        authMethod: "supergrok_oauth",
        provider: "SuperGrok Import",
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "SuperGrok Import");

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
    console.log("SuperGrok import error:", error instanceof Error ? error.message : "Unknown error");
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
