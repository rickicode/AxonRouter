"use server";

import { createTailscaleInstallStream } from "@/lib/tunnel/tailscaleInstallAccess";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  return createTailscaleInstallStream(body);
}
