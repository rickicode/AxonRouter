import { NextResponse } from "next/server";
import {
  getProxyGroupById,
  getProxyGroupByName,
  updateProxyGroup,
  deleteProxyGroup,
  countProxyGroupBoundConnections,
  getSettings,
  updateSettings,
} from "@/models";
import { matchDefaultGroupType } from "@/lib/network/connectionProxy.js";

// GET /api/proxy-groups/[id]
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const group = await getProxyGroupById(id);
    if (!group) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }
    return NextResponse.json({ group });
  } catch (error) {
    console.log("Error fetching proxy group:", error);
    return NextResponse.json({ error: "Failed to fetch proxy group" }, { status: 500 });
  }
}

// PUT /api/proxy-groups/[id]
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const defaultType = matchDefaultGroupType(id);
    const body = await request.json();

    if (defaultType) {
      const isSticky = body.isSticky === true;
      const num = Number(body.stickyLimit);
      const stickyLimit = Number.isFinite(num) && num > 0 ? Math.floor(num) : 3;

      const settings = await getSettings();
      const currentDefaultSettings = settings?.defaultProxyGroupSettings || {};
      const nextSettings = {
        ...currentDefaultSettings,
        [defaultType]: { isSticky, stickyLimit },
      };

      await updateSettings({ defaultProxyGroupSettings: nextSettings });
      return NextResponse.json({
        group: {
          id: `default-${defaultType}`,
          key: defaultType,
          isDefault: true,
          isSticky,
          stickyLimit,
        },
      });
    }

    const existing = await getProxyGroupById(id);
    if (!existing) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }

    const patch = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "Group name cannot be empty" }, { status: 400 });
      }
      if (name.toLowerCase() !== existing.name.toLowerCase()) {
        const nameCollision = await getProxyGroupByName(name);
        if (nameCollision && nameCollision.id !== id) {
          return NextResponse.json(
            { error: `Proxy group "${name}" already exists` },
            { status: 409 },
          );
        }
      }
      patch.name = name;
    }

    if (body.description !== undefined) {
      patch.description = String(body.description).trim();
    }

    if (body.isSticky !== undefined) {
      patch.isSticky = body.isSticky === true;
    }

    if (body.stickyLimit !== undefined) {
      const num = Number(body.stickyLimit);
      patch.stickyLimit = Number.isFinite(num) && num > 0 ? Math.floor(num) : 3;
    }

    if (body.poolIds !== undefined) {
      patch.poolIds = Array.isArray(body.poolIds)
        ? [...new Set(body.poolIds.map(String).filter(Boolean))]
        : [];
    }

    const updated = await updateProxyGroup(id, patch);
    return NextResponse.json({ group: updated });
  } catch (error) {
    console.log("Error updating proxy group:", error);
    return NextResponse.json({ error: error.message || "Failed to update proxy group" }, { status: 500 });
  }
}

// DELETE /api/proxy-groups/[id]
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (matchDefaultGroupType(id)) {
      return NextResponse.json({ error: "System default groups cannot be deleted" }, { status: 400 });
    }
    const existing = await getProxyGroupById(id);
    if (!existing) {
      return NextResponse.json({ error: "Proxy group not found" }, { status: 404 });
    }

    // Check if group is bound to any connection by id or name
    const boundById = await countProxyGroupBoundConnections(id);
    const boundByName = await countProxyGroupBoundConnections(existing.name);
    const totalBound = boundById + boundByName;

    if (totalBound > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete group "${existing.name}". It is currently in use by ${totalBound} connection(s).`,
          boundCount: totalBound,
        },
        { status: 409 },
      );
    }

    const deleted = await deleteProxyGroup(id);
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    console.log("Error deleting proxy group:", error);
    return NextResponse.json({ error: error.message || "Failed to delete proxy group" }, { status: 500 });
  }
}
