import { NextResponse } from "next/server";
import {
  buildMorphManagedConnection,
  injectMorphManagedProvider,
} from "@/app/api/providers/_morphManaged";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentProviderConnections } from "@/lib/connectionAccess";

type JsonRecord = Record<string, unknown>;

// GET /api/providers/client - List all connections for client (includes sensitive fields for sync)
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const rawConnections = await getCurrentProviderConnections();
    const morphManagedConnection = await buildMorphManagedConnection();
    const connections = [
      ...injectMorphManagedProvider(rawConnections),
      morphManagedConnection,
    ];

    // Include sensitive fields for sync to cloud (only accessible from same origin)
    const clientConnections = connections.map((connection) => ({
      ...((connection ?? {}) as JsonRecord),
      // Don't hide sensitive fields here since this is for internal sync
    }));

    return NextResponse.json({ connections: clientConnections });
  } catch (error) {
    console.log("Error fetching providers for client:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}
