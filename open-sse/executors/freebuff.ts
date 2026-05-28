import { BaseExecutor } from "./base";
import { PROVIDERS } from "../config/providers";
import { createDeadlineSignal, mergeAbortSignals } from "../utils/abort";
import { proxyAwareFetch } from "../utils/proxyFetch";
import {
  buildFreebuffHeaders,
  buildFreebuffAgentRunsUrl,
  buildFreebuffRunStartRequest,
  FREEBUFF_DEFAULT_AGENT_ID,
  FREEBUFF_DEFAULT_CLIENT_ID,
} from "../../src/lib/freebuff/probe";

const RUN_START_TIMEOUT_MS = 15_000;

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
    const { credentials, body, signal, log, proxyOptions = null } = args;
    const token = credentials.apiKey || credentials.accessToken;

    // Step 1: Start a run with proxy support, abort signal, and timeout
    let runId: string;
    try {
      const deadline = createDeadlineSignal(RUN_START_TIMEOUT_MS, "freebuff run-start");
      const requestSignal = signal
        ? mergeAbortSignals([signal, deadline.signal])
        : deadline.signal;

      const runResponse = await proxyAwareFetch(buildFreebuffAgentRunsUrl(), {
        method: "POST",
        headers: buildFreebuffHeaders(token),
        body: JSON.stringify(buildFreebuffRunStartRequest(FREEBUFF_DEFAULT_AGENT_ID)),
        signal: requestSignal,
      }, proxyOptions);

      deadline.clear();

      const runData = await runResponse.json().catch(() => null);
      if (!runData) {
        throw new Error(`Failed to start freebuff run: non-JSON response (status ${runResponse.status})`);
      }
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
