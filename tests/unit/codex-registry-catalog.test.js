/**
 * Codex registry catalog — GPT-6 / GPT-5.6 / [1m] extended-context variants.
 *
 * Pruned 2026-10-02 against the live backend: gpt-6.1-sol, gpt-6-sol(+[1m]),
 * gpt-6-astra(+[1m]), gpt-5.6-sol(+[1m],-review), gpt-daybreak-blue-latest and
 * the gpt-image-star / gpt-star-image rows all answer HTTP 400 "model is not supported"
 * when using Codex with a ChatGPT account" on every configured account. The
 * surviving set is gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5 and
 * gpt-reserve plus their -review / [1m] / -image variants.
 */

import { describe, it, expect } from "vitest";

import codex from "../../open-sse/providers/registry/codex.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import { PROVIDER_MODELS, getModelUpstreamId } from "../../open-sse/config/providerModels.js";

const byId = new Map(codex.models.map((m) => [m.id, m]));
const ids = codex.models.map((m) => m.id);

describe("Codex registry — GPT-6 catalog", () => {
  it("lists gpt-6-luna as a Responses Lite model with thinking levels", () => {
    const entry = byId.get("gpt-6-luna");
    expect(entry?.responsesLite).toBe(true);
    expect(entry?.thinkingLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it.each(["gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra"])(
    "drops unsupported ChatGPT-account models %s",
    (unsupported) => {
      expect(ids).not.toContain(unsupported);
    }
  );
});

describe("Codex registry — [1m] extended-context variants", () => {
  it.each([
    "gpt-6-luna",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ])("exposes %s[1m] mapping to its base upstream id", (base) => {
    const entry = byId.get(`${base}[1m]`);
    expect(entry?.name).toBe(`${byId.get(base).name} (extended context)`);
    expect(entry?.upstreamModelId).toBe(base);
  });

  it("carries Responses Lite + thinking levels onto the gpt-6-luna[1m] twin", () => {
    const entry = byId.get("gpt-6-luna[1m]");
    expect(entry?.responsesLite).toBe(true);
    expect(entry?.thinkingLevels).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });

  it("does not create a [1m] twin for gpt-6.1-sol", () => {
    expect(ids).not.toContain("gpt-6.1-sol[1m]");
  });

  it("resolves every [1m] id to its base model for the upstream request", () => {
    for (const base of ["gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-luna"]) {
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

  it("adds the live id gpt-reserve", () => {
    expect(ids).toContain("gpt-reserve");
  });

  it.each(["gpt-daybreak-blue-latest", "gpt-5.6-sol", "gpt-5.6-sol-review"])(
    "drops the withdrawn id %s",
    (withdrawn) => {
      expect(ids).not.toContain(withdrawn);
    }
  );

  it("keeps still-live generations", () => {
    for (const id of ["gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "codex-auto-review"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("Codex registry — provider wiring", () => {
  it("publishes the catalog to the cx alias the dashboard reads", () => {
    expect(PROVIDER_MODELS.cx).toBe(PROVIDER_MODELS.codex);
    const cxIds = PROVIDER_MODELS.cx.map((m) => m.id);
    for (const id of ["gpt-6-luna", "gpt-6-luna[1m]", "gpt-5.6-terra[1m]"]) {
      expect(cxIds).toContain(id);
    }
  });

  it("identifies as the Codex CLI version the models endpoint must query", () => {
    expect(PROVIDERS.codex.cliVersion).toBe("0.159.0");
    expect(PROVIDERS.codex.headers["User-Agent"]).toBe("codex_cli_rs/0.159.0");
  });
});