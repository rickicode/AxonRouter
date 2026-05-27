import { getApiKeys, getSettings, updateSettings } from "@/lib/localDb";
import { dataFileExists } from "@/lib/dataDir";

type MitmInitApi = {
  getMitmStatus: () => Promise<{ running?: boolean }>;
  startMitm: (apiKey: string, password: string) => Promise<unknown>;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  initDbHooks: (getSettingsFn: typeof getSettings, updateSettingsFn: typeof updateSettings) => void;
};

let mitmInitApiPromise: Promise<MitmInitApi> | null = null;

async function loadMitmInitApi(): Promise<MitmInitApi> {
  if (!mitmInitApiPromise) {
    mitmInitApiPromise = import("@/mitm/manager").then((mod) => mod as unknown as MitmInitApi);
  }
  return mitmInitApiPromise;
}

export async function bootstrapMitmRuntimeFromInitializeApp() {
  const mitm = await loadMitmInitApi();

  if (!process.env.MITM_SERVER_PATH) {
    try {
      const thisUrl = new URL(import.meta.url);
      const thisFile = thisUrl.pathname;
      const sep = process.platform === "win32" ? "\\" : "/";
      const parts = thisFile.split(sep);
      // Go up two directories from this file to get src/
      parts.pop(); // remove filename
      parts.pop(); // remove mitm/
      const appSrc = parts.join(sep);
      const candidate = appSrc + sep + "mitm" + sep + "server.ts";
      if (dataFileExists(candidate)) {
        process.env.MITM_SERVER_PATH = candidate;
      }
    } catch {
      // ignore
    }
  }

  try {
    mitm.initDbHooks(getSettings, updateSettings);
  } catch {
    // ignore
  }

  return mitm;
}

export async function autoStartMitmIfEnabled() {
  const settings = await getSettings();
  if (!settings.mitmEnabled) return;

  const mitm = await bootstrapMitmRuntimeFromInitializeApp();
  const mitmStatus = await mitm.getMitmStatus();
  if (mitmStatus.running) return;

  const password = await mitm.loadEncryptedPassword();
  if (!password && process.platform !== "win32") {
    console.log("[InitApp] MITM was enabled but no saved password found, skipping auto-start");
    return;
  }

  const keys = await getApiKeys();
  const activeKey = keys.find((k) => k.isActive !== false);

  console.log("[InitApp] MITM was enabled, auto-starting...");
  await mitm.startMitm(activeKey?.key || "sk_axonrouter", password || "");
  console.log("[InitApp] MITM auto-started");
}
