import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { getCurrentMitmAlias, setCurrentMitmAliasAll } from "@/lib/modelCatalogAccess";

type AliasMappingsPayload = {
  tool?: string;
  mappings?: Record<string, unknown>;
};

type MitmDnsStatusModule = {
  getMitmDnsStatus: () => Record<string, boolean>;
};

async function loadMitmDnsStatus(): Promise<MitmDnsStatusModule> {
  return (await import("@/mitm/dns/status")) as unknown as MitmDnsStatusModule;
}

// GET - Get MITM aliases for a tool
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const toolName = searchParams.get("tool");
    const aliases = await getCurrentMitmAlias(toolName || undefined);
    return NextResponse.json({ aliases });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Error fetching MITM aliases:", message);
    return NextResponse.json({ error: "Failed to fetch aliases" }, { status: 500 });
  }
}

// PUT - Save MITM aliases for a specific tool
export async function PUT(request: Request) {
  try {
    const { tool, mappings } = (await request.json()) as AliasMappingsPayload;

    if (!tool || !mappings || typeof mappings !== "object") {
      return NextResponse.json({ error: "tool and mappings required" }, { status: 400 });
    }

    const { getMitmDnsStatus } = await loadMitmDnsStatus();

    // Check if DNS is enabled for this tool.
    const dnsStatus = getMitmDnsStatus();
    if (!dnsStatus[tool]) {
      return NextResponse.json(
        { error: `DNS must be enabled for ${tool} before editing model mappings` },
        { status: 403 }
      );
    }

    const filtered: Record<string, string> = {};
    for (const [alias, model] of Object.entries(mappings)) {
      if (typeof model === "string" && model.trim()) {
        filtered[alias] = model.trim();
      }
    }

    await setCurrentMitmAliasAll(tool, filtered);
    return NextResponse.json({ success: true, aliases: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("Error saving MITM aliases:", message);
    return NextResponse.json({ error: "Failed to save aliases" }, { status: 500 });
  }
}
