import { NextResponse } from "next/server";
import { bulkUpdateProviderProxy } from "@/models";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      provider,
      ids,
      action,
      proxyPoolId,
      proxyGroup,
      proxyRotationStrategy,
      proxyPoolIds,
      activePoolIds,
    } = body;

    if (!provider && (!Array.isArray(ids) || ids.length === 0)) {
      return NextResponse.json({ error: "provider or ids is required" }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const result = await bulkUpdateProviderProxy({
      provider,
      ids,
      action,
      proxyPoolId,
      proxyGroup,
      proxyRotationStrategy,
      proxyPoolIds,
      activePoolIds,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error bulk updating provider proxy:", error);
    return NextResponse.json({ error: error?.message || "Failed to update proxy" }, { status: 500 });
  }
}
