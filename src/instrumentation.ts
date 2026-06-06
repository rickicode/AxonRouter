export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { default: initializeApp } = await import("@/shared/services/initializeApp");
    await initializeApp();
  }
}
