import { beforeEach, describe, expect, it, vi } from "vitest";

const getDisabledModels = vi.fn();
const disableModels = vi.fn();
const enableModels = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getDisabledModels,
  disableModels,
  enableModels,
}));

describe("/api/models/disabled route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getDisabledModels.mockResolvedValue({});
  });

  it("returns provider-specific disabled ids", async () => {
    getDisabledModels.mockResolvedValue({ openai: ["gpt-4.1-mini"] });
    const mod = await import("../../src/app/api/models/disabled/route.ts");

    const response = await mod.GET(new Request("http://localhost/api/models/disabled?providerAlias=openai"));
    const body = await response.json();

    expect(body).toEqual({ ids: ["gpt-4.1-mini"] });
  });

  it("disables model ids for a provider", async () => {
    const mod = await import("../../src/app/api/models/disabled/route.ts");

    const response = await mod.POST(new Request("http://localhost/api/models/disabled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerAlias: "openai", ids: ["gpt-4.1-mini"] }),
    }));

    expect(response.status).toBe(200);
    expect(disableModels).toHaveBeenCalledWith("openai", ["gpt-4.1-mini"]);
  });

  it("re-enables a model by id", async () => {
    const mod = await import("../../src/app/api/models/disabled/route.ts");

    const response = await mod.DELETE(new Request("http://localhost/api/models/disabled?providerAlias=openai&id=gpt-4.1-mini", {
      method: "DELETE",
    }));

    expect(response.status).toBe(200);
    expect(enableModels).toHaveBeenCalledWith("openai", ["gpt-4.1-mini"]);
  });
});
