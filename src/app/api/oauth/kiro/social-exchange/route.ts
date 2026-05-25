import { NextResponse } from "next/server";
import { V4 } from "paseto";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";
import { KiroService } from "@/lib/oauth/services/kiro";
import { getPasetoPublicKey } from "@/lib/security/pasetoKeys";

const OAUTH_STATE_COOKIE = "kiro_social_oauth_state";

function getCookieValue(request, name) {
  const requestCookie = request.cookies?.get?.(name)?.value;
  if (requestCookie) return requestCookie;

  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }

  return null;
}

/**
 * POST /api/oauth/kiro/social-exchange
 * Exchange authorization code for tokens (Google/GitHub social login)
 * Callback URL will be in format: kiro://kiro.kiroAgent/authenticate-success?code=XXX&state=YYY
 */
export async function POST(request) {
  try {
    const oauthStatePublicKey = getPasetoPublicKey();
    const { searchParams } = new URL(request.url);
    const targetProvider = searchParams.get("targetProvider") === "amazon-q" ? "amazon-q" : "kiro";
    const { code, codeVerifier, provider, state } = await request.json();

    if (!code || !codeVerifier || !state) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!provider || !["google", "github"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider" },
        { status: 400 }
      );
    }

    const stateCookie = getCookieValue(request, OAUTH_STATE_COOKIE);
    if (!stateCookie) {
      return NextResponse.json(
        { error: "OAuth session expired. Please restart the connection flow." },
        { status: 400 }
      );
    }

    let verifiedState;
    try {
      verifiedState = await V4.verify(stateCookie, oauthStatePublicKey);
    } catch {
      return NextResponse.json(
        { error: "OAuth session expired. Please restart the connection flow." },
        { status: 400 }
      );
    }

    if (
      verifiedState?.state !== state ||
      verifiedState?.codeVerifier !== codeVerifier ||
      verifiedState?.provider !== provider ||
      verifiedState?.targetProvider !== targetProvider
    ) {
      return NextResponse.json(
        { error: "OAuth state mismatch. Please restart the connection flow." },
        { status: 400 }
      );
    }

    const kiroService = new KiroService();

    // Exchange code for tokens (redirect_uri handled internally)
    const tokenData = await kiroService.exchangeSocialCode(
      code,
      codeVerifier
    );

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
        authMethod: provider, // "google" or "github"
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "Kiro Social");

    const response = NextResponse.json({
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

    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      secure: request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.log("Kiro social exchange error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
