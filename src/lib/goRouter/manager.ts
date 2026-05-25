import { spawn, type ChildProcess } from "node:child_process";
import { getCurrentSettings, updateCurrentSettings } from "@/lib/settingsAccess";
import { getGoRouterBinaryPath, normalizeGoRouterSettings, type GoRouterConfig, type GoRouterSettings } from "@/lib/goRouter/config";

type GoRouterStatus = GoRouterConfig & {
  running: boolean;
  pid: number | null;
  binaryPath: string;
  lastError: string | null;
};

let child: ChildProcess | null = null;
let lastError: string | null = null;

function isChildRunning() {
  if (!child?.pid) return false;
  if (child.exitCode !== null || child.signalCode !== null) return false;
  return true;
}

async function readConfig() {
  const settings = await getCurrentSettings();
  return normalizeGoRouterSettings(settings.goRouter || {});
}

function getMainAppBaseUrl() {
  const port = process.env.PORT || "12711";
  const host = process.env.HOSTNAME || "127.0.0.1";
  const protocol = process.env.HTTPS === "true" ? "https" : "http";
  return `${protocol}://${host}:${port}`;
}

function statusFromConfig(config: GoRouterConfig): GoRouterStatus {
  return {
    ...config,
    running: config.enabled && isChildRunning(),
    pid: isChildRunning() ? child?.pid || null : null,
    binaryPath: getGoRouterBinaryPath(),
    lastError,
  };
}

function spawnGoRouter(config: GoRouterConfig) {
  lastError = null;
  child = spawn(
    getGoRouterBinaryPath(),
    [
      "--host",
      config.host,
      "--port",
      String(config.port),
      "--upstream-base-url",
      getMainAppBaseUrl(),
    ],
    {
      detached: false,
      stdio: "ignore",
    },
  );
  child.once("error", (error) => {
    lastError = error.message;
    child = null;
  });
  child.once("exit", (_code, signal) => {
    if (!lastError && signal) {
      lastError = `Go router exited via ${signal}`;
    }
    child = null;
  });
  child.unref?.();
}

export async function ensureGoRouter() {
  const config = await readConfig();
  if (!config.enabled) return statusFromConfig(config);
  if (!isChildRunning()) spawnGoRouter(config);
  return statusFromConfig(config);
}

export async function getGoRouterStatus() {
  return statusFromConfig(await readConfig());
}

export async function stopGoRouter() {
  child?.kill("SIGTERM");
  child = null;
}

export async function updateGoRouterSettings(settings: Partial<GoRouterSettings>) {
  const next = normalizeGoRouterSettings(settings);
  await updateCurrentSettings({ goRouter: next });
  if (!next.enabled) await stopGoRouter();
  return next.enabled ? ensureGoRouter() : statusFromConfig(next);
}

export async function restartGoRouter() {
  lastError = null;
  await stopGoRouter();
  return ensureGoRouter();
}
