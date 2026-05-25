import type { NextResponse } from "next/server";
import { getCurrentSettings } from "@/lib/settingsAccess";
import { DEFAULT_AXONROUTER_BASE_URL } from "@/shared/constants/runtimeDefaults";

export type MitmStatus = {
  running?: boolean;
  pid?: number | null;
  certExists?: boolean;
  certTrusted?: boolean;
  dnsStatus?: Record<string, unknown>;
};

async function loadMitmStatusForApi() {
  const mod = (await import("@/mitm/statusFacade")) as unknown as {
    getMitmStatusForApi: () => Promise<{
      status: MitmStatus;
      hasCachedPassword: boolean;
    }>;
  };
  return mod.getMitmStatusForApi();
}

const isWin = process.platform === "win32";

function getExecSync() {
  const { execSync } = require("child_process") as typeof import("child_process");
  return execSync;
}

function checkIsAdmin(): boolean {
  if (!isWin) return true;
  try {
    getExecSync()("net session >nul 2>&1", { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function getAntigravityMitmStatusPayload() {
  const [{ status, hasCachedPassword }, settings] = await Promise.all([
    loadMitmStatusForApi(),
    getCurrentSettings(),
  ]);

  return {
    running: status.running,
    pid: status.pid || null,
    certExists: status.certExists || false,
    certTrusted: status.certTrusted || false,
    dnsStatus: status.dnsStatus || {},
    hasCachedPassword,
    isAdmin: checkIsAdmin(),
    serverPlatform: process.platform,
    requiresSudo: !isWin,
    mitmRouterBaseUrl:
      (settings.mitmRouterBaseUrl && String(settings.mitmRouterBaseUrl).trim()) ||
      DEFAULT_AXONROUTER_BASE_URL,
  };
}
