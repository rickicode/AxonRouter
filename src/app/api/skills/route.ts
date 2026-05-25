import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  createCurrentCustomSkill,
  deleteCurrentCustomSkill,
  duplicateCurrentCustomSkill,
  getCurrentCustomSkills,
  updateCurrentCustomSkill,
} from "@/lib/skillsAccess";

export const dynamic = "force-dynamic";

type SkillPayload = {
  id?: string;
  name?: string;
  slug?: string;
  content?: string;
  description?: string;
  duplicateId?: string;
  [key: string]: unknown;
};

type SkillWritePayload = {
  name: string;
  slug: string;
  content: string;
  description?: string;
};

type SkillsImportPayload = {
  skills?: SkillPayload[];
  duplicateId?: string;
  name?: string;
  slug?: string;
  content?: string;
  description?: string;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format");
    const skills = await getCurrentCustomSkills();
    if (format === "export") {
      return NextResponse.json({
        exportedAt: new Date().toISOString(),
        skills,
      });
    }
    return NextResponse.json({ skills });
  } catch (error) {
    console.log("Error reading custom skills:", error);
    return NextResponse.json({ error: "Failed to read custom skills" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as SkillsImportPayload;

    if (Array.isArray(body?.skills)) {
      const imported = [];
      for (const skill of body.skills) {
        if (!skill?.slug || !skill?.content) continue;
        const skillInput: SkillWritePayload = {
          name: typeof skill.name === "string" && skill.name.trim() ? skill.name : skill.slug,
          slug: skill.slug,
          content: skill.content,
          description: typeof skill.description === "string" ? skill.description : undefined,
        };
        imported.push(await createCurrentCustomSkill(skillInput));
      }
      return NextResponse.json({ skills: imported });
    }

    if (body?.duplicateId) {
      const duplicated = await duplicateCurrentCustomSkill(body.duplicateId);
      if (!duplicated) {
        return NextResponse.json({ error: "Skill not found" }, { status: 404 });
      }
      return NextResponse.json({ skill: duplicated });
    }

    if (!body?.slug || !body?.content) {
      return NextResponse.json({ error: "slug and content required" }, { status: 400 });
    }
    const created = await createCurrentCustomSkill({
      name: typeof body.name === "string" && body.name.trim() ? body.name : body.slug,
      slug: body.slug,
      content: body.content,
      description: typeof body.description === "string" ? body.description : undefined,
    });
    return NextResponse.json({ skill: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create custom skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as SkillPayload;
    if (!body?.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const updated = await updateCurrentCustomSkill(body.id, body);
    if (!updated) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    return NextResponse.json({ skill: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update custom skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteCurrentCustomSkill(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete custom skill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
