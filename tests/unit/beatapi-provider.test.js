// BeatAPI registration and its asynchronous image task adapter.
//
// The catalogue claims are the part worth pinning: BeatAPI advertises image models
// in /v1/models that its own generation endpoint rejects, and it advertises no
// video at all in /v1/models while serving 15 video models from /v1/media/models.
// Both were established by probing the live API, so they are asserted here as
// facts about the registry rather than re-derived from a URL.
//
// The adapter tests cover the submit+poll contract, with the two failure modes
// that would otherwise hang or mislead an operator: a terminal-but-not-successful
// task, and a task that stalls waiting on the caller.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { REGISTRY_UI } from "../../open-sse/providers/registry/ui.js";
import beatapi from "../../open-sse/providers/registry/beatapi.js";
import { getImageAdapter, isImageProvider } from "../../open-sse/handlers/imageProviders/index.js";
import { JEV_PROVIDERS, JEV_MODEL_CHOICES, isKnownJevEndpoint } from "../../open-sse/config/jevModels.js";

const byId = (id) => REGISTRY.find((r) => r.id === id);
const model = (id, kind) => beatapi.models.find((m) => m.id === id && (!kind || m.kind === kind));
const generationModels = (kind) => beatapi.models.filter((m) => m.kind === kind && m.hidden !== true);

describe("BeatAPI provider registration", () => {
  it("is registered in both the server registry and the client projection", () => {
    expect(byId("beatapi")).toBeTruthy();
    const ui = REGISTRY_UI.find((r) => r.id === "beatapi");
    expect(ui).toBeTruthy();
    // The projection must stay a faithful subset — a field present on the server
    // and missing on the client is how a picker silently renders an empty option.
    expect(ui.serviceKinds).toEqual(beatapi.serviceKinds);
    expect(ui.models.length).toBe(beatapi.models.length);
    expect(ui.jevConfig).toEqual(beatapi.jevConfig);
  });

  it("never leaks server-only transport into the client projection", () => {
    const ui = REGISTRY_UI.find((r) => r.id === "beatapi");
    expect(ui.transport).toBeUndefined();
  });

  it("declares llm, image and video capabilities plus the Jev classifier", () => {
    expect(beatapi.serviceKinds).toEqual(expect.arrayContaining(["llm", "image", "video", "jev"]));
  });

  it("points the classifier at the System One endpoint", () => {
    expect(beatapi.jevConfig.endpoint).toBe("https://api.beatapi.io/v1/systemone");
    expect(isKnownJevEndpoint("https://api.beatapi.io/v1/systemone")).toBe(true);
    expect(JEV_PROVIDERS.find((p) => p.provider === "beatapi")).toBeTruthy();
    expect(JEV_MODEL_CHOICES.filter((c) => c.provider === "beatapi").map((c) => c.value)).toEqual(["jev-1.13-free"]);
  });

  it("routes its image and video submits at the task API, not a sync generations path", () => {
    expect(beatapi.imageConfig.baseUrl).toBe("https://api.beatapi.io/v1/images/tasks");
    expect(beatapi.videoConfig.baseUrl).toBe("https://api.beatapi.io/v1/videos/tasks");
  });

  it("withholds video from routing until the poll route is handled", () => {
    // BeatAPI serves task polls from /v1/tasks/{id}, not as a child of the submit
    // path, so the shared video core would poll a URL that 404s. Advertising the
    // kind before that is wired would turn every video request into a guaranteed
    // failure, so it is declared (the catalogue still shows it) but not routed.
    expect(beatapi.hiddenKinds).toContain("video");
    expect(generationModels("video").length).toBeGreaterThan(0);
  });

  it("declares only generation-servable image ids", () => {
    const ids = generationModels("image").map((m) => m.id);
    // These are the ids POST /v1/images/tasks actually accepts.
    expect(ids).toEqual(expect.arrayContaining(["nano-banana", "gpt-image-2", "seedream-5-pro"]));
    // nano-banana-2 is listed by /v1/media/models but the task API answers
    // 400 "not catalogued"; it is declared hidden rather than offered.
    expect(ids).not.toContain("nano-banana-2");
    expect(model("nano-banana-2").hidden).toBe(true);
  });

  it("does not offer the /v1/models image ids as generation models", () => {
    // Those 8 ids are reachable through the TEXT api only. Probing the image task
    // endpoint with them returns 400 "not catalogued", so declaring them as image
    // models would advertise eight models that fail every call.
    const ids = generationModels("image").map((m) => m.id);
    for (const textOnly of ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image", "gemini-3-pro-image-preview"]) {
      expect(ids).not.toContain(textOnly);
    }
  });

  it("marks the free-credit image ids so a balance-less key is not misread as broken", () => {
    // Measured: 402 (allow-listed, needs balance) vs 403 (not on the free tier).
    const free = generationModels("image").filter((m) => m.beatFree === true).map((m) => m.id);
    const paid = generationModels("image").filter((m) => m.beatFree === false).map((m) => m.id);
    expect(free).toEqual(expect.arrayContaining(["nano-banana", "gpt-image-2", "grok-imagine-image-2.0"]));
    expect(paid).toEqual(expect.arrayContaining(["seedream-5-pro", "qwen-image-2.1"]));
  });

  it("gives every model a unique id", () => {
    const ids = beatapi.models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("BeatAPI image adapter", () => {
  const adapter = getImageAdapter("beatapi");

  const ok = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("is wired into the image provider table as an async adapter", () => {
    expect(isImageProvider("beatapi")).toBe(true);
    expect(adapter.async).toBe(true);
    expect(adapter.buildUrl()).toBe("https://api.beatapi.io/v1/images/tasks");
  });

  it("submits to the task API and normalizes the hosted result", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ data: { id: "task_ABC" } }, 201))
      .mockResolvedValueOnce(ok({ data: { status: "queued", poll_after_seconds: 1 } }))
      .mockResolvedValueOnce(ok({
        data: { status: "succeeded", output: { media: [{ type: "image", url: "https://media.beatapi.io/a.png", mime_type: "image/png" }] } },
      }));

    const task = await adapter.parseResponse(await fetch("https://api.beatapi.io/v1/images/tasks"), {
      headers: { Authorization: "Bearer k" },
    });

    // The poll must go to /v1/tasks/{id} — NOT to a child of the submit path,
    // which is the whole reason this adapter exists.
    expect(task.status).toBe("succeeded");
    expect(fetchSpy.mock.calls[1][0]).toBe("https://api.beatapi.io/v1/tasks/task_ABC");
    expect(adapter.normalize(task)).toEqual({
      created: expect.any(Number),
      data: [{ url: "https://media.beatapi.io/a.png" }],
    });
  });

  it("surfaces the upstream reason instead of collapsing it into a generic failure", async () => {
    // 402 (allow-listed, needs a balance) and 403 (not on the free tier) send an
    // operator to completely different places, so the code has to survive.
    for (const [status, code] of [[402, "insufficient_credits"], [403, "forbidden"]]) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(ok({ error: { code, message: "no balance" } }, status));
      await expect(
        adapter.parseResponse(await fetch("https://api.beatapi.io/v1/images/tasks"), { headers: {} })
      ).rejects.toThrow(new RegExp(`${status}`));
    }
  });

  it("fails fast on a failed task with the reason it gave", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ data: { id: "task_X" } }, 201))
      .mockResolvedValueOnce(ok({ data: { status: "failed", error_message: "content policy", error_code: "policy" } }));
    await expect(
      adapter.parseResponse(await fetch("https://api.beatapi.io/v1/images/tasks"), { headers: {} })
    ).rejects.toThrow(/content policy/);
  });

  it("treats requires_action as terminal rather than polling until timeout", async () => {
    // requires_action means the task waits on the caller. Polling it forever would
    // burn the full timeout instead of failing fast with the task's own reason.
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ data: { id: "task_Y" } }, 201))
      .mockResolvedValueOnce(ok({ data: { status: "requires_action", error_message: "needs consent" } }));
    await expect(
      adapter.parseResponse(await fetch("https://api.beatapi.io/v1/images/tasks"), { headers: {} })
    ).rejects.toThrow(/needs consent/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries a throttled poll instead of failing a task that is still running", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(ok({ data: { id: "task_Z" } }, 201))
      .mockResolvedValueOnce(ok({}, 429))
      .mockResolvedValueOnce(ok({ data: { status: "succeeded", output: { media: [{ type: "image", url: "https://x/y.png" }] } } }));
    const task = await adapter.parseResponse(await fetch("https://api.beatapi.io/v1/images/tasks"), { headers: {} });
    expect(task.status).toBe("succeeded");
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("builds a body the model's strict input schema accepts", () => {
    // BeatAPI rejects unknown keys, so only declared parameters may be forwarded.
    expect(adapter.buildBody("nano-banana", { prompt: "x", size: "1024x1792" })).toEqual({
      model: "nano-banana", prompt: "x", aspect_ratio: "9:16",
    });
    expect(adapter.buildBody("gpt-image-2", { prompt: "x", background: "transparent", nonsense: 1 })).toEqual({
      model: "gpt-image-2", prompt: "x", background: "transparent",
    });
  });
});
