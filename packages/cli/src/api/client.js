import { request } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

let baseHost = "127.0.0.1";
let basePort = 12711;
let baseProtocol = "http:";
let cliToken = null;

function getDataDir() {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return join(home, ".axonrouter");
}

function ensureCliAuth() {
  if (cliToken) return cliToken;

  const authDir = join(getDataDir(), "auth");
  const tokenPath = join(authDir, "cli-token");
  const secretPath = join(authDir, "cli-secret");

  if (existsSync(tokenPath)) {
    cliToken = readFileSync(tokenPath, "utf-8").trim();
    return cliToken;
  }

  // Generate new credentials
  mkdirSync(authDir, { recursive: true });
  const machineId = getMachineId();
  const secret = randomBytes(32).toString("hex");
  const token = hashToken(machineId + secret);

  writeFileSync(secretPath, secret, "utf-8");
  writeFileSync(tokenPath, token, "utf-8");
  cliToken = token;
  return cliToken;
}

function getMachineId() {
  try {
    // Use a simple hostname + random approach — no external dep needed
    const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || "unknown";
    return `${hostname}-${randomBytes(8).toString("hex")}`;
  } catch {
    return `axon-${randomBytes(8).toString("hex")}`;
  }
}

function hashToken(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// ── Configuration ───────────────────────────────────────────────────────────

export function configure({ host, port, protocol } = {}) {
  if (host) baseHost = host;
  if (port) basePort = port;
  if (protocol) baseProtocol = protocol;
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: baseHost,
      port: basePort,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        "x-axon-cli-token": ensureCliAuth(),
      },
      timeout: 30000,
    };

    if (body) {
      const data = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(data);
    }

    const lib = baseProtocol === "https:" ? httpsRequest : request;
    const req = lib(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── API Methods ─────────────────────────────────────────────────────────────

export async function getTunnelStatus() {
  try {
    const res = await makeRequest("GET", "/api/tunnel/status");
    if (res.status === 200) return res.data;
    return null;
  } catch { return null; }
}

export async function getSettings() {
  const res = await makeRequest("GET", "/api/settings");
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get settings: ${res.status}`);
}

export async function updateSettings(settings) {
  const res = await makeRequest("POST", "/api/settings", settings);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to update settings: ${res.status}`);
}

export async function getProviders() {
  const res = await makeRequest("GET", "/api/providers");
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get providers: ${res.status}`);
}

export async function getProvider(id) {
  const res = await makeRequest("GET", `/api/providers/${id}`);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get provider ${id}: ${res.status}`);
}

export async function testProvider(id) {
  const res = await makeRequest("POST", `/api/providers/${id}/test`);
  return res;
}

export async function deleteProvider(id) {
  const res = await makeRequest("DELETE", `/api/providers/${id}`);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to delete provider: ${res.status}`);
}

export async function getProviderModels(id) {
  const res = await makeRequest("GET", `/api/providers/${id}/models`);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get models: ${res.status}`);
}

export async function getApiKeys() {
  const res = await makeRequest("GET", "/api/keys");
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get API keys: ${res.status}`);
}

export async function createApiKey(name) {
  const res = await makeRequest("POST", "/api/keys", { name });
  if (res.status === 200) return res.data;
  throw new Error(`Failed to create API key: ${res.status}`);
}

export async function deleteApiKey(id) {
  const res = await makeRequest("DELETE", `/api/keys/${id}`);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to delete API key: ${res.status}`);
}

export async function getCombos() {
  const res = await makeRequest("GET", "/api/combos");
  if (res.status === 200) return res.data;
  throw new Error(`Failed to get combos: ${res.status}`);
}

export async function deleteCombo(id) {
  const res = await makeRequest("DELETE", `/api/combos/${id}`);
  if (res.status === 200) return res.data;
  throw new Error(`Failed to delete combo: ${res.status}`);
}

export async function getCliToolSettings(toolId) {
  const res = await makeRequest("GET", `/api/cli-tools/${toolId}`);
  return res;
}

export async function setCliToolSettings(toolId, settings) {
  const res = await makeRequest("POST", `/api/cli-tools/${toolId}`, settings);
  return res;
}

export async function getVersion() {
  const res = await makeRequest("GET", "/api/version");
  return res;
}

export async function getHealth() {
  const res = await makeRequest("GET", "/api/health");
  return res;
}

export async function resetPassword() {
  const res = await makeRequest("POST", "/api/auth/password/reset");
  return res;
}

export async function enableTunnel() {
  const res = await makeRequest("POST", "/api/tunnel/enable");
  return res;
}

export async function disableTunnel() {
  const res = await makeRequest("POST", "/api/tunnel/disable");
  return res;
}
