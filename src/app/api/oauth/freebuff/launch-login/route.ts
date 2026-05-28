import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

const AUTH_URL_REGEX = /https:\/\/auth\.openai\.com\/oauth\/authorize[^\s"')]+/i;
const GENERIC_URL_REGEX = /https?:\/\/[^\s"')]+/g;
const CAPTURE_TIMEOUT_MS = 8000;

function extractAuthUrl(output: string) {
  if (!output) return null;
  const directMatch = output.match(AUTH_URL_REGEX);
  if (directMatch?.[0]) return directMatch[0];

  const urls = output.match(GENERIC_URL_REGEX) || [];
  for (const url of urls) {
    if (url.includes("auth.openai.com/oauth/authorize")) return url;
  }
  return urls[0] || null;
}

async function captureFreebuffOutput(args: string[]) {
  return await new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; args: string[] }>((resolve, reject) => {
    const child = spawn("freebuff", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (payload: { code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; args: string[] }) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    const timer = setTimeout(() => {
      const payload = { code: null, signal: null, stdout, stderr, args };
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore kill failure
      }
      finish(payload);
    }, CAPTURE_TIMEOUT_MS);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({ code, signal, stdout, stderr, args });
    });
  });
}

export async function POST() {
  try {
    const result = await captureFreebuffOutput([]);
    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join("\n");
    const authUrl = extractAuthUrl(combinedOutput);

    return NextResponse.json({
      success: true,
      authUrl,
      stdout: result.stdout || null,
      stderr: result.stderr || null,
      code: result.code,
      signal: result.signal,
      capturedOutput: combinedOutput || null,
      attemptedArgs: result.args,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
