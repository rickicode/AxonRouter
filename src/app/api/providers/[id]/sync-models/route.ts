import { NextResponse } from "next/server";
import { importManagedModels } from "@/lib/providerModels/managedModelImport";
import { GET as getProviderModels } from "../models/route";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type ProviderModelsResponseBody = {
  error?: string;
  warning?: string | null;
  models?: unknown[];
};

type ModelsModule = typeof import("@/models");

async function loadModels(): Promise<ModelsModule> {
  return import("@/models");
}

async function readJsonResponse(response: Response): Promise<{
  data: ProviderModelsResponseBody;
  parseError: string | null;
}> {
  const body = await response.text();
  if (!body.trim()) {
    return { data: {}, parseError: "Empty response body from /models" };
  }

  try {
    return { data: JSON.parse(body) as ProviderModelsResponseBody, parseError: null };
  } catch {
    return { data: {}, parseError: "Invalid JSON response from /models" };
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { getProviderConnectionById } = await loadModels();
    const { id } = await params;
    const connection = await getProviderConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") === "import" ? "merge" : "sync";

    const forwardedHeaders = new Headers();
    const authHeader = request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie");
    const userHeader = request.headers.get("x-user-id");

    if (authHeader) forwardedHeaders.set("authorization", authHeader);
    if (cookieHeader) forwardedHeaders.set("cookie", cookieHeader);
    if (userHeader) forwardedHeaders.set("x-user-id", userHeader);

    const modelsResponse = await getProviderModels(
      new Request(`http://localhost/api/providers/${encodeURIComponent(id)}/models?refresh=true`, {
        method: "GET",
        headers: forwardedHeaders,
      }),
      { params: Promise.resolve({ id }) }
    );

    const { data, parseError } = await readJsonResponse(modelsResponse);
    if (!modelsResponse.ok || parseError) {
      return NextResponse.json(
        { error: data?.error || parseError || "Failed to fetch models for sync" },
        { status: modelsResponse.ok ? 502 : modelsResponse.status }
      );
    }

    const fetchedModels = Array.isArray(data?.models) ? data.models : [];
    const imported = await importManagedModels({
      providerId: connection.provider,
      connectionId: connection.id,
      fetchedModels,
      mode,
    } as any);

    return NextResponse.json({
      provider: connection.provider,
      connectionId: connection.id,
      fetchedCount: fetchedModels.length,
      syncedCount: imported.syncedAvailableModels.length,
      importedChanges: imported.importedChanges,
      models: imported.syncedAvailableModels,
      mode,
      warning: data?.warning || null,
    });
  } catch (error) {
    console.log("Error syncing provider models:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync provider models" },
      { status: 500 }
    );
  }
}
