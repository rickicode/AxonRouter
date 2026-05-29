// This API route is called automatically to initialize the app
export async function GET(): Promise<Response> {
  // Use computed path to prevent Turbopack from statically tracing this import
  const p = ["@/lib", "initApp"].join("/");
  const { ensureAppInitialized } = await import(p);
  await ensureAppInitialized();
  return new Response("Initialized", { status: 200 });
}
