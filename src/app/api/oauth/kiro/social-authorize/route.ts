import { NextResponse } from "next/server";
import { V4 } from "paseto";
import { generatePKCE } from "@/lib/oauth/utils/pkce";
import { KiroService } from "@/lib/oauth/services/kiro";
import { getPasetoPrivateKey } from "@/lib/security/pasetoKeys";

const OAUTH_STATE_COOKIE = "kiro_social_oauth_state";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const OAUTH_STATE_PRIVATE_KEY = getPasetoPrivateKey();

/**
 * GET /api/oauth/kiro/social-authorize
 * Generate Google/GitHub social login URL for manual callback flow
 * Uses kiro:// custom protocol as required by AWS Cognito
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetProvider = searchParams.get("targetProvider") === "amazon-q" ? "amazon-q" : "kiro";
    const provider = searchParams.get("provider"); // "google" or "github"

    if (!provider || !["google", "github"].includes(provider)) {
      return NextResponse.json(
        { error: "Invalid provider. Use 'google' or 'github'" },
        { status: 400 }
      );
    }

    // Generate PKCE for social auth
    const { codeVerifier, codeChallenge, state } = generatePKCE();

    const kiroService = new KiroService();
    const authUrl = kiroService.buildSocialLoginUrl(
      provider,
      codeChallenge,
      state
    );

    const response = NextResponse.json({
      authUrl,
      state,
      codeVerifier,
      codeChallenge,
      provider,
      targetProvider,
    });

    const stateToken = await V4.sign({
      state,
      codeVerifier,
      provider,
      targetProvider,
    }, OAUTH_STATE_PRIVATE_KEY, {
      expiresIn: `${OAUTH_STATE_TTL_SECONDS}s`,
    });

    response.cookies.set(OAUTH_STATE_COOKIE, stateToken, {
      httpOnly: true,
      secure: request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    console.log("Kiro social authorize error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
