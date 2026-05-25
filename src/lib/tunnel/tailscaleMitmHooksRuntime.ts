import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

type MitmManagerHooks = {
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  initDbHooks: (
    getSettingsFn: typeof getCurrentSettings,
    updateSettingsFn: typeof updateCurrentSettings
  ) => void;
};

let mitmHooksPromise: Promise<MitmManagerHooks> | null = null;

export async function getTailscaleMitmHooks(): Promise<MitmManagerHooks> {
  if (!mitmHooksPromise) {
    mitmHooksPromise = import("@/mitm/statusFacade").then((mod) => {
      const hooks = mod as unknown as MitmManagerHooks;
      hooks.initDbHooks(getCurrentSettings, updateCurrentSettings);
      return hooks;
    });
  }
  return mitmHooksPromise;
}
