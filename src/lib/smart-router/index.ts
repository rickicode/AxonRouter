export { SmartRouter, VIRTUAL_MODEL_IDS, DEFAULT_CONFIG } from "./router";
export type { SmartRouterConfig, RouterDecision, VirtualModelId } from "./router";
export { extractFeatures } from "./features";
export type { NormalizedRequest, Features } from "./features";
export { makeDecision } from "./policy";
export type { RoutingConfig, Decision, RoutingProfile, RoutingTargets } from "./policy";
export { normalizeRequest } from "./normalizer";
export { compileTaskClasses, DEFAULT_TASK_CLASSES, DEFAULT_COMPILED } from "./task-classes";
