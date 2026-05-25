import { NextResponse } from "next/server";
import { getCurrentSettings } from "@/lib/settingsAccess";

type RequireLoginSettings = {
  tunnelDashboardAccess?: boolean;
  tunnelUrl?: string;
  tailscaleUrl?: string;
};

export async function GET() {
  try {
    const settings = (await getCurrentSettings()) as RequireLoginSettings;
    const tunnelDashboardAccess = settings.tunnelDashboardAccess !== false;
    const tunnelUrl = settings.tunnelUrl || "";
    const tailscaleUrl = settings.tailscaleUrl || "";

    return NextResponse.json({ tunnelDashboardAccess, tunnelUrl, tailscaleUrl });
  } catch (_error) {
    return NextResponse.json({ tunnelDashboardAccess: true }, { status: 200 });
  }
}
