import { NextResponse } from "next/server";
import {
  getCurrentAllSyncedAvailableModels,
  getCurrentSyncedAvailableModelsForConnection,
} from "@/lib/modelCatalogAccess";

export const dynamic = "force-dynamic";

type SyncedModelsByConnection = Record<string, unknown>;
type SyncedAvailableModels = Record<string, SyncedModelsByConnection>;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const connectionId = searchParams.get("connectionId");

    if (provider && connectionId) {
      const models = await getCurrentSyncedAvailableModelsForConnection(provider, connectionId);
      return NextResponse.json({ provider, connectionId, models });
    }

    const syncedAvailableModels =
      (await getCurrentAllSyncedAvailableModels()) as SyncedAvailableModels;

    if (provider) {
      return NextResponse.json({
        provider,
        modelsByConnection: syncedAvailableModels[provider] || {},
      });
    }

    return NextResponse.json({ models: syncedAvailableModels });
  } catch (error) {
    console.log("Error fetching synced available models:", error);
    return NextResponse.json(
      { error: "Failed to fetch synced available models" },
      { status: 500 },
    );
  }
}
