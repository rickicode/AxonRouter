// The upstream cli-chat-proxy gates on the client build and rejects anything older
// than 1.0.13 with HTTP 426: "Your Grok CLI version (0.2.99) is outdated. Please
// update to version 1.0.13 or later via `grok update` or the installation
// documentation." That surfaced on real accounts, not just one, and 426 was
// unhandled (unknown 4xx → shouldFallback:false), so the request died on the first
// combo member in 0.45s. Bumping the advertised version clears the gate.
export const GROK_CLI_VERSION = "1.0.13";
export const GROK_CLI_MODEL = "grok-4.6";
export const GROK_CLI_BASE_URL = "https://cli-chat-proxy.grok.com/v1";
export const GROK_CLI_CLIENT_IDENTIFIER = "grok-shell";
export const GROK_CLI_USER_AGENT = `grok-shell/${GROK_CLI_VERSION} (linux; x86_64)`;

export function supportsGrokCliReasoningEffort(model) {
  // ponytail: unknown models omit effort until live metadata reaches dispatch.
  return /^grok-4\.[567](?:$|-)/.test(String(model || ""));
}
