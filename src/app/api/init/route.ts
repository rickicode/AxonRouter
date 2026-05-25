// This API route is called automatically to initialize sync
export async function GET(): Promise<Response> {
  const { ensureAppInitialized } = await import("@/lib/initCloudSync");
  await ensureAppInitialized();
  return new Response("Initialized", { status: 200 });
}
