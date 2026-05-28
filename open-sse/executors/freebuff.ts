import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import {
  buildFreebuffHeaders,
  buildFreebuffAgentRunsUrl,
  buildFreebuffRunStartRequest,
  FREEBUFF_DEFAULT_AGENT_ID,
  FREEBUFF_DEFAULT_CLIENT_ID,
} from "../../src/lib/freebuff/probe";

export class FreebuffExecutor extends BaseExecutor {
  constructor() {
    super("freebuff", PROVIDERS.freebuff);
  }

  buildUrl(_model?: string, _stream?: boolean, _urlIndex?: number, _credentials?: any) {
    return "https://www.codebuff.com/api/v1/chat/completions";
  }

  buildHeaders(credentials: any, stream = true, _model?: string) {
    const token = credentials.apiKey || credentials.accessToken;
    const headers = buildFreebuffHeaders(token);
    if (stream) {
      headers["Accept"] = "text/event-stream";
    }
    return headers;
  }

  async execute(args: any) {
    const { credentials, body, log } = args;
    const token = credentials.apiKey || credentials.accessToken;

    // Step 1: Start a run
    let runId: string;
    try {
      const runResponse = await fetch(buildFreebuffAgentRunsUrl(), {
        method: "POST",
        headers: buildFreebuffHeaders(token),
        body: JSON.stringify(buildFreebuffRunStartRequest(FREEBUFF_DEFAULT_AGENT_ID)),
      });
      const runData = await runResponse.json();
      runId = runData.runId || runData.run_id || runData.id;
      if (!runId) {
        throw new Error(`Failed to start freebuff run: ${JSON.stringify(runData)}`);
      }
      log?.debug?.("FREEBUFF", `Started run: ${runId}`);
    } catch (error: any) {
      log?.error?.("FREEBUFF", `Run start failed: ${error.message}`);
      throw error;
    }

    // Step 2: Inject codebuff_metadata and provider into body
    const enhancedBody = {
      ...body,
      codebuff_metadata: {
        run_id: runId,
        client_id: FREEBUFF_DEFAULT_CLIENT_ID,
        cost_mode: "free",
      },
      provider: {
        order: ["deepseek"],
        allow_fallbacks: true,
      },
    };

    // Step 3: Call parent execute with enhanced body
    return super.execute({ ...args, body: enhancedBody });
  }
}
