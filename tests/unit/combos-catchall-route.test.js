import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildParamsObject } from "../../src/server/routeLoader.mjs";

const mocks = vi.hoisted(() => ({
  getComboById: vi.fn(),
  getComboByName: vi.fn(),
  updateCombo: vi.fn(),
  deleteCombo: vi.fn(),
  createCombo: vi.fn(),
  delSharedCounter: vi.fn().mockResolvedValue(true),
  resetComboRotation: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getComboById: mocks.getComboById,
  getComboByName: mocks.getComboByName,
  updateCombo: mocks.updateCombo,
  deleteCombo: mocks.deleteCombo,
  createCombo: mocks.createCombo,
}));

vi.mock("@/lib/cache/client.js", () => ({
  delSharedCounter: mocks.delSharedCounter,
}));

vi.mock("open-sse/services/combo.js", () => ({
  resetComboRotation: mocks.resetComboRotation,
}));

const { GET, PUT, DELETE } = await import("../../src/app/api/combos/[...id]/route.js");

describe("API /api/combos/[...id] route handlers with routeLoader params", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testCombo = {
    id: "9e0ce51e-7437-4021-aa9f-1acf097cf963",
    name: "compactor",
    models: ["oc/mimo-v2.6-flash-free", "oc/muse-spark-1.3-contributor-free"],
    contextWindow: 250000,
    maxTokens: 32768,
  };

  it("handles GET /api/combos/{uuid} using buildParamsObject params", async () => {
    mocks.getComboById.mockResolvedValue(testCombo);

    const honoParams = { id: testCombo.id };
    const params = buildParamsObject(honoParams, "/api/combos/:id{.+}");

    const req = new Request(`http://localhost/api/combos/${testCombo.id}`);
    const res = await GET(req, { params: Promise.resolve(params) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(testCombo);
    expect(mocks.getComboById).toHaveBeenCalledWith(testCombo.id);
  });

  it("handles PUT /api/combos/{uuid} successfully updating models and contextWindow", async () => {
    mocks.getComboById.mockResolvedValue(testCombo);
    const updatedCombo = {
      ...testCombo,
      models: ["oc/mimo-v2.6-flash-free", "oc/muse-spark-1.3-contributor-free", "kc/kilo-auto/free"],
    };
    mocks.updateCombo.mockResolvedValue(updatedCombo);

    const honoParams = { id: testCombo.id };
    const params = buildParamsObject(honoParams, "/api/combos/:id{.+}");

    const updatePayload = {
      name: "compactor",
      models: ["oc/mimo-v2.6-flash-free", "oc/muse-spark-1.3-contributor-free", "kc/kilo-auto/free"],
      contextWindow: 250000,
      maxTokens: 32768,
    };

    const req = new Request(`http://localhost/api/combos/${testCombo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    const res = await PUT(req, { params: Promise.resolve(params) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toHaveLength(3);
    expect(mocks.updateCombo).toHaveBeenCalledWith(testCombo.id, updatePayload);
  });

  it("handles GET and PUT for combo name with slashes like auto/coding", async () => {
    const slashCombo = {
      id: "auto/coding",
      name: "auto/coding",
      models: ["ag/gemini-3.8-flash-high"],
    };
    mocks.getComboById.mockResolvedValue(null);
    mocks.getComboByName.mockResolvedValue(slashCombo);
    mocks.updateCombo.mockResolvedValue({
      ...slashCombo,
      models: ["ag/gemini-3.8-flash-high", "gcli/grok-4.7"],
    });

    const honoParams = { id: "auto/coding" };
    const params = buildParamsObject(honoParams, "/api/combos/:id{.+}");
    expect(params.id).toEqual(["auto", "coding"]);

    const req = new Request("http://localhost/api/combos/auto/coding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "auto/coding",
        models: ["ag/gemini-3.8-flash-high", "gcli/grok-4.7"],
      }),
    });

    const res = await PUT(req, { params: Promise.resolve(params) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.models).toEqual(["ag/gemini-3.8-flash-high", "gcli/grok-4.7"]);
  });

  it("handles DELETE /api/combos/{uuid}", async () => {
    mocks.getComboById.mockResolvedValue(testCombo);
    mocks.deleteCombo.mockResolvedValue(true);

    const honoParams = { id: testCombo.id };
    const params = buildParamsObject(honoParams, "/api/combos/:id{.+}");

    const req = new Request(`http://localhost/api/combos/${testCombo.id}`, {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve(params) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(mocks.deleteCombo).toHaveBeenCalledWith(testCombo.id);
  });
});
