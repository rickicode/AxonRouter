export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "@/lib/http/response.js";
import { getClientUsageConnections, getClientUsageMeta } from "@/lib/localDb";
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

// Quota Tracker (/dashboard/quota) monitors API quota limits across provider accounts.
// Custom compatible providers (openai-compatible-* / anthropic-compatible-*) do not have
// upstream quota APIs and must not be listed in quota tracking.
function getUsageProviderLists() {
  return {
    supportedProviders: USAGE_SUPPORTED_PROVIDERS,
    apiKeyProviders: USAGE_APIKEY_PROVIDERS,
  };
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
