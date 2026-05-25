import { NextResponse } from "next/server";
import { validateCurrentApiKey } from "@/lib/apiKeyAccess";
import { getCurrentModelAliases } from "@/lib/modelAliasAccess";
import { getCurrentProviderConnections } from "@/lib/settingsAccess";

type ProviderConnection = {
  provider: string;
  authType: string | null;
  apiKey?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  projectId?: string | null;
  expiresAt?: string | number | Date | null;
  priority?: number | null;
  globalPriority?: number | null;
  defaultModel?: string | null;
  isActive?: boolean;
};

type CloudAuthConnection = {
  provider: string;
  authType: string | null;
  apiKey: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  projectId: string | null;
  expiresAt: string | number | Date | null | undefined;
  priority: number | null | undefined;
  globalPriority: number | null | undefined;
  defaultModel: string | null | undefined;
  isActive: boolean | undefined;
};

type ModelAliases = Record<string, string>;

// Verify API key and return provider credentials
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);

    const isValid = await validateCurrentApiKey(apiKey);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const connections = (await getCurrentProviderConnections({ isActive: true })) as ProviderConnection[];

    const mappedConnections: CloudAuthConnection[] = connections.map((conn) => ({
      provider: conn.provider,
      authType: conn.authType,
      apiKey: conn.apiKey || null,
      accessToken: conn.accessToken || null,
      refreshToken: conn.refreshToken || null,
      projectId: conn.projectId || null,
      expiresAt: conn.expiresAt,
      priority: conn.priority,
      globalPriority: conn.globalPriority,
      defaultModel: conn.defaultModel,
      isActive: conn.isActive,
    }));

    const modelAliases = (await getCurrentModelAliases()) as ModelAliases;

    return NextResponse.json({
      connections: mappedConnections,
      modelAliases,
    });
  } catch (error) {
    console.log("Cloud auth error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
