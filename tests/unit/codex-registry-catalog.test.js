/**
 * Codex registry catalog — GPT-6 / GPT-6.1 / [1m] extended-context variants.
 *
 * Ports the registry half of upstream 9router's codex work:
 *   8f9ff44f  ghost models removed, gpt-daybreak/reserve added (#4202)
 *   95600db1  gpt-6-sol / gpt-6-luna (Responses Lite)
 *   9f41ee75  [1m] extended-context variants for gpt-6-* and gpt-5.6-*
 *   dec820b9  gpt-6.1-sol
 *   ca6e8407  CLI identity bumped to the version OpenAI accepts for gpt-6.1-sol
 */

import { describe, it, expect } from "vitest";

import codex from "../../open-sse/providers/registry/codex.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { PROVIDER_MODELS, getModelUpstreamId } from "../../open-sse/config/providerModels.js";

const byId = new Map(codex.models.map((m) => [m.id, m]));
const ids = codex.models.map((m) => m.id);

describe("Codex registry — GPT-6 / GPT-6.1 catalog", () => {
  it("lists gpt-6.1-sol with Responses Lite thinking levels", () => {
    const entry = byId.get("gpt-6.1-sol");
    expect(entry?.name).toBe("GPT 6.1 Sol");
    expect(entry?.responsesLite).toBe(true);
    expect(entry?.thinkingLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it.each(["gpt-6-sol", "gpt-6-luna"])("lists %s as a Responses Lite model", (id) => {
    const entry = byId.get(id);
    expect(entry?.responsesLite).toBe(true);
    expect(entry?.thinkingLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it("keeps the base gpt-6-astra entry", () => {
    expect(byId.get("gpt-6-astra")?.name).toBe("GPT 6.0 Astra");
  });
});

describe("Codex registry — [1m] extended-context variants", () => {
  it.each([
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ])("exposes %s[1m] mapping to its base upstream id", (base) => {
    const entry = byId.get(`${base}[1m]`);
    expect(entry?.name).toBe(`${byId.get(base).name} (extended context)`);
    expect(entry?.upstreamModelId).toBe(base);
  });

  it("carries Responses Lite + thinking levels onto the Sol/Luna [1m] twins", () => {
    for (const id of ["gpt-6-sol[1m]", "gpt-6-luna[1m]"]) {
      expect(byId.get(id)?.responsesLite).toBe(true);
      expect(byId.get(id)?.thinkingLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
    }
  });

  it("does not create a [1m] twin for gpt-6.1-sol", () => {
    expect(ids).not.toContain("gpt-6.1-sol[1m]");
  });

  it("resolves every [1m] id to its base model for the upstream request", () => {
    for (const base of ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
      expect(getModelUpstreamId("cx", `${base}[1m]`)).toBe(base);
    }
  });
});

describe("Codex registry — ghost models removed, live models added (#4202)", () => {
  it.each(["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark", "gpt-5.4-image"])(
    "drops the dead id %s",
    (dead) => {
      expect(ids).not.toContain(dead);
    }
  );

  it.each(["gpt-daybreak-blue-latest", "gpt-reserve"])("adds the live id %s", (live) => {
    expect(ids).toContain(live);
  });

  it("keeps still-live generations", () => {
    for (const id of ["gpt-6-astra", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5", "codex-auto-review"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("Codex registry — provider wiring", () => {
  it("publishes the catalog to the cx alias the dashboard reads", () => {
    expect(PROVIDER_MODELS.cx).toBe(PROVIDER_MODELS.codex);
    const cxIds = PROVIDER_MODELS.cx.map((m) => m.id);
    for (const id of ["gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-6-sol[1m]", "gpt-5.6-terra[1m]"]) {
      expect(cxIds).toContain(id);
    }
  });

  it("identifies as the Codex CLI version OpenAI accepts for gpt-6.1-sol", () => {
    expect(PROVIDERS.codex.cliVersion).toBe("0.159.0");
    expect(PROVIDERS.codex.headers["User-Agent"]).toBe("codex_cli_rs/0.159.0");
  });
});