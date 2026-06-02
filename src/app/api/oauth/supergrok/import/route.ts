import { NextResponse } from "next/server";
import { z } from "zod";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { SUPERGROK_CONFIG } from "@/lib/oauth/constants/oauth";
import { validateBody, isValidationFailure } from "@/shared/validation/helpers";

const BASE64_BLOCK_SIZE = 4;

/** Schema for POST /api/oauth/supergrok/import request body */
const ImportRequestSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
    accessToken: z.string().min(1).optional(),
    expiresIn: z.number().positive().optional(),
  })
  .refine((data) => data.refreshToken || data.accessToken, {
    message: "Either refreshToken or accessToken is required",
  });

/**
 * Extract email claim from a JWT access token payload.
 * Returns undefined if the token is not a valid JWT or has no email-like claim.
 */
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

/**
 * POST /api/oauth/supergrok/import
 * Import and validate SuperGrok OAuth credentials (headless flow).
 * Accepts a refresh_token (preferred) or access_token, validates against xAI,
 * and persists the connection for use in subsequent API calls.
 */
export async function POST(request: Request) {
  try {
    const rawBody: unknown = await request.json().catch(() => ({}));
    const validation = validateBody(ImportRequestSchema, rawBody);
    if (isValidationFailure(validation)) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { refreshToken, accessToken, expiresIn } = validation.data;

    let finalAccessToken = accessToken;
    let finalRefreshToken = refreshToken;
    let finalExpiresIn = expiresIn ?? 3600;

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
        const safeError = errorText.slice(0, 200);
        console.log("SuperGrok refresh error:", safeError);
        return NextResponse.json(
          { error: `Token refresh failed (HTTP ${refreshResponse.status})` },
          { status: 401 }
        );
      }

      const tokens = await refreshResponse.json();
      finalAccessToken = tokens.access_token;
      finalRefreshToken = tokens.refresh_token || refreshToken;
      finalExpiresIn = tokens.expires_in ?? 3600;
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

    // Determine if connection is ephemeral (no refresh token means it will expire permanently)
    const isEphemeral = !finalRefreshToken;

    // Save connection
    const connection = await createCurrentProviderConnection({
      provider: "supergrok",
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
        ...(isEphemeral ? { ephemeral: true } : {}),
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "SuperGrok Import");

    const response: Record<string, unknown> = {
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
    };

    if (isEphemeral) {
      response.warning = "No refresh token provided - connection will expire and require re-import";
    }

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.log("SuperGrok import error:", error instanceof Error ? error.message : "Unknown error");
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
