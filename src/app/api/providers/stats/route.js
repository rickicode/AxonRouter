import { NextResponse } from "next/server";
import { getProviderSummaryStats } from "@/models";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getProviderSummaryStats();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error fetching provider stats:", error);
    return NextResponse.json({ error: "Failed to fetch provider stats" }, { status: 500 });
  }
}
