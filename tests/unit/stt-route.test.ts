import { beforeEach, describe, expect, it, vi } from "vitest";

const handleStt = vi.fn();

vi.mock("@/sse/handlers/stt", () => ({
  handleStt,
}));

describe("/api/v1/audio/transcriptions route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("delegates POST to handleStt", async () => {
    handleStt.mockResolvedValue(new Response(JSON.stringify({ text: "ok" }), { status: 200 }));
    const mod = await import("../../src/app/api/v1/audio/transcriptions/route.ts");

    const request = new Request("http://localhost/api/v1/audio/transcriptions", { method: "POST" });
    const response = await mod.POST(request);

    expect(handleStt).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);
  });
});
