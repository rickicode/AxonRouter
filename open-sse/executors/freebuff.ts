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
	ensureFreebuffSession,
	explainFreebuffError,
	extractFreebuffFingerprint,
	isFreebuffSessionActive,
	resolveFreebuffClientId,
} from "../../src/lib/freebuff/probe";

const RUN_START_TIMEOUT_MS = 15_000;

function normalizeFreebuffMessages(messages: unknown) {
	if (!Array.isArray(messages)) return messages;

	return messages.map((message) => {
		if (
			!message ||
			typeof message !== "object" ||
			(message as any).role !== "developer"
		) {
			return message;
		}
		// Codebuff currently routes free-mode completions through DeepSeek, whose
		// schema rejects OpenAI's newer `developer` role. Preserve the instruction
		// semantics by sending it as the older OpenAI-compatible `system` role.
		return { ...(message as any), role: "system" };
	});
}

/**
 * FreebuffExecutor — routes requests through codebuff.com's free-tier API.
 *
 * Session lifecycle:
 *   1. Uses `forceJoin=false` to reuse active sessions (saves rate-limit quota).
 *   2. ensureFreebuffSession auto-joins when current session is expired/inactive.
 *   3. If a completion returns 426 (session stale), force-joins a new session and retries once.
 *
 * Rate limit: 5 completions per Pacific-day (resets 07:00 PT).
 */
export class FreebuffExecutor extends BaseExecutor {
	constructor() {
		super("freebuff", PROVIDERS.freebuff);
	}

	buildUrl(
		_model?: string,
		_stream?: boolean,
		_urlIndex?: number,
		_credentials?: any,
	) {
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
		const {
			credentials,
			body,
			stream: clientWantsStream,
			signal,
			log,
			proxyOptions = null,
		} = args;
		const token = credentials.apiKey || credentials.accessToken;
		// Strip "freebuff/" prefix from model — Freebuff API expects "deepseek/deepseek-v4-flash"
		const rawModel =
			typeof body.model === "string" && body.model.startsWith("freebuff/")
				? body.model.slice("freebuff/".length)
				: body.model || args.model;

		// ── Step 1: Resolve session ──────────────────────────────────────────
		// forceJoin=false reuses active sessions. ensureFreebuffSession auto-joins
		// a new one when the current session is expired/inactive/rate-limited.
		const session = await ensureFreebuffSession(token, {
			model: rawModel,
			forceJoin: false,
		});
		const activeSessionPayload = session.join?.data || session.session?.data;
		if (!session.active) {
			const interpretation = explainFreebuffError(activeSessionPayload);
			const detail =
				activeSessionPayload?.message ||
				interpretation ||
				activeSessionPayload?.status ||
				"Freebuff free session is not active. Start/restart the freebuff CLI and wait for an active session.";
			throw new Error(`Freebuff free session unavailable: ${detail}`);
		}

		if (!isFreebuffSessionActive(activeSessionPayload)) {
			throw new Error(
				"Freebuff free session is not active. Start/restart the freebuff CLI and wait for admission.",
			);
		}

		// ── Step 2: Resolve IDs ──────────────────────────────────────────────
		// freebuff_instance_id is REQUIRED by codebuff API — without it the server
		// returns 426 "freebuff_update_required". Resolve from session data with
		// fallback chain: session.instanceId → clientId → default probe ID.
		const clientId =
			extractFreebuffFingerprint(activeSessionPayload) ||
			resolveFreebuffClientId(credentials);
		const freebuffInstanceId =
			extractFreebuffFingerprint(activeSessionPayload) ||
			clientId ||
			FREEBUFF_DEFAULT_CLIENT_ID;

		// ── Step 3: Start a run ──────────────────────────────────────────────
		let runId: string;
		try {
			runId = await this.startRun(token, signal, proxyOptions, log);
		} catch (error: any) {
			log?.error?.("FREEBUFF", `Run start failed: ${error.message}`);
			throw error;
		}

		// ── Step 4: Send completion ──────────────────────────────────────────
		const enhancedBody = this.buildEnhancedBody(
			body,
			rawModel,
			runId,
			clientId,
			freebuffInstanceId,
		);
		const result = await super.execute({ ...args, body: enhancedBody });

		// ── Step 5: Retry on session errors (426/409) ─────────────────────────
		// 426 = "freebuff_update_required" (stale session or missing instance_id)
		// 409 = "session_superseded" (another session took over)
		// Both indicate the current session state is invalid — force-join and retry.
		const shouldRetry =
			result.response.status === 426 || result.response.status === 409;
		if (shouldRetry) {
			log?.debug?.(
				"FREEBUFF",
				`Got ${result.response.status}, force-joining fresh session and retrying`,
			);
			try {
				return await this.retryWithFreshSession(
					args,
					rawModel,
					token,
					signal,
					proxyOptions,
					log,
				);
			} catch (retryError: any) {
				log?.error?.(
					"FREEBUFF",
					`Retry after 426 failed: ${retryError.message}`,
				);
				// Return original 426 response so chatCore can handle it
				return result;
			}
		}

		return result;
	}

	private async startRun(
		token: string,
		signal: AbortSignal | undefined,
		proxyOptions: any,
		log: any,
	): Promise<string> {
		const deadline = createDeadlineSignal(
			RUN_START_TIMEOUT_MS,
			"freebuff run-start",
		);
		const requestSignal = signal
			? mergeAbortSignals([signal, deadline.signal])
			: deadline.signal;

		const runResponse = await proxyAwareFetch(
			buildFreebuffAgentRunsUrl(),
			{
				method: "POST",
				headers: buildFreebuffHeaders(token),
				body: JSON.stringify(
					buildFreebuffRunStartRequest(FREEBUFF_DEFAULT_AGENT_ID),
				),
				signal: requestSignal,
			},
			proxyOptions,
		);

		deadline.clear();

		const runData = await runResponse.json().catch(() => null);
		if (!runData) {
			throw new Error(
				`Failed to start freebuff run: non-JSON response (status ${runResponse.status})`,
			);
		}
		const runId = runData.runId || runData.run_id || runData.id;
		if (!runId) {
			throw new Error(
				`Failed to start freebuff run: ${JSON.stringify(runData)}`,
			);
		}
		log?.debug?.("FREEBUFF", `Started run: ${runId}`);
		return runId;
	}

	private buildEnhancedBody(
		body: any,
		rawModel: string,
		runId: string,
		clientId: string,
		freebuffInstanceId: string,
	) {
		return {
			...body,
			model: rawModel,
			messages: normalizeFreebuffMessages(body.messages),
			codebuff_metadata: {
				run_id: runId,
				client_id: clientId,
				cost_mode: "free",
				freebuff_instance_id: freebuffInstanceId,
			},
			provider: {
				order: ["deepseek"],
				allow_fallbacks: true,
			},
		};
	}

	/**
	 * Retry a failed request with a fresh session (forceJoin=true).
	 * Used when the server returns 426 due to stale session state.
	 */
	private async retryWithFreshSession(
		args: any,
		rawModel: string,
		token: string,
		signal: AbortSignal | undefined,
		proxyOptions: any,
		log: any,
	) {
		const { credentials, body } = args;

		// Force-join a new session
		const freshSession = await ensureFreebuffSession(token, {
			model: rawModel,
			forceJoin: true,
		});

		if (!freshSession.active) {
			throw new Error("Fresh session still inactive after force-join");
		}

		const freshPayload = freshSession.join?.data || freshSession.session?.data;
		const freshClientId =
			extractFreebuffFingerprint(freshPayload) ||
			resolveFreebuffClientId(credentials);
		const freshInstanceId =
			extractFreebuffFingerprint(freshPayload) ||
			freshClientId ||
			FREEBUFF_DEFAULT_CLIENT_ID;

		// Start a new run with the fresh session
		const freshRunId = await this.startRun(token, signal, proxyOptions, log);

		// Build new body with fresh session data
		const freshBody = this.buildEnhancedBody(
			body,
			rawModel,
			freshRunId,
			freshClientId,
			freshInstanceId,
		);

		log?.info?.(
			"FREEBUFF",
			`Retry with fresh session: instance=${freshInstanceId.slice(0, 8)}...`,
		);
		return super.execute({ ...args, body: freshBody });
	}
}
