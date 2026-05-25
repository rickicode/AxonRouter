import { MCP_TOOL_SCOPES } from "../scopes";

function buildTool(name: any, description: any, phase: any, inputSchema: any = { type: "object", properties: {} }) {
  return {
    name,
    description,
    phase,
    auditLevel: phase === 1 ? "basic" : "full",
    inputSchema,
    requiredScopes: MCP_TOOL_SCOPES[name] || [],
  };
}

export const MCP_TOOLS = [
  buildTool("axonrouter_get_health", "Returns router health, runtime, and activity status.", 1),
  buildTool("axonrouter_list_combos", "Lists configured model combos.", 1, { type: "object", properties: { includeMetrics: { type: "boolean" } } }),
  buildTool("axonrouter_get_combo_metrics", "Returns metrics for a combo.", 1, { type: "object", properties: { comboId: { type: "string" } }, required: ["comboId"] }),
  buildTool("axonrouter_switch_combo", "Updates a combo configuration.", 1, { type: "object", properties: { comboId: { type: "string" }, patch: { type: "object" } }, required: ["comboId"] }),
  buildTool("axonrouter_check_quota", "Returns quota state across providers.", 1, { type: "object", properties: { provider: { type: "string" } } }),
  buildTool("axonrouter_route_request", "Routes a multimodal request through AxonRouter policy.", 1, { type: "object", properties: { mode: { type: "string" }, model: { type: "string" } }, required: ["mode", "model"] }),
  buildTool("axonrouter_cost_report", "Returns usage and cost aggregates.", 1, { type: "object", properties: { period: { type: "string" } } }),
  buildTool("axonrouter_list_models_catalog", "Lists models known to the router.", 1),
  buildTool("axonrouter_web_search", "Searches the web via configured search provider.", 1, { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] }),
  buildTool("axonrouter_simulate_route", "Simulates how a request would route.", 2, { type: "object", properties: { mode: { type: "string" }, model: { type: "string" } } }),
  buildTool("axonrouter_set_budget_guard", "Updates budget guard settings.", 2, { type: "object", properties: { enabled: { type: "boolean" }, monthlyBudgetCapUsd: { type: "number" } } }),
  buildTool("axonrouter_set_routing_strategy", "Updates routing profile or strategy.", 2, { type: "object", properties: { profile: { type: "string" }, strategy: { type: "string" } } }),
  buildTool("axonrouter_set_resilience_profile", "Updates resilience profile.", 2, { type: "object", properties: { profile: { type: "string" } } }),
  buildTool("axonrouter_test_combo", "Executes a combo test.", 2, { type: "object", properties: { comboId: { type: "string" }, prompt: { type: "string" } }, required: ["comboId"] }),
  buildTool("axonrouter_get_provider_metrics", "Returns aggregated provider metrics.", 2, { type: "object", properties: { provider: { type: "string" } } }),
  buildTool("axonrouter_best_combo_for_task", "Suggests the best combo for a task.", 2, { type: "object", properties: { taskType: { type: "string" } } }),
  buildTool("axonrouter_explain_route", "Explains a routing decision.", 2, { type: "object", properties: { requestDetailId: { type: "string" }, correlationId: { type: "string" } } }),
  buildTool("axonrouter_get_session_snapshot", "Returns a request/session snapshot.", 2, { type: "object", properties: { id: { type: "string" } }, required: ["id"] }),
  buildTool("axonrouter_db_health_check", "Runs DB health diagnostics.", 2, { type: "object", properties: { autoRepair: { type: "boolean" } } }),
  buildTool("axonrouter_sync_pricing", "Synchronizes pricing data.", 2),
  buildTool("axonrouter_cache_stats", "Returns cache domain statistics.", 2),
  buildTool("axonrouter_cache_flush", "Invalidates a cache layer.", 2, { type: "object", properties: { layer: { type: "string" } }, required: ["layer"] }),
  buildTool("axonrouter_oneproxy_fetch", "Fetches through configured proxy infrastructure.", 2, { type: "object", properties: { url: { type: "string" }, proxyPoolId: { type: "string" } }, required: ["url"] }),
  buildTool("axonrouter_oneproxy_rotate", "Rotates proxy pool selection.", 2, { type: "object", properties: { proxyPoolId: { type: "string" } }, required: ["proxyPoolId"] }),
  buildTool("axonrouter_oneproxy_stats", "Returns proxy pool stats.", 2),
];

export const MCP_TOOL_MAP = Object.fromEntries(MCP_TOOLS.map((tool) => [tool.name, tool]));
