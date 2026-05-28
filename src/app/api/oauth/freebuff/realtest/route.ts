import { NextResponse } from "next/server";
import {
  FREEBUFF_DEFAULT_CLIENT_ID,
  FREEBUFF_DEFAULT_MODEL,
  ensureFreebuffSession,
  explainFreebuffError,
  extractFreebuffFingerprint,
  sendFreebuffCompletion,
  startFreebuffRun,
} from "@/lib/freebuff/probe";

type RealtestBody = {
  authToken?: unknown;
  prompt?: unknown;
  clientId?: unknown;
  agentId?: unknown;
  model?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as RealtestBody;
    const authToken = typeof body.authToken === "string" ? body.authToken.trim() : "";
    if (!authToken) {
      return NextResponse.json({ error: "Auth token is required" }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : "Say hello in one word";
    const clientId = typeof body.clientId === "string" && body.clientId.trim()
      ? body.clientId.trim()
      : FREEBUFF_DEFAULT_CLIENT_ID;
    const agentId = typeof body.agentId === "string" && body.agentId.trim()
      ? body.agentId.trim()
      : undefined;
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : FREEBUFF_DEFAULT_MODEL;

    const session = await ensureFreebuffSession(authToken, {
      model,
      forceJoin: true,
    });
    const activeSessionPayload = session.join?.data || session.session?.data;
    const sessionClientId = extractFreebuffFingerprint(activeSessionPayload) || clientId;
    const freebuffInstanceId = extractFreebuffFingerprint(activeSessionPayload);
    const run = await startFreebuffRun(authToken, agentId);

    let completion = null;
    if (run.data?.runId) {
      completion = await sendFreebuffCompletion(authToken, {
        runId: run.data.runId,
        prompt,
        clientId: sessionClientId,
        freebuffInstanceId,
        model,
      });
    }

    return NextResponse.json({
      ok: true,
      session: {
        active: session.active,
        status: session.session?.response.status || null,
        payload: session.session?.data || null,
        interpretation: explainFreebuffError(session.session?.data),
      },
      join: session.join
        ? {
            status: session.join.response.status,
            payload: session.join.data,
            interpretation: explainFreebuffError(session.join.data),
          }
        : null,
      activeSession: {
        payload: session.join?.data || session.session.data,
        interpretation: explainFreebuffError(session.join?.data || session.session.data),
      },
      run: {
        status: run.response.status,
        payload: run.data,
      },
      completion: completion
        ? {
            status: completion.response.status,
            payload: completion.data,
            interpretation: explainFreebuffError(completion.data),
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
