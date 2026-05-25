import { MCP_TOOL_MAP, MCP_TOOLS } from "./schemas/tools";
import { getMissingScopes, resolveApiKeyScopes } from "./scopes";
import { logToolCall, getAuditStats } from "./audit";
import { markHttpTransportActive } from "./runtimeHeartbeat";

type BasicHandlersModule = typeof import("./handlers/basic");

async function loadBasicHandlers(): Promise<BasicHandlersModule> {
  return import("./handlers/basic");
}

async function runTool(tool: any, input: any, context: any = {}) {
  const start = Date.now();
  const apiKeyRecord = context.apiKeyRecord || null;
  const scopes = await resolveApiKeyScopes(apiKeyRecord);
  const missing = getMissingScopes(scopes, tool.name);

  if (missing.length > 0) {
    const error = `Missing MCP scopes: ${missing.join(", ")}`;
    await logToolCall(tool.name, input, null, Date.now() - start, false, "scope_denied", { apiKeyId: apiKeyRecord?.id || null, transport: context.transport || null });
    return { ok: false, error, code: "scope_denied" };
  }

  try {
    markHttpTransportActive(context.transport || "http", 0);
    const basic = await loadBasicHandlers();
    let result;
    const origin = context.origin;
    switch (tool.name) {
      case "axonrouter_get_health": result = await basic.getHealth(); break;
      case "axonrouter_list_combos": result = await basic.listCombos(input?.includeMetrics === true); break;
      case "axonrouter_get_combo_metrics": result = await basic.getComboMetrics(input?.comboId); break;
      case "axonrouter_switch_combo": result = await basic.switchCombo(input?.comboId, input?.patch || {}); break;
      case "axonrouter_check_quota": result = await basic.checkQuota(input?.provider); break;
      case "axonrouter_route_request": result = await basic.routeRequest(origin, input); break;
      case "axonrouter_cost_report": result = await basic.costReport(input?.period || "7d"); break;
      case "axonrouter_list_models_catalog": result = await basic.listModelsCatalog(); break;
      case "axonrouter_web_search": result = await basic.webSearch(input?.query || "", input?.limit); break;
      case "axonrouter_simulate_route": result = await basic.simulateRoute(input || {}); break;
      case "axonrouter_set_budget_guard": result = await basic.setBudgetGuard(input || {}); break;
      case "axonrouter_set_routing_strategy": result = await basic.setRoutingStrategy(input || {}); break;
      case "axonrouter_set_resilience_profile": result = await basic.setResilienceProfile(input || {}); break;
      case "axonrouter_test_combo": result = await basic.testCombo(input?.comboId, input?.prompt || ""); break;
      case "axonrouter_get_provider_metrics": result = await basic.providerMetrics(input?.provider); break;
      case "axonrouter_best_combo_for_task": result = await basic.bestComboForTask(input?.taskType || "general"); break;
      case "axonrouter_explain_route": result = await basic.explainRoute(input?.requestDetailId || input?.id); break;
      case "axonrouter_get_session_snapshot": result = await basic.sessionSnapshot(input?.id); break;
      case "axonrouter_db_health_check": result = await basic.dbHealthCheck(input?.autoRepair === true); break;
      case "axonrouter_sync_pricing": result = await basic.pricingSync(); break;
      case "axonrouter_cache_stats": result = await basic.cacheStats(origin); break;
      case "axonrouter_cache_flush": result = await basic.cacheFlush(origin, input?.layer); break;
      case "axonrouter_oneproxy_fetch": result = await basic.proxyFetch(origin, input?.url, input?.proxyPoolId); break;
      case "axonrouter_oneproxy_rotate": result = await basic.proxyRotate(input?.proxyPoolId); break;
      case "axonrouter_oneproxy_stats": result = await basic.proxyStats(origin); break;
      default:
        result = { ok: false, pending: true, tool: tool.name, message: "Tool handler not implemented yet" };
        break;
    }
    await logToolCall(tool.name, input, result, Date.now() - start, true, null, { apiKeyId: apiKeyRecord?.id || null, transport: context.transport || null });
    return { ok: true, result };
  } catch (error) {
    const message = error?.message || String(error);
    await logToolCall(tool.name, input, null, Date.now() - start, false, message, { apiKeyId: apiKeyRecord?.id || null, transport: context.transport || null });
    return { ok: false, error: message, code: "tool_failed" };
  }
}

export async function listTools() {
  return MCP_TOOLS;
}

export async function invokeTool(toolName: any, input: any = {}, context: any = {}) {
  const tool = MCP_TOOL_MAP[toolName];
  if (!tool) {
    return { ok: false, error: "Unsupported tool", code: "unsupported_tool" };
  }
  return runTool(tool, input, context);
}

export async function getRuntimeSummary() {
  return {
    toolCount: MCP_TOOLS.length,
    audit: await getAuditStats(),
  };
}
