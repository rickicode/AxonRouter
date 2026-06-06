// This API route is called automatically to initialize the app
// Note: dynamic import via computed path intentionally used to prevent
// Next.js from statically tracing ensureAppInitialized at build time.
// The webpack ignoreWarnings filter in next.config.mjs suppresses the
// resulting "dependency is an expression" warning.
export async function GET(): Promise<Response> {
  const p = ["@/lib", "initApp"].join("/");
  const { ensureAppInitialized } = await import(p);
  await ensureAppInitialized();
  return new Response("Initialized", { status: 200 });
}
