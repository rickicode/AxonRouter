// The opencode catalogue must not advertise a model that upstream no longer serves.
//
// union-alpha was declared for months with a per-model Claude transport
// (/zen/v1/messages, reverse-engineered from the genuine CLI) and every request to it
// failed: both transports now answer 401 "Model union-alpha is not supported". That is
// a model-existence error, distinct from the per-egress free-tier gate the executor
// already handles — the gate is worth retrying on another IP, a missing model is not,
// and no combo referenced it.
//
// The trap this guards against is fixing it only in the one place that happened to be
// noticed. union-alpha appeared in five places: the registry entry, the generated
// client projection, the executor's messages-transport set, the free-tier marker
// regex, and the suggested-models filter. Leaving any of them behind means the model
// keeps showing up somewhere, or a stale transport route lingers.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import { isFreeTierGateModel } from "../../open-sse/config/opencodeAgentTools.js";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const CODE_REFS = [
  "../../open-sse/providers/registry/opencode.js",
  "../../open-sse/providers/registry/ui.js",
  "../../open-sse/executors/opencode.js",
  "../../open-sse/config/opencodeAgentTools.js",
  "../../src/app/api/providers/suggested-models/filters.js",
];

describe("opencode catalogue has no model upstream dropped", () => {
  const server = REGISTRY.find((r) => r.id === "opencode");
  const client = REGISTRY_UI.find((r) => r.id === "opencode");

  it("declares no union-alpha", () => {
    expect(server.models.map((m) => m.id)).not.toContain("union-alpha");
    expect(client.models.map((m) => m.id)).not.toContain("union-alpha");
  });

  it("keeps the models that do answer", () => {
    // Verified keyless through the gateway on 2026-10-01.
    const ids = server.models.map((m) => m.id);
    expect(ids).toContain("muse-spark-1.2-contributor-free");
    expect(ids).toContain("muse-spark-1.3-contributor-free");
    expect(ids).toContain("jev-1.13-free");
  });

  it("keeps the server and client projections identical", () => {
    // Otherwise the model picker and the runtime disagree about what exists.
    expect(client.models.map((m) => m.id)).toEqual(server.models.map((m) => m.id));
  });

  it("has no dangling reference in any of the five places it used to live", () => {
    for (const ref of CODE_REFS) {
      const text = src(ref);
      // Comments explaining the removal are fine; executable references are not.
      const executable = text
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
      expect(executable, `${ref} still references union-alpha`).not.toMatch(/union-alpha/);
    }
  });

  it("keeps the per-model Claude transport mechanism, now empty", () => {
    // The routing decision is per-model, so the set stays and restoring a model is a
    // one-line change — but it must no longer contain the dead id.
    const executor = src("../../open-sse/executors/opencode.js");
    expect(executor).toMatch(/const MESSAGES_MODELS = new Set\(\)/);
  });

  it("still marks the models that really are behind the free-tier gate", () => {
    // Removing union-alpha from the marker regex must not have taken the others with
    // it: muse and the -free suffix are gated per egress and the executor needs to
    // know that so it rotates instead of giving up.
    expect(isFreeTierGateModel("muse-spark-1.3-contributor-free")).toBe(true);
    expect(isFreeTierGateModel("space-bunny-free")).toBe(true);
    expect(isFreeTierGateModel("grok-4.7")).toBe(false);
  });

  it("keeps big-pickle in the suggested-models filter", () => {
    // It answers keyless (4/4 through the gateway) and does not use the -free suffix,
    // so without this it would be filtered out of suggestions entirely.
    const filters = src("../../src/app/api/providers/suggested-models/filters.js");
    const line = filters.split("\n").find((l) => l.includes("KNOWN_FREE_OPENCODE_MODELS = "));
    expect(line).toContain("big-pickle");
  });
});