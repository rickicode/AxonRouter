type SkillsDbModule = Pick<
  typeof import("@/lib/localDb"),
  "getCustomSkills" | "createCustomSkill" | "duplicateCustomSkill" | "updateCustomSkill" | "deleteCustomSkill"
>;

async function loadSkillsDb(): Promise<SkillsDbModule> {
  return import("@/lib/localDb");
}

export async function getCurrentCustomSkills() {
  const { getCustomSkills } = await loadSkillsDb();
  return getCustomSkills();
}

export async function getCurrentCustomSkillContentBySlug(slug: string) {
  const skills = await getCurrentCustomSkills();
  const custom = skills.find((skill: { slug?: string; content?: string }) => skill.slug === slug);
  return custom?.content || null;
}

export async function createCurrentCustomSkill(payload: {
  name: string;
  slug: string;
  content: string;
  description?: string;
}) {
  const { createCustomSkill } = await loadSkillsDb();
  return createCustomSkill(payload);
}

export async function duplicateCurrentCustomSkill(id: string) {
  const { duplicateCustomSkill } = await loadSkillsDb();
  return duplicateCustomSkill(id);
}

export async function updateCurrentCustomSkill(id: string, payload: Record<string, unknown>) {
  const { updateCustomSkill } = await loadSkillsDb();
  return updateCustomSkill(id, payload);
}

export async function deleteCurrentCustomSkill(id: string) {
  const { deleteCustomSkill } = await loadSkillsDb();
  return deleteCustomSkill(id);
}
