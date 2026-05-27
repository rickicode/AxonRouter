import { createTailscaleInstallStream } from "@axonrouter/tunnel/tailscaleInstallAccess";

export async function POST(request: Request) {
  const body: any = await request.json().catch(() => ({}));
  return createTailscaleInstallStream(body);
}
