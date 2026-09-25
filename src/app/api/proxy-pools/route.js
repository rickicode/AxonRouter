import { NextResponse } from "@/lib/http/response.js";
import { createProxyPool, getProxyPoolBoundCounts, getProxyPools, deleteDisabledProxyPools } from "@/models";
import { getPoolGeo } from "open-sse/services/poolGeo.js";

function toBoolean(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

const VALID_PROXY_TYPES = ["http", "vercel", "cloudflare", "deno"];

function normalizeProxyPoolInput(body = {}) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const proxyUrl = typeof body?.proxyUrl === "string" ? body.proxyUrl.trim() : "";
  const noProxy = typeof body?.noProxy === "string" ? body.noProxy.trim() : "";
  const isActive = body?.isActive === undefined ? true : body.isActive === true;
  const group = typeof body?.group === "string" ? body.group.trim() : "";
  const strictProxy = body?.strictProxy === true;
  const type = VALID_PROXY_TYPES.includes(body?.type) ? body.type : "http";

  if (!name) {
    return { error: "Name is required" };
  }

  if (!proxyUrl) {
    return { error: "Proxy URL is required" };
  }

  return { name, proxyUrl, noProxy, isActive, strictProxy, type, group };
}

// GET /api/proxy-pools - List proxy pools
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const isActive = toBoolean(searchParams.get("isActive"));
    const includeUsage = searchParams.get("includeUsage") === "true";

    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const proxyPools = await getProxyPools(filter);

    if (!includeUsage) {
      return NextResponse.json({ proxyPools });
    }

    const usageMap = await getProxyPoolBoundCounts();

    const enrichedProxyPools = proxyPools.map((pool) => ({
      ...pool,
      boundConnectionCount: usageMap[pool.id] || 0,
      // Egress geo from the background probe cache (null until first probe).
      egress: getPoolGeo(pool.id) || null,
    }));

    return NextResponse.json({ proxyPools: enrichedProxyPools });
  } catch (error) {
    console.log("Error fetching proxy pools:", error);
    return NextResponse.json({ error: "Failed to fetch proxy pools" }, { status: 500 });
  }
}

// POST /api/proxy-pools - Create proxy pool
export async function POST(request) {
  try {
    const body = await request.json();
    const normalized = normalizeProxyPoolInput(body);

    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const proxyPool = await createProxyPool(normalized);
    return NextResponse.json({ proxyPool }, { status: 201 });
  } catch (error) {
    console.log("Error creating proxy pool:", error);
    return NextResponse.json({ error: "Failed to create proxy pool" }, { status: 500 });
  }
}

// DELETE /api/proxy-pools - Bulk delete operations (e.g. ?scope=disabled)
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope");
    if (scope === "disabled") {
      const deleted = await deleteDisabledProxyPools();
      return NextResponse.json({ success: true, count: deleted.length, deleted });
    }
    return NextResponse.json({ error: "Invalid or missing scope parameter" }, { status: 400 });
  } catch (error) {
    console.log("Error deleting proxy pools:", error);
    return NextResponse.json({ error: "Failed to delete proxy pools" }, { status: 500 });
  }
}
