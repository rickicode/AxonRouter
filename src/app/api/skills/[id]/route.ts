import fs from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";
import { getCurrentCustomSkillContentBySlug } from "@/lib/skillsAccess";

type RouteContext = {
  params: Promise<{
    id?: string;
  }>;
};

type SkillReadError = Error & {
  code?: string;
};

function getSkillsRootCandidates(): string[] {
  return [
    path.join(process.cwd(), "skills"),
    path.join(process.cwd(), "..", "skills"),
  ];
}

async function readSkillMarkdown(id: string): Promise<string> {
  const customContent = await getCurrentCustomSkillContentBySlug(id);
  if (customContent) return customContent;

  for (const skillsDir of getSkillsRootCandidates()) {
    const filePath = path.join(skillsDir, id, "SKILL.md");
    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as SkillReadError)?.code !== "ENOENT") throw error;
    }
  }

  const notFound = new Error("Skill not found") as SkillReadError;
  notFound.code = "ENOENT";
  throw notFound;
}

function isSafeSkillId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9-]+$/i.test(id);
}

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const { id } = await params;
    if (!isSafeSkillId(id)) {
      return NextResponse.json({ error: "Invalid skill id" }, { status: 400 });
    }

    const content = await readSkillMarkdown(id);

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if ((error as SkillReadError)?.code === "ENOENT") {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    console.log("Error reading skill markdown:", error);
    return NextResponse.json({ error: "Failed to read skill" }, { status: 500 });
  }
}
