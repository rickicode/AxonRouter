import { describe, expect, it } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { AI_PROVIDERS, getProvidersByKind } from "../../src/shared/constants/providers.js";
import { CHAT_SEARCH_CONFIG } from "../../open-sse/handlers/search/chatSearch.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { CAPACITY_META } from "../../src/shared/constants/models.js";

describe("UniKey web search support", () => {
  it("registers UniKey as a webSearch provider in registry and AI_PROVIDERS", () => {
    const unikey = REGISTRY.find((p) => p.id === "unikey");
    expect(unikey).toBeDefined();
    expect(unikey.serviceKinds).toContain("webSearch");
    expect(unikey.searchViaChat).toBeDefined();
    expect(unikey.searchViaChat.defaultModel).toBe("claude-opus-4-8");

    const searchProviders = getProvidersByKind("webSearch");
    expect(searchProviders.map((p) => p.id)).toContain("unikey");
  });

  it("marks Claude Opus models with search capability", () => {
    const opus8 = getCapabilitiesForModel("unikey", "claude-opus-4-8");
    expect(opus8.search).toBe(true);

    const opus7 = getCapabilitiesForModel("unikey", "claude-opus-4-7");
    expect(opus7.search).toBe(true);

    const opus6 = getCapabilitiesForModel("unikey", "claude-opus-4-6");
    expect(opus6.search).toBe(true);

    expect(CAPACITY_META.search).toBeDefined();
    expect(CAPACITY_META.search.icon).toBe("travel_explore");
  });

  it("configures CHAT_SEARCH_CONFIG.unikey to extract citations and clean search tags", () => {
    const cfg = CHAT_SEARCH_CONFIG.unikey;
    expect(cfg).toBeDefined();

    const body = cfg.buildBody("test query", "claude-opus-4-8");
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.messages[0].content).toContain("test query");

    const mockData = {
      choices: [
        {
          message: {
            content: `I will search the web for you.
<search_web>
<query>test</query>
</search_web>

Here are the results:
- **Official Portal**: https://example.com/official
- [Documentation](https://example.com/docs)
Visit https://example.com/info for more details.`,
          },
        },
      ],
      usage: { total_tokens: 120 },
    };

    const { text, citations, tokens } = cfg.extractAnswer(mockData);
    expect(tokens).toBe(120);
    expect(text).not.toContain("<search_web>");
    expect(text).toContain("Here are the results:");

    const urls = citations.map((c) => c.url);
    expect(urls).toContain("https://example.com/official");
    expect(urls).toContain("https://example.com/docs");
    expect(urls).toContain("https://example.com/info");

    const docCitation = citations.find((c) => c.url === "https://example.com/docs");
    expect(docCitation.title).toBe("Documentation");

    const portalCitation = citations.find((c) => c.url === "https://example.com/official");
    expect(portalCitation.title).toBe("Official Portal");
  });
});
