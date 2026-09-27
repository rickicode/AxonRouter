import { NextResponse } from "@/lib/http/response.js";
import { getProxyGroupById } from "@/models";
import { syncProxyGroupFromUrl } from "open-sse/services/proxyAutoFetcher.js";

// POST /api/proxy-groups/[id]/sync - Manual trigger to sync proxy group from URL
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const group = await getProxyGroupById(id);
    if (!group) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }
    if (!group.fetchUrl) {
      return NextResponse.json(
        { error: `Proxy group "${group.name}" has no fetchUrl configured` },
        { status: 400 },
      );
    }

    const result = await syncProxyGroupFromUrl(id);
    const updatedGroup = result.group || (await getProxyGroupById(id)) || group;

    return NextResponse.json({
      success: true,
      count: result.count ?? 0,
      group: updatedGroup,
      retainedCount: result.retainedCount,
      addedCount: result.addedCount,
      removedCount: result.removedCount,
    });
  } catch (error) {
    console.error("[ProxyGroups] Error syncing group:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sync proxy group" },
      { status: 500 },
    );
  }
}
