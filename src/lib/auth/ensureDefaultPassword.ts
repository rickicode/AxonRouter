import bcrypt from "bcryptjs";
import { DEFAULT_DASHBOARD_PASSWORD } from "@/shared/constants/auth";
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Ensure a dashboard password exists in settings.
 *
 * - If settings already has a hashed password → skip (do not overwrite).
 * - Otherwise, read `AXONROUTER_PASSWORD` env var.
 *   - If env var is empty/unset → use DEFAULT_DASHBOARD_PASSWORD ("12345677").
 *   - Hash the password with bcrypt and persist to settings.
 *
 * This runs once at startup so the dashboard is always login-ready,
 * even on fresh installs with zero config.
 */
export async function ensureDefaultPassword(): Promise<void> {
  try {
    const { getSettings, updateSettings } = await import("@/lib/localDb");

    const settings = await getSettings();

    // Already configured — skip
    if (settings?.password) {
      return;
    }

    const rawPassword = process.env.AXONROUTER_PASSWORD?.trim() || DEFAULT_DASHBOARD_PASSWORD;

    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const hash = await bcrypt.hash(rawPassword, salt);

    await updateSettings({ password: hash });

    console.log(
      `[Auth] Dashboard password initialized (${rawPassword === DEFAULT_DASHBOARD_PASSWORD ? "default" : "from env"}). ` +
      `Change it via the dashboard Settings page for production use.`,
    );
  } catch (error) {
    // Non-fatal: login route still has local fallback for unhashed default password
    console.error("[Auth] Failed to initialize default password:", error);
  }
}
