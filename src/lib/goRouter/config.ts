import os from "node:os";
import path from "node:path";

export type GoRouterSettings = {
  enabled: boolean;
  host: string;
  port: number;
};

export type GoRouterConfig = GoRouterSettings & {
  endpointUrl: string;
  mode: "alternative";
};

export const DEFAULT_GO_ROUTER_SETTINGS: GoRouterSettings = Object.freeze({
  enabled: false,
  host: "127.0.0.1",
  port: 12778,
});

function toPort(value: unknown) {
  const port = Number(value ?? DEFAULT_GO_ROUTER_SETTINGS.port);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_GO_ROUTER_SETTINGS.port;
}

function toHost(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_GO_ROUTER_SETTINGS.host;
}

export function getGoRouterBinaryPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".axonrouter", "bin", "axonrouter-go-router");
}

export function normalizeGoRouterSettings(value: Partial<GoRouterSettings> = {}): GoRouterConfig {
  const host = toHost(value.host);
  const port = toPort(value.port);
  return {
    enabled: value.enabled === true,
    host,
    port,
    endpointUrl: `http://${host}:${port}/v1`,
    mode: "alternative",
  };
}
