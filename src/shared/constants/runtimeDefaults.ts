import runtimeDefaults from "./runtimeDefaults.json" with { type: "json" };

export const DEFAULT_AXONROUTER_PORT = runtimeDefaults.defaultPort;
export const DEFAULT_AXONROUTER_BASE_URL = runtimeDefaults.defaultBaseUrl;
export const DEFAULT_AXONROUTER_API_BASE_URL = runtimeDefaults.defaultApiBaseUrl;

export function getDefaultAxonRouterBaseUrl(port = DEFAULT_AXONROUTER_PORT) {
  return `http://localhost:${port}`;
}

export function getDefaultAxonRouterApiBaseUrl(port = DEFAULT_AXONROUTER_PORT) {
  return `${getDefaultAxonRouterBaseUrl(port)}/v1`;
}
