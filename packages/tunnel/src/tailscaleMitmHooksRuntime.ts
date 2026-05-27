import { getTunnelDeps } from "./deps";

type MitmManagerHooks = {
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  initDbHooks: (
    getSettingsFn: () => Promise<any>,
    updateSettingsFn: (updates: Record<string, unknown>) => Promise<any>
  ) => void;
};

let mitmHooksPromise: Promise<MitmManagerHooks> | null = null;

export async function getTailscaleMitmHooks(): Promise<MitmManagerHooks> {
  if (!mitmHooksPromise) {
    mitmHooksPromise = (async () => {
      const { getCurrentSettings, updateCurrentSettings, getMitmStatusFacade } = getTunnelDeps();
      const mod = await getMitmStatusFacade();
      const hooks = mod as unknown as MitmManagerHooks;
      hooks.initDbHooks(getCurrentSettings, updateCurrentSettings);
      return hooks;
    })();
  }
  return mitmHooksPromise;
}
