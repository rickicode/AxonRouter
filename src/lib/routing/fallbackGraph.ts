export const DEFAULT_ERROR_TRANSITIONS = {
  rate_limited: "fallback",
  auth_invalid: "stop",
  unsupported_mode: "stop",
  timeout: "fallback",
  upstream_error: "fallback",
  bad_request: "stop",
};

export function createFallbackGraph({ primary, fallbacks = [], budgets = {}, transitions = {}, replay = {} }: any = {}) {
  const nodes = [primary, ...fallbacks].filter(Boolean).map((node, index) => ({
    id: node.id || `node-${index}`,
    provider: node.provider || null,
    model: node.model || null,
    priority: Number.isFinite(node.priority) ? node.priority : index,
    conditions: Array.isArray(node.conditions) ? node.conditions : [],
  }));

  return {
    version: 1,
    nodes,
    transitions: { ...DEFAULT_ERROR_TRANSITIONS, ...(transitions || {}) },
    replay: {
      seed: replay?.seed || null,
      requestedModel: replay?.requestedModel || null,
      requestedProvider: replay?.requestedProvider || null,
    },
    budgets: {
      maxHops: Number.isFinite(budgets.maxHops) ? budgets.maxHops : Math.max(nodes.length, 1),
      retryBudget: Number.isFinite(budgets.retryBudget) ? budgets.retryBudget : Math.max(nodes.length - 1, 0),
      latencyBudgetMs: Number.isFinite(budgets.latencyBudgetMs) ? budgets.latencyBudgetMs : null,
      costBudget: Number.isFinite(budgets.costBudget) ? budgets.costBudget : null,
    },
  };
}

export function evaluateFallbackGraph(graph: any, state: any = {}) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
  const hops = Number.isFinite(state.hops) ? state.hops : 0;
  const retryCount = Number.isFinite(state.retryCount) ? state.retryCount : 0;

  if (hops >= (graph?.budgets?.maxHops ?? 1)) {
    return { next: null, reason: "max_hops_exceeded" };
  }
  if (retryCount > (graph?.budgets?.retryBudget ?? 0)) {
    return { next: null, reason: "retry_budget_exceeded" };
  }

  const next = nodes.find((node) => !visited.has(node.id)) || null;
  if (!next) {
    return { next: null, reason: "no_remaining_nodes" };
  }

  return {
    next,
    reason: hops === 0 ? "primary" : "fallback",
  };
}

export function recordFallbackVisit(state: any = {}, node: any) {
  const visited = new Set(Array.isArray(state.visited) ? state.visited : []);
  if (node?.id) visited.add(node.id);
  return {
    ...state,
    visited: Array.from(visited),
    hops: (Number.isFinite(state.hops) ? state.hops : 0) + 1,
    retryCount: (Number.isFinite(state.retryCount) ? state.retryCount : 0) + (state.hops ? 1 : 0),
  };
}

export function classifyFallbackError({ status = 0, errorText = "" } = {}) {
  const normalized = String(errorText || "").toLowerCase();
  if (status === 429 || normalized.includes("rate limit")) return "rate_limited";
  if (status === 401 || status === 403 || normalized.includes("auth")) return "auth_invalid";
  if (status === 400 || normalized.includes("invalid") || normalized.includes("unsupported")) return "bad_request";
  if (status === 408 || status === 504 || normalized.includes("timeout")) return "timeout";
  return "upstream_error";
}

export function resolveFallbackTransition(graph, errorClass = "upstream_error") {
  const transition = graph?.transitions?.[errorClass] || DEFAULT_ERROR_TRANSITIONS[errorClass] || "fallback";
  return transition;
}
