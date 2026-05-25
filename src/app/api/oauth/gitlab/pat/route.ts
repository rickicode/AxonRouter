import { NextResponse } from "next/server";
import { createCurrentProviderConnection } from "@/lib/connectionAccess";
import { finalizePostConnectValidation } from "@/lib/oauth/postConnectValidation";

const GITLAB_DEFAULT_BASE = "https://gitlab.com";

type GitLabPatRequestBody = {
  token?: string;
  baseUrl?: string;
};

type GitLabUser = {
  email?: string;
  public_email?: string;
  name?: string;
  username?: string;
};

/**
 * POST /api/oauth/gitlab/pat
 * Authenticate GitLab Duo with a Personal Access Token (PAT)
 */
export async function POST(request: Request) {
  try {
    let body: GitLabPatRequestBody;
    try {
      body = (await request.json()) as GitLabPatRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, baseUrl } = body;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Personal Access Token is required" }, { status: 400 });
    }

    const base = (baseUrl?.trim() || GITLAB_DEFAULT_BASE).replace(/\/$/, "");

    // Verify token by fetching current user
    const userRes = await fetch(`${base}/api/v4/user`, {
      headers: { "Private-Token": token.trim(), Accept: "application/json" },
    });

    if (!userRes.ok) {
      const err = await userRes.text();
      return NextResponse.json({ error: `GitLab token verification failed: ${err}` }, { status: 401 });
    }

    const user = (await userRes.json()) as GitLabUser;
    const email = user.email || user.public_email || "";

    const connection = await createCurrentProviderConnection({
      provider: "gitlab",
      authType: "oauth",
      accessToken: token.trim(),
      refreshToken: null,
      expiresAt: null,
      email,
      displayName: user.name || user.username || email,
      providerSpecificData: {
        username: user.username || "",
        email,
        name: user.name || "",
        baseUrl: base,
        authKind: "personal_access_token",
      },
    });

    const latestConnection = await finalizePostConnectValidation(connection, "GitLab PAT");

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
  } catch (error) {
    console.error("GitLab PAT auth error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
