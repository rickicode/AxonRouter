import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";

type MitmStatus = {
  running?: boolean;
  pid?: number | null;
  certExists?: boolean;
  certTrusted?: boolean;
  dnsStatus?: Record<string, unknown>;
};

export type AntigravityMitmManager = {
  initDbHooks: any;
  getMitmStatus: () => Promise<MitmStatus>;
  getCachedPassword: () => string | null | undefined;
  loadEncryptedPassword: () => Promise<string | null | undefined>;
  setMitmRouterBaseUrl: (input: unknown) => Promise<string>;
  startServer: (apiKey: string, password: string) => Promise<{ running?: boolean; pid?: number | null }>;
  setCachedPassword: (password: string) => void;
  stopServer: (password: string) => Promise<void>;
  enableToolDNS: (tool: string, password: string) => Promise<void>;
  disableToolDNS: (tool: string, password: string) => Promise<void>;
  trustCert: (password: string) => Promise<void>;
};

let mitmManagerPromise: Promise<AntigravityMitmManager> | null = null;

export async function loadAntigravityMitmRuntimeBase(): Promise<AntigravityMitmManager> {
  if (!mitmManagerPromise) {
    mitmManagerPromise = import("@/mitm/manager").then((mod) => {
      const mitmManager = mod as unknown as AntigravityMitmManager;
      mitmManager.initDbHooks(getCurrentSettings, updateCurrentSettings);
      return mitmManager;
    });
  }
  return mitmManagerPromise;
}

export async function resolveAntigravityMitmPassword(
  manager: Pick<AntigravityMitmManager, "getCachedPassword" | "loadEncryptedPassword">,
  sudoPassword?: string,
) {
  return sudoPassword || manager.getCachedPassword?.() || (await manager.loadEncryptedPassword()) || "";
}
