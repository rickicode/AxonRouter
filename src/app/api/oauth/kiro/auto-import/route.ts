import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

type CacheTokenFile = {
  refreshToken?: string;
};

/**
 * GET /api/oauth/kiro/auto-import
 * Auto-detect and extract Kiro refresh token from AWS SSO cache
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const targetProvider = searchParams.get("targetProvider") === "amazon-q" ? "amazon-q" : "kiro";
    const providerLabel = targetProvider === "amazon-q" ? "Amazon Q" : "Kiro";
    const cachePath = join(homedir(), ".aws/sso/cache");

    let files: string[];
    try {
      files = await readdir(cachePath);
    } catch {
      return NextResponse.json({
        found: false,
        error: `AWS SSO cache not found. Please login to ${providerLabel} first.`,
      });
    }

    let refreshToken: string | null = null;
    let foundFile: string | null = null;

    const preferredTokenFile = targetProvider === "amazon-q" ? "amazon-q-auth-token.json" : "kiro-auth-token.json";
    if (files.includes(preferredTokenFile)) {
      try {
        const content = await readFile(join(cachePath, preferredTokenFile), "utf-8");
        const data = JSON.parse(content) as CacheTokenFile;
        if (data.refreshToken && data.refreshToken.startsWith("aorAAAAAG")) {
          refreshToken = data.refreshToken;
          foundFile = preferredTokenFile;
        }
      } catch {
        // Continue to search other files.
      }
    }

    if (!refreshToken) {
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const content = await readFile(join(cachePath, file), "utf-8");
          const data = JSON.parse(content) as CacheTokenFile;

          if (data.refreshToken && data.refreshToken.startsWith("aorAAAAAG")) {
            refreshToken = data.refreshToken;
            foundFile = file;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    if (!refreshToken) {
      return NextResponse.json({
        found: false,
        error: `${providerLabel} token not found in AWS SSO cache. Please login to ${providerLabel} first.`,
      });
    }

    return NextResponse.json({
      found: true,
      refreshToken,
      source: foundFile,
    });
  } catch (error) {
    console.log("Kiro auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
