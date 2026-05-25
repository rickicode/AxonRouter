import { beforeEach, describe, expect, it, vi } from "vitest";

describe("/api/skills/[id] route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns local markdown content for valid skill ids", async () => {
    const mod = await import("../../src/app/api/skills/[id]/route.ts");

    const response = await mod.GET(new Request("http://localhost/api/skills/axonrouter"), {
      params: Promise.resolve({ id: "axonrouter" }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("# AxonRouter");
  });

  it("rejects unsafe skill ids", async () => {
    const mod = await import("../../src/app/api/skills/[id]/route.ts");

    const response = await mod.GET(new Request("http://localhost/api/skills/../bad"), {
      params: Promise.resolve({ id: "../bad" }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Invalid skill id/);
  });
});
