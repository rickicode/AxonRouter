export const MCP_SCOPE_LIST = [
  "read:health",
  "read:combos",
  "write:combos",
  "read:quota",
  "read:usage",
  "read:models",
  "execute:completions",
  "execute:search",
  "write:budget",
  "write:resilience",
  "pricing:write",
  "read:cache",
  "write:cache",
  "read:proxies",
];

export const MCP_TOOL_SCOPES = {
  "axonrouter_get_health": ["read:health"],
  "axonrouter_list_combos": ["read:combos"],
  "axonrouter_get_combo_metrics": ["read:combos"],
  "axonrouter_switch_combo": ["write:combos"],
  "axonrouter_check_quota": ["read:quota"],
  "axonrouter_route_request": ["execute:completions"],
  "axonrouter_cost_report": ["read:usage"],
  "axonrouter_list_models_catalog": ["read:models"],
  "axonrouter_web_search": ["execute:search"],
  "axonrouter_simulate_route": ["read:health", "read:combos"],
  "axonrouter_set_budget_guard": ["write:budget"],
  "axonrouter_set_routing_strategy": ["write:resilience"],
  "axonrouter_set_resilience_profile": ["write:resilience"],
  "axonrouter_test_combo": ["execute:completions", "read:combos"],
  "axonrouter_get_provider_metrics": ["read:health"],
  "axonrouter_best_combo_for_task": ["read:combos", "read:health"],
  "axonrouter_explain_route": ["read:health", "read:usage"],
  "axonrouter_get_session_snapshot": ["read:usage"],
  "axonrouter_db_health_check": ["read:health", "write:resilience"],
  "axonrouter_sync_pricing": ["pricing:write"],
  "axonrouter_cache_stats": ["read:cache"],
  "axonrouter_cache_flush": ["write:cache"],
  "axonrouter_oneproxy_fetch": ["read:proxies"],
  "axonrouter_oneproxy_rotate": ["read:proxies"],
  "axonrouter_oneproxy_stats": ["read:proxies"],
};

export const MCP_SCOPE_PRESETS = {
  readonly: ["read:health", "read:combos", "read:quota", "read:usage", "read:models", "read:cache"],
  monitor: ["read:health", "read:quota", "read:usage", "read:cache"],
  agent: ["read:health", "read:combos", "read:quota", "read:usage", "read:models", "read:cache", "execute:completions", "execute:search"],
  full: [...MCP_SCOPE_LIST],
};

export function getMissingScopes(grantedScopes = [], toolName) {
  const required = MCP_TOOL_SCOPES[toolName] || [];
  const granted = new Set(grantedScopes);
  return required.filter((scope) => !granted.has(scope));
}

export function hasRequiredScopes(grantedScopes = [], toolName) {
  return getMissingScopes(grantedScopes, toolName).length === 0;
}

export async function resolveApiKeyScopes(apiKeyRecord) {
  if (!apiKeyRecord || apiKeyRecord.isActive === false) return [];
  if (Array.isArray(apiKeyRecord.mcpScopes) && apiKeyRecord.mcpScopes.length > 0) return apiKeyRecord.mcpScopes;
  return MCP_SCOPE_PRESETS.full;
}
