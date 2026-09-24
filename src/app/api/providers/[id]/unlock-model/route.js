import { NextResponse } from "next/server";
import { getProviderConnectionById, unlockAccountModel } from "@/models";

// POST /api/providers/[id]/unlock-model - Release model affinity lock on account
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const existing = await getProviderConnectionById(id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const updated = await unlockAccountModel(id);
    return NextResponse.json({ ok: true, connection: updated });
  } catch (error) {
    console.log("Error unlocking account model:", error);
    return NextResponse.json({ error: "Failed to unlock model" }, { status: 500 });
  }
}
