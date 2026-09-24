import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { FREE_PROVIDERS, APIKEY_PROVIDERS } from "../../src/shared/constants/providers.js";
import { NEVER_ACCOUNT_EXHAUSTED_PROVIDERS } from "../../src/sse/services/accountExhaustionPolicy.js";
import { FILTERS } from "../../src/app/api/providers/suggested-models/filters.js";
import { resolveProviderAlias, parseModel } from "../../open-sse/services/model.js";
import { resolveProviderIconId } from "../../src/shared/utils/providerIcon.js";

describe("New Free Providers — Registry", () => {
  const freeIds = ["ovhcloud-free", "llmtech-free", "llm7-free"];
  const paidIds = ["ovhcloud", "vlmrun", "llmtech"];

  for (const id of freeIds) {
    it(`${id} is registered in PROVIDERS with noAuth=true`, () => {
      expect(PROVIDERS[id]).toBeDefined();
      expect(PROVIDERS[id].noAuth).toBe(true);
      expect(PROVIDERS[id].baseUrl).toContain("http");
    });
  }

  for (const id of paidIds) {
    it(`${id} is registered in PROVIDERS with apikey auth`, () => {
      expect(PROVIDERS[id]).toBeDefined();
      expect(PROVIDERS[id].noAuth).toBeFalsy();
    });
  }

  it("llm7 is still registered and updated", () => {
    expect(PROVIDERS["llm7"]).toBeDefined();
    expect(PROVIDERS["llm7"].baseUrl).toContain("llm7.io");
  });
});

describe("New Free Providers — FREE_PROVIDERS catalog", () => {
  it("all free variants appear in FREE_PROVIDERS", () => {
    expect(FREE_PROVIDERS["ovhcloud-free"]).toBeDefined();
    expect(FREE_PROVIDERS["llmtech-free"]).toBeDefined();
    expect(FREE_PROVIDERS["llm7-free"]).toBeDefined();
  });

  it("paid variants appear in APIKEY_PROVIDERS", () => {
    expect(APIKEY_PROVIDERS["ovhcloud"]).toBeDefined();
    expect(APIKEY_PROVIDERS["vlmrun"]).toBeDefined();
    expect(APIKEY_PROVIDERS["llmtech"]).toBeDefined();
    expect(APIKEY_PROVIDERS["llm7"]).toBeDefined();
  });
});

describe("New Free Providers — Account exhaustion exemption", () => {
  const freeIds = ["ovhcloud-free", "llmtech-free", "llm7-free"];

  for (const id of freeIds) {
    it(`${id} is exempt from account exhaustion`, () => {
      expect(NEVER_ACCOUNT_EXHAUSTED_PROVIDERS.has(id)).toBe(true);
    });
  }
});

describe("New Free Providers — Alias resolution", () => {
  const aliasTests = [
    ["ovhcf", "ovhcloud-free"],
    ["ovh", "ovhcloud"],
    ["vlmr", "vlmrun"],
    ["ltf", "llmtech-free"],
    ["lt", "llmtech"],
    ["l7f", "llm7-free"],
  ];

  for (const [alias, expectedId] of aliasTests) {
    it(`resolves alias "${alias}" to "${expectedId}"`, () => {
      expect(resolveProviderAlias(alias)).toBe(expectedId);
    });
  }
});

describe("New Free Providers — Model string parsing", () => {
  const parseTests = [
    ["ovhcf/Qwen3.8-27B", "ovhcloud-free", "Qwen3.8-27B"],
    ["ovh/Qwen3-Coder-30B-A3B-Instruct", "ovhcloud", "Qwen3-Coder-30B-A3B-Instruct"],
    ["ltf/nvidia/Qwen3.8-27B-NVFP4", "llmtech-free", "nvidia/Qwen3.8-27B-NVFP4"],
    ["l7f/GLM-5.3-Flash", "llm7-free", "GLM-5.3-Flash"],
  ];

  for (const [modelStr, expectedProvider, expectedModel] of parseTests) {
    it(`parses "${modelStr}" correctly`, () => {
      const parsed = parseModel(modelStr);
      expect(parsed.provider).toBe(expectedProvider);
      expect(parsed.model).toBe(expectedModel);
    });
  }
});

describe("New Free Providers — Icon aliases", () => {
  const iconTests = [
    ["ovhcloud-free", "ovhcloud"],
    ["ovhcf", "ovhcloud"],
    ["llmtech-free", "llmtech"],
    ["ltf", "llmtech"],
    ["llm7-free", "llm7"],
    ["l7f", "llm7"],
  ];

  for (const [providerId, expectedIcon] of iconTests) {
    it(`resolves icon for "${providerId}" to "${expectedIcon}"`, () => {
      expect(resolveProviderIconId(providerId)).toBe(expectedIcon);
    });
  }
});

describe("New Free Providers — Suggested models filters", () => {
  it("ovhcloud-free filter passes models through", () => {
    const filter = FILTERS["ovhcloud-free"];
    expect(filter).toBeDefined();
    const result = filter([
      { id: "Qwen3.8-27B", name: "Qwen 3.8 27B", context_length: 131072 },
      { id: "gpt-oss-20b", name: "GPT-OSS 20B", context_length: 131072 },
    ]);
    expect(result.length).toBe(2);
    expect(result[0].contextLength).toBe(131072);
  });

});
