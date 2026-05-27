import { getTunnelDeps } from "./deps";
let mitmHooksPromise = null;
export async function getTailscaleMitmHooks() {
    if (!mitmHooksPromise) {
        mitmHooksPromise = (async () => {
            const { getCurrentSettings, updateCurrentSettings, getMitmStatusFacade } = getTunnelDeps();
            const mod = await getMitmStatusFacade();
            const hooks = mod;
            hooks.initDbHooks(getCurrentSettings, updateCurrentSettings);
            return hooks;
        })();
    }
    return mitmHooksPromise;
}
