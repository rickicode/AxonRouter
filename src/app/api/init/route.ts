// This API route is called automatically to initialize the app
export async function GET(): Promise<Response> {
  const { ensureAppInitialized } = await import("@/lib/initApp");
  await ensureAppInitialized();
  return new Response("Initialized", { status: 200 });
}
