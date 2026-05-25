import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

type MitmStatusModule = {
  initDbHooks: (getSettings: typeof getCurrentSettings, updateSettings: typeof updateCurrentSettings) => void;
  getMitmStatus: () => Promise<{
    running?: boolean;
    pid?: number | null;
    certExists?: boolean;
    certTrusted?: boolean;
    dnsStatus?: Record<string, unknown>;
  }>;
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
};

let mitmStatusModulePromise: Promise<MitmStatusModule> | null = null;

export async function loadMitmStatusRuntime(): Promise<MitmStatusModule> {
  if (!mitmStatusModulePromise) {
    mitmStatusModulePromise = import("@/mitm/manager").then((mod) => {
      const runtime = mod as unknown as MitmStatusModule;
      runtime.initDbHooks(getCurrentSettings, updateCurrentSettings);
      return runtime;
    });
  }
  return mitmStatusModulePromise;
}
