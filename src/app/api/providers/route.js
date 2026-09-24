import { NextResponse } from "next/server";
import {
  getProviderConnections,
  countProviderConnections,
  createProviderConnection,
  setProviderConnectionsActive,
  setConnectionsActiveByIds,
  deleteProviderConnectionsByIds,
  deleteProviderConnectionsByProvider,
  getProviderNodeById,
  getProviderNodes,
  getProxyPoolById,
} from "@/models";
import { APIKEY_PROVIDERS } from "@/shared/constants/config";
import { AI_PROVIDERS, FREE_TIER_PROVIDERS, WEB_COOKIE_PROVIDERS, isOpenAICompatibleProvider, isAnthropicCompatibleProvider, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { normalizeProviderId, normalizeProviderSpecificData } from "@/lib/providerNormalization";
import { backfillCodeBuddyIntlIdentity } from "@/lib/oauth/providers";

export const dynamic = "force-dynamic";

function normalizeProxyConfig(body = {}) {
  const enabled = body?.connectionProxyEnabled === true;
  const url = typeof body?.connectionProxyUrl === "string" ? body.connectionProxyUrl.trim() : "";
  const noProxy = typeof body?.connectionNoProxy === "string" ? body.connectionNoProxy.trim() : "";

  if (enabled && !url) {
    return { error: "Connection proxy URL is required when connection proxy is enabled" };
  }

  return {
    connectionProxyEnabled: enabled,
    connectionProxyUrl: url,
    connectionNoProxy: noProxy,
  };
}

async function normalizeProxyPoolId(proxyPoolId) {
  if (proxyPoolId === undefined || proxyPoolId === null || proxyPoolId === "" || proxyPoolId === "__none__") {
    return { proxyPoolId: null };
  }

  const normalizedId = String(proxyPoolId).trim();
  if (!normalizedId) {
    return { proxyPoolId: null };
  }

  const proxyPool = await getProxyPoolById(normalizedId);
  if (!proxyPool) {
    return { error: "Proxy pool not found" };
  }

  return { proxyPoolId: normalizedId };
}

// GET /api/providers - List all connections
export async function GET(request) {
  try {
    // Self-heal legacy CodeBuddy Intl OAuth rows that predate identity capture
    // (they show as "Account N" with no email). Runs once per process.
    await backfillCodeBuddyIntlIdentity();
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const providersParam = searchParams.get("providers");
    const isActiveParam = searchParams.get("isActive");
    const statusParam = searchParams.get("status");
    const searchParam = searchParams.get("search");
    const pageParam = searchParams.get("page");
    const pageSizeParam = searchParams.get("pageSize");
    const fields = searchParams.get("fields");
    const distinctParam = searchParams.get("distinct");
    const paginated = provider !== null || pageParam !== null || pageSizeParam !== null || searchParam !== null || statusParam !== null || (!distinctParam && fields !== "summary");
    const pageSize = Math.min(Math.max(Number.parseInt(pageSizeParam || "50", 10) || 50, 1), 500);
    const requestedPage = Math.max(Number.parseInt(pageParam || "1", 10) || 1, 1);
    const filter = {};
    if (provider) filter.provider = provider;
    if (providersParam) {
      const parsedProviders = providersParam.split(",").map((p) => p.trim()).filter(Boolean);
      if (parsedProviders.length > 0) {
        filter.providers = parsedProviders;
      }
    }
    if (isActiveParam !== null && isActiveParam !== undefined) {
      filter.isActive = isActiveParam === "true";
    }
    if (statusParam) filter.status = statusParam;
    if (searchParam) filter.search = searchParam;
    if (distinctParam === "provider" || (fields === "summary" && distinctParam !== "false")) {
      filter.distinctByProvider = true;
    }

    let connections;
    let total;
    let totalPages = 1;
    let page = requestedPage;

    if (paginated) {
      total = await countProviderConnections(filter);
      totalPages = Math.max(1, Math.ceil(total / pageSize));
      page = Math.min(requestedPage, totalPages);
      const offset = (page - 1) * pageSize;
      connections = await getProviderConnections({
        ...filter,
        limit: pageSize,
        offset,
      });
    } else {
      connections = await getProviderConnections(filter);
    }

    // Build nodeNameMap for compatible providers (id → name)
    let nodeNameMap = {};
    try {
      const nodes = await getProviderNodes();
      for (const node of nodes) {
        if (node.id && node.name) nodeNameMap[node.id] = node.name;
      }
    } catch { }

    // If summary fields requested (e.g. for dropdowns / selector modals)
    if (fields === "summary") {
      const summaryConnections = connections.map(c => {
        const isCompatible = isOpenAICompatibleProvider(c.provider) || isAnthropicCompatibleProvider(c.provider);
        const name = isCompatible
          ? (c.name || nodeNameMap[c.provider] || c.providerSpecificData?.nodeName || c.provider)
          : c.name;
        return {
          id: c.id,
          provider: c.provider,
          authType: c.authType,
          name,
          priority: c.priority,
          isActive: c.isActive,
          providerSpecificData: c.providerSpecificData ? { prefix: c.providerSpecificData.prefix, nodeName: c.providerSpecificData.nodeName } : undefined,
        };
      });

      if (!paginated) return NextResponse.json({ connections: summaryConnections });
      return NextResponse.json({
        connections: summaryConnections,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    // Hide sensitive fields, enrich name for compatible providers
    const safeConnections = connections.map(c => {
      const isCompatible = isOpenAICompatibleProvider(c.provider) || isAnthropicCompatibleProvider(c.provider);
      const name = isCompatible
        ? (c.name || nodeNameMap[c.provider] || c.providerSpecificData?.nodeName || c.provider)
        : c.name;
      return {
        ...c,
        name,
        apiKey: undefined,
        accessToken: undefined,
        refreshToken: undefined,
        idToken: undefined,
      };
    });

    if (!paginated) return NextResponse.json({ connections: safeConnections });

    return NextResponse.json({
      connections: safeConnections,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    console.log("Error fetching providers:", error);
    return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
  }
}

// PATCH /api/providers - Batch toggle active status for provider or by connection IDs
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { provider, authType, isActive, ids } = body;

    if (Array.isArray(ids)) {
      if (ids.length === 0) {
        return NextResponse.json({ success: true, updatedCount: 0 });
      }
      const updatedCount = await setConnectionsActiveByIds(ids, isActive);
      return NextResponse.json({ success: true, updatedCount });
    }

    if (!provider) {
      return NextResponse.json({ error: "provider or ids is required" }, { status: 400 });
    }
    const authTypes = Array.isArray(authType) ? authType : (authType ? [authType] : ["oauth", "apikey", "api_key", "cookie"]);
    const updatedCount = await setProviderConnectionsActive(provider, authTypes, isActive);
    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error("Error bulk updating provider status:", error);
    return NextResponse.json({ error: "Failed to update provider status" }, { status: 500 });
  }
}

// DELETE /api/providers - Batch delete connections by IDs or by provider
export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { ids, provider } = body;

    if (Array.isArray(ids)) {
      if (ids.length === 0) {
        return NextResponse.json({ success: true, deletedCount: 0 });
      }
      const deletedCount = await deleteProviderConnectionsByIds(ids);
      return NextResponse.json({ success: true, deletedCount });
    }

    if (provider) {
      const deletedCount = await deleteProviderConnectionsByProvider(provider);
      return NextResponse.json({ success: true, deletedCount });
    }

    return NextResponse.json({ error: "ids or provider is required" }, { status: 400 });
  } catch (error) {
    console.error("Error bulk deleting provider connections:", error);
    return NextResponse.json({ error: "Failed to delete connections" }, { status: 500 });
  }
}

// POST /api/providers - Create new connection (API Key only, OAuth via separate flow)
export async function POST(request) {
  try {
    const body = await request.json();
    const provider = normalizeProviderId(body.provider);
    const { apiKey, name, displayName, priority, globalPriority, defaultModel, testStatus } = body;
    const proxyConfig = normalizeProxyConfig(body);
    if (proxyConfig.error) {
      return NextResponse.json({ error: proxyConfig.error }, { status: 400 });
    }

    const proxyPoolResult = await normalizeProxyPoolId(body.proxyPoolId);
    if (proxyPoolResult.error) {
      return NextResponse.json({ error: proxyPoolResult.error }, { status: 400 });
    }
    const proxyPoolId = proxyPoolResult.proxyPoolId;

    // Validation
    const isWebCookieProvider = !!WEB_COOKIE_PROVIDERS[provider];
    // Dual-auth providers (e.g. codebuddy-cn, xai) live under category "oauth" but also
    // accept an API key via authModes — they aren't in APIKEY_PROVIDERS, so allow them here.
    const supportsApiKeyMode = !!AI_PROVIDERS[provider]?.authModes?.includes("apikey");
    const isValidProvider = APIKEY_PROVIDERS[provider] ||
      FREE_TIER_PROVIDERS[provider] ||
      supportsApiKeyMode ||
      isWebCookieProvider ||
      isOpenAICompatibleProvider(provider) ||
      isAnthropicCompatibleProvider(provider) ||
      isCustomEmbeddingProvider(provider);

    if (!provider || !isValidProvider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }
    if (!apiKey && provider !== "ollama-local") {
      return NextResponse.json({ error: `${isWebCookieProvider ? "Cookie value" : "API Key"} is required` }, { status: 400 });
    }
    const connectionName = name || displayName || AI_PROVIDERS[provider]?.name;
    if (!connectionName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    let providerSpecificData = normalizeProviderSpecificData(provider, body, body.providerSpecificData);

    // Compatible LLM nodes support multiple API-key connections (key pool); runtime
    // rotates/fails over via getProviderCredentials. Embedding nodes stay single-connection.
    if (isOpenAICompatibleProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "OpenAI Compatible node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        apiType: node.apiType,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    } else if (isAnthropicCompatibleProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Anthropic Compatible node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    } else if (isCustomEmbeddingProvider(provider)) {
      const node = await getProviderNodeById(provider);
      if (!node) {
        return NextResponse.json({ error: "Custom Embedding node not found" }, { status: 404 });
      }
      providerSpecificData = {
        prefix: node.prefix,
        baseUrl: node.baseUrl,
        nodeName: node.name,
      };
    }

    const mergedProviderSpecificData = {
      ...(providerSpecificData || {}),
      connectionProxyEnabled: proxyConfig.connectionProxyEnabled,
      connectionProxyUrl: proxyConfig.connectionProxyUrl,
      connectionNoProxy: proxyConfig.connectionNoProxy,
    };

    if (proxyPoolId !== null) {
      mergedProviderSpecificData.proxyPoolId = proxyPoolId;
    }

    const newConnection = await createProviderConnection({
      provider,
      authType: isWebCookieProvider ? "cookie" : "apikey",
      name: connectionName,
      apiKey: apiKey || "",
      priority: priority || 1,
      globalPriority: globalPriority || null,
      defaultModel: defaultModel || null,
      providerSpecificData: mergedProviderSpecificData,
      isActive: true,
      testStatus: testStatus || "unknown",
    });

    // Hide sensitive fields
    const result = { ...newConnection };
    delete result.apiKey;

    return NextResponse.json({ connection: result }, { status: 201 });
  } catch (error) {
    console.log("Error creating provider:", error);
    return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
  }
}
