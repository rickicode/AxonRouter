import { cpus } from "node:os";

// Gateway worker-mode resolution.
//
// Pure so the cluster/standalone toggle is unit-testable without booting a
// server or forking processes.
//
// Env contract:
//   GATEWAY_CLUSTER=false|0|off|no  → standalone: single process, no primary
//                                     fork, no worker supervisor (lowest RAM)
//   GATEWAY_CLUSTER=true|unset      → cluster (default)
//   GATEWAY_WORKERS=<n>             → worker count, clamped to [1, cores]
//   GATEWAY_WORKERS=empty|auto|non-numeric → one worker per CPU core
//
// A cluster of one is pointless (the primary adds a supervisor layer but no
// parallelism), so WORKERS<=1 always collapses to standalone.

const FALSY = new Set(["false", "0", "off", "no"]);

export function resolveGatewayMode(env = process.env, coreCount = cpus().length) {
  const cores = Math.max(1, Number(coreCount) || 1);
  const flag = String(env.GATEWAY_CLUSTER ?? "true").trim().toLowerCase();
  const clusterDisabled = FALSY.has(flag);

  const raw = String(env.GATEWAY_WORKERS ?? "").trim();
  const requested = /^\d+$/.test(raw) ? Number(raw) : cores;
  const workers = Math.max(1, Math.min(requested || cores, cores));

  const useCluster = !clusterDisabled && workers > 1;
  return { useCluster, workers, cores, mode: useCluster ? "cluster" : "standalone" };
}
