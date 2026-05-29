export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Use computed path to prevent Turbopack from statically tracing this import
    const p = ["@/shared/services", "initializeApp"].join("/");
    await import(p);
  }
}
