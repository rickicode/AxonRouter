const MASK = "axonrouter-public-v1";

function unmaskBytes(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ^ MASK.charCodeAt(i % MASK.length));
  }
  return out;
}

// Pre-encoded Gemini CLI OAuth credentials (public, shipped in the CLI binary)
const GEMINI_CLI_ID_BYTES = [87,64,94,92,71,90,77,68,92,65,20,69,88,13,3,81,5,89,68,94,17,10,11,28,28,31,76,17,86,19,92,22,67,3,26,90,11,64,18,88,3,73,92,91,24,65,20,4,21,1,3,23,26,13,11,5,6,88,5,84,19,27,0,0,6,10,27,0,75,17,66,29] as const;
const GEMINI_CLI_SECRET_BYTES = [38,55,44,61,34,55,88,64,16,58,74,61,37,15,65,88,12,26,37,90,76,31,10,56,68,44,0,65,6,30,117,54,6,26,0] as const;

export function getGeminiCliCredentials() {
  return {
    clientId: process.env.GEMINI_CLI_OAUTH_CLIENT_ID || process.env.GEMINI_OAUTH_CLIENT_ID || unmaskBytes(GEMINI_CLI_ID_BYTES),
    clientSecret: process.env.GEMINI_CLI_OAUTH_CLIENT_SECRET || process.env.GEMINI_OAUTH_CLIENT_SECRET || unmaskBytes(GEMINI_CLI_SECRET_BYTES),
  };
}


// Antigravity OAuth credentials (public; shipped in the Antigravity client binary).
// Hardcoded here as the single source of truth so the quota/usage and chat flows
// work out-of-the-box without requiring environment variables. Env vars may still
// override them for self-hosted deployments.
const ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_CLIENT_SECRET = "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";

export function getAntigravityCredentials() {
  return {
    clientId: process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || ANTIGRAVITY_CLIENT_ID,
    clientSecret: process.env.ANTIGRAVITY_OAUTH_CLIENT_SECRET || ANTIGRAVITY_CLIENT_SECRET,
  };
}
