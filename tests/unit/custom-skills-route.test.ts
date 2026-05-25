import { beforeEach, describe, expect, it, vi } from "vitest";

const getCustomSkills = vi.fn();
const createCustomSkill = vi.fn();
const updateCustomSkill = vi.fn();
const deleteCustomSkill = vi.fn();
const duplicateCustomSkill = vi.fn();

vi.mock("@/lib/localDb", () => ({
  getCustomSkills,
  createCustomSkill,
  updateCustomSkill,
  deleteCustomSkill,
  duplicateCustomSkill,
}));

describe("/api/skills route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lists custom skills", async () => {
    getCustomSkills.mockResolvedValue([{ id: "1", slug: "custom-skill" }]);
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.GET(new Request("http://localhost/api/skills"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skills).toEqual([{ id: "1", slug: "custom-skill" }]);
  });

  it("exports custom skills", async () => {
    getCustomSkills.mockResolvedValue([{ id: "1", slug: "custom-skill" }]);
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.GET(new Request("http://localhost/api/skills?format=export"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skills).toEqual([{ id: "1", slug: "custom-skill" }]);
    expect(body.exportedAt).toBeTruthy();
  });

  it("creates custom skill", async () => {
    createCustomSkill.mockResolvedValue({ id: "1", slug: "custom-skill" });
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.POST(new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: "custom-skill", content: "# hello" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skill).toEqual({ id: "1", slug: "custom-skill" });
  });

  it("duplicates custom skill", async () => {
    duplicateCustomSkill.mockResolvedValue({ id: "2", slug: "custom-skill-copy" });
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.POST(new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateId: "1" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skill).toEqual({ id: "2", slug: "custom-skill-copy" });
  });

  it("imports custom skills in bulk", async () => {
    createCustomSkill
      .mockResolvedValueOnce({ id: "1", slug: "one" })
      .mockResolvedValueOnce({ id: "2", slug: "two" });
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.POST(new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: [{ slug: "one", content: "# one" }, { slug: "two", content: "# two" }] }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skills).toEqual([{ id: "1", slug: "one" }, { id: "2", slug: "two" }]);
  });

  it("updates custom skill", async () => {
    updateCustomSkill.mockResolvedValue({ id: "1", slug: "custom-skill", name: "Updated" });
    const mod = await import("../../src/app/api/skills/route.ts");
    const response = await mod.PATCH(new Request("http://localhost/api/skills", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "1", slug: "custom-skill", name: "Updated", content: "# hello" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.skill).toEqual({ id: "1", slug: "custom-skill", name: "Updated" });
  });
});
