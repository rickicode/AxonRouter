import { describe, expect, it, vi, beforeEach } from "vitest";

const getModelComboMappings = vi.fn();
const createModelComboMapping = vi.fn();
const getComboById = vi.fn();
const getModelComboMappingById = vi.fn();
const updateModelComboMapping = vi.fn();
const deleteModelComboMapping = vi.fn();

vi.mock("../../src/lib/localDb.ts", () => ({
  getModelComboMappings,
  createModelComboMapping,
  getComboById,
  getModelComboMappingById,
  updateModelComboMapping,
  deleteModelComboMapping,
}));

vi.mock("../../src/lib/api/requireManagementAuth.ts", () => ({
  requireManagementAuth: vi.fn(async () => null),
}));

describe("model combo mapping routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("wraps create response as { mapping }", async () => {
    getComboById.mockResolvedValue({ id: "combo-1", name: "research" });
    createModelComboMapping.mockResolvedValue({ id: "map-1", pattern: "claude-*", comboId: "combo-1" });

    const { POST } = await import("../../src/app/api/model-combo-mappings/route.ts");
    const response = await POST({ json: async () => ({ pattern: "claude-*", comboId: "combo-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({ mapping: { id: "map-1", pattern: "claude-*", comboId: "combo-1" } });
  });

  it("deletes mapping by id", async () => {
    deleteModelComboMapping.mockResolvedValue(true);
    const { DELETE } = await import("../../src/app/api/model-combo-mappings/[id]/route.ts");
    const response = await DELETE({}, { params: Promise.resolve({ id: "map-1" }) });
    const payload = await response.json();
    expect(payload).toEqual({ success: true });
  });
});
