import { NextResponse } from "next/server";
import { validateCurrentApiKey } from "@/lib/apiKeyAccess";
import { getCurrentProviderConnections } from "@/lib/settingsAccess";
import { updateCurrentProviderConnection } from "@/lib/connectionStateWriteAccess";

type UpdateCredentialsPayload = {
  provider?: string;
  credentials?: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
  };
};

// Update provider credentials (for cloud token refresh)
export async function PUT(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const body = (await request.json()) as UpdateCredentialsPayload;
    const { provider, credentials } = body;

    if (!provider || !credentials) {
      return NextResponse.json({ error: "Provider and credentials required" }, { status: 400 });
    }

    // Validate API key
    const isValid = await validateCurrentApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    // Find active connection for provider
    const connections = await getCurrentProviderConnections({
      provider,
      isActive: true,
    });
    const connection = Array.isArray(connections) ? connections[0] || null : null;

    if (!connection) {
      return NextResponse.json(
        { error: `No active connection found for provider: ${provider}` },
        { status: 404 },
      );
    }

    const updateData: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: string;
    } = {};

    if (credentials.accessToken) {
      updateData.accessToken = credentials.accessToken;
    }
    if (credentials.refreshToken) {
      updateData.refreshToken = credentials.refreshToken;
    }
    if (credentials.expiresIn) {
      updateData.expiresAt = new Date(Date.now() + credentials.expiresIn * 1000).toISOString();
    }

    await updateCurrentProviderConnection(connection.id, updateData);

    return NextResponse.json({
      success: true,
      message: `Credentials updated for provider: ${provider}`,
    });
  } catch (error) {
    console.log("Update credentials error:", error);
    return NextResponse.json({ error: "Failed to update credentials" }, { status: 500 });
  }
}
