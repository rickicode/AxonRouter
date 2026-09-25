export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "@/lib/http/response.js";
import { getClientUsageConnections, getClientUsageMeta, getProviderNodes } from "@/lib/localDb";
import { backfillCodexEmails, backfillCodeBuddyIntlIdentity } from "@/lib/oauth/providers";
import { USAGE_APIKEY_PROVIDERS, USAGE_SUPPORTED_PROVIDERS } from "@/shared/constants/providers";

const SAFE_FIELDS = [
  "id", "provider", "authType", "name", "email", "displayName",
  "priority", "globalPriority", "isActive", "defaultModel",
  "testStatus", "lastError", "lastErrorAt", "errorCode",
  "expiresAt", "lastUsedAt", "consecutiveUseCount",
  "lockedAllUntil", "rateLimitedUntil", "modelLocks",
  "disabledReason", "previousStatus", "disabledAt", "disabledBy",
  "createdAt", "updatedAt",
];

const SAFE_PSD_FIELDS = [
  "baseUrl", "azureEndpoint", "deployment", "apiVersion", "accountId",
  "region", "projectId", "resourceUrl", "proxyPoolId",
  "connectionProxyEnabled", "connectionProxyUrl", "connectionNoProxy",
  "githubLogin", "githubName", "githubEmail", "githubUserId",
  "username", "firstName", "lastName", "authMethod", "authKind",
  "profileArn", "validationUrl", "validationMessage", "validationAt",
];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 500;

function maskName(name) {
  if (typeof name !== "string" || name.length <= 16) return name;
  if (/[a-zA-Z0-9_-]{32,}/.test(name)) return `${name.slice(0, 8)}***`;
  return name;
}

function sanitize(c) {
  const safe = {};
  for (const f of SAFE_FIELDS) if (c[f] !== undefined) safe[f] = c[f];
  for (const [k, v] of Object.entries(c)) {
    if (k.startsWith("modelLock_") && v !== undefined) {
      safe[k] = v;
    }
  }
  if (safe.name) safe.name = maskName(safe.name);
  if (c.providerSpecificData) {
    const psd = {};
    for (const f of SAFE_PSD_FIELDS) {
      if (c.providerSpecificData[f] !== undefined) psd[f] = c.providerSpecificData[f];
    }
    safe.providerSpecificData = psd;
  }
  return safe;
}

// Custom compatible nodes (openai-compatible-* / anthropic-compatible-*) have
// dynamic ids that can never appear in the static USAGE_* lists, but must be
// first-class on the Usage page: their connection status (active / exhausted /
// unavailable / disabled) is tracked by the same pipeline as built-ins.
// Quota endpoints are unknown for them, so they join as apikey-eligible only —
// the quota fetch surfaces "no quota API" instead of hiding the connection.
const COMPATIBLE_NODE_TYPES = new Set(["openai-compatible", "anthropic-compatible"]);

async function getUsageProviderLists() {
  const [supported, apikey] = await Promise.all([
    Promise.resolve(USAGE_SUPPORTED_PROVIDERS),
    Promise.resolve(USAGE_APIKEY_PROVIDERS),
  ]);
  try {
    const nodes = await getProviderNodes();
    const compatibleIds = nodes
      .filter((n) => COMPATIBLE_NODE_TYPES.has(n.type))
      .map((n) => n.id);
    if (compatibleIds.length) {
      return {
        supportedProviders: [...supported, ...compatibleIds],
        apiKeyProviders: [...apikey, ...compatibleIds],
      };
    }
  } catch (err) {
    console.warn("[Usage] failed to load provider nodes:", err?.message || err);
  }
  return { supportedProviders: supported, apiKeyProviders: apikey };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request) {
  try {
    await backfillCodexEmails();
    await backfillCodeBuddyIntlIdentity();

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") || "all";
    const accountStatus = searchParams.get("accountStatus") || "all";
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "priority";
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const pageSize = Math.min(parsePositiveInt(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const { supportedProviders, apiKeyProviders } = await getUsageProviderLists();
    const [meta, queryResult] = await Promise.all([
      getClientUsageMeta({
        supportedProviders,
        apiKeyProviders,
        provider,
        search,
      }),
      getClientUsageConnections({
        provider,
        accountStatus,
        sort,
        search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        supportedProviders,
        apiKeyProviders,
      }),
    ]);

    const total = queryResult.total;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageConnections = queryResult.connections.map(sanitize);

    return NextResponse.json({
      connections: pageConnections,
      providerOptions: meta.providers,
      statusCounts: meta.statusCounts,
      pagination: {
        page: currentPage,
        pageSize,
        total,
        totalPages,
      },
      totals: {
        eligibleConnections: meta.eligibleCount,
        providerFilteredConnections: total,
      },
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.log("Error fetching providers for client:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}
