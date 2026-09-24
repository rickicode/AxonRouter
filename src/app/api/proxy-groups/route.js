import { NextResponse } from "next/server";
import {
  getProxyGroups,
  createProxyGroup,
  getProxyPools,
  getProxyGroupByName,
  getSettings,
} from "@/models";

export const DEFAULT_PROXY_GROUPS = [
  {
    id: "default-cloudflare",
    key: "cloudflare",
    name: "Cloudflare Relay",
    type: "cloudflare",
    description: "Auto-groups all active Cloudflare relay pools",
    isDefault: true,
    isSticky: false,
    stickyLimit: 1,
  },
  {
    id: "default-http",
    key: "http",
    name: "HTTP",
    type: "http",
    description: "Auto-groups all active HTTP proxy pools",
    isDefault: true,
    isSticky: false,
    stickyLimit: 1,
  },
  {
    id: "default-vercel",
    key: "vercel",
    name: "Vercel",
    type: "vercel",
    description: "Auto-groups all active Vercel relay pools",
    isDefault: true,
    isSticky: false,
    stickyLimit: 1,
  },
  {
    id: "default-deno",
    key: "deno",
    name: "Deno",
    type: "deno",
    description: "Auto-groups all active Deno relay pools",
    isDefault: true,
    isSticky: false,
    stickyLimit: 1,
  },
];

const RESERVED_NAMES = new Set([
  "cloudflare",
  "cloudflare relay",
  "http",
  "vercel",
  "deno",
  "default-cloudflare",
  "default-http",
  "default-vercel",
  "default-deno",
]);

// GET /api/proxy-groups - List default and custom proxy groups
export async function GET() {
  try {
    const [allPools, customGroups, settings] = await Promise.all([
      getProxyPools(),
      getProxyGroups(),
      getSettings().catch(() => ({})),
    ]);

    const activePoolsMap = new Map();
    for (const pool of allPools) {
      if (pool.isActive === true) {
        activePoolsMap.set(pool.id, pool);
      }
    }

    const defaultSettingsMap = settings?.defaultProxyGroupSettings || {};

    // Populate counts and sticky settings for default groups
    const defaultGroups = DEFAULT_PROXY_GROUPS.map((def) => {
      const matchingAll = allPools.filter((p) => p.type === def.type);
      const matchingActive = matchingAll.filter((p) => p.isActive === true);
      const defCfg = defaultSettingsMap[def.type] || {};
      const isSticky = defCfg.isSticky === true;
      const stickyLimit = Number(defCfg.stickyLimit) > 0 ? Number(defCfg.stickyLimit) : 3;

      return {
        ...def,
        isSticky,
        stickyLimit,
        poolCount: matchingAll.length,
        activeCount: matchingActive.length,
      };
    });

    // Populate counts for custom groups
    const enrichedCustomGroups = customGroups.map((g) => {
      const poolIds = Array.isArray(g.poolIds) ? g.poolIds : [];
      let activeCount = 0;
      for (const id of poolIds) {
        if (activePoolsMap.has(id)) activeCount += 1;
      }
      return {
        ...g,
        isDefault: false,
        poolCount: poolIds.length,
        activeCount,
      };
    });

    return NextResponse.json({
      defaultGroups,
      customGroups: enrichedCustomGroups,
      groups: [...defaultGroups, ...enrichedCustomGroups],
    });
  } catch (error) {
    console.log("Error listing proxy groups:", error);
    return NextResponse.json({ error: "Failed to fetch proxy groups" }, { status: 500 });
  }
}

// POST /api/proxy-groups - Create a custom proxy group
export async function POST(request) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const isSticky = body?.isSticky === true;
    const stickyLimitNum = Number(body?.stickyLimit);
    const stickyLimit = Number.isFinite(stickyLimitNum) && stickyLimitNum > 0 ? Math.floor(stickyLimitNum) : 3;
    const poolIds = Array.isArray(body?.poolIds) ? [...new Set(body.poolIds.map(String).filter(Boolean))] : [];

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    if (RESERVED_NAMES.has(name.toLowerCase())) {
      return NextResponse.json(
        { error: `"${name}" is a reserved system default group name` },
        { status: 400 },
      );
    }

    const existing = await getProxyGroupByName(name);
    if (existing) {
      return NextResponse.json(
        { error: `Proxy group "${name}" already exists` },
        { status: 409 },
      );
    }

    const group = await createProxyGroup({
      name,
      description,
      isSticky,
      stickyLimit,
      poolIds,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.log("Error creating proxy group:", error);
    return NextResponse.json({ error: error.message || "Failed to create proxy group" }, { status: 500 });
  }
}
