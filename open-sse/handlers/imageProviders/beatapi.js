// BeatAPI image generation — async task submit + poll.
//
// BeatAPI has no synchronous /images/generations route (it 404s); generation is a
// task API:
//
//   POST /v1/images/tasks -> 201 { data: { id: "task_…" } }
//   GET  /v1/tasks/{id}   -> { data: Task }
//
// The Task carries its own backoff advice in `poll_after_seconds`, which is
// honoured instead of a fixed interval: BeatAPI returns that field precisely so a
// poller does not hammer a queued video/image task, and a fixed 1.5s poll against
// a busy task queue is how a poller earns a 429.
//
// Terminal states are `succeeded` and `failed`. `requires_action` is also treated
// as terminal: it means the task is waiting on the caller (a workflow step, a
// consent prompt), so polling it forever would hang the request until the HTTP
// timeout instead of failing fast with the reason the task gave.
import { sleep, nowSec, sizeToAspectRatio, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["beatapi"]?.imageConfig?.baseUrl || "https://api.beatapi.io/v1/images/tasks";
const API_ROOT = BASE_URL.replace(/\/v1\/images\/tasks$/, "/v1");
const TASKS_URL = `${API_ROOT}/tasks`;

// BeatAPI's own advice wins; the shared constant is only the floor.
const MIN_POLL_MS = POLL_INTERVAL_MS;
const MAX_POLL_MS = 5000;

const TERMINAL_OK = "succeeded";
const TERMINAL_BAD = new Set(["failed", "requires_action"]);

function authHeaders(creds) {
  const key = creds?.apiKey || creds?.accessToken;
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

export default {
  async: true,

  buildUrl: () => BASE_URL,

  buildHeaders: (creds) => authHeaders(creds),

  buildBody: (model, body) => {
    const out = { model, prompt: body.prompt };
    // BeatAPI takes an aspect ratio, not OpenAI's pixel size. Only forward what the
    // model actually declares: an unknown key is rejected by its strict input
    // schema (additionalProperties: false), which would 400 the whole request.
    if (body.size) out.aspect_ratio = sizeToAspectRatio(body.size);
    if (body.aspect_ratio) out.aspect_ratio = body.aspect_ratio;
    if (body.resolution) out.resolution = body.resolution;
    if (body.output_format) out.output_format = body.output_format;
    if (body.background) out.background = body.background;
    if (body.seed != null) out.seed = body.seed;
    if (body.enhance_prompt != null) out.enhance_prompt = body.enhance_prompt;
    return out;
  },

  async parseResponse(response, { headers, proxyOptions = null }) {
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Surface the upstream reason verbatim: BeatAPI distinguishes 402
      // (allow-listed, needs a balance) from 403 (not on the free tier) from 400
      // (id not catalogued), and collapsing them into "image failed" would send
      // the operator looking in the wrong place entirely.
      throw new Error(`BeatAPI image task ${response.status}: ${text.slice(0, 300)}`);
    }

    const created = await response.json();
    const id = created?.data?.id || created?.id;
    if (!id) throw new Error("BeatAPI: no task id returned");

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let wait = MIN_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(wait);
      const r = await proxyAwareFetch(`${TASKS_URL}/${encodeURIComponent(id)}`, { headers }, proxyOptions);
      if (!r.ok) {
        // One bad poll is not a dead task: the submit already succeeded, so retry
        // the poll rather than failing a generation that is still running.
        if (r.status === 429 || r.status >= 500) {
          wait = Math.min(wait * 2, MAX_POLL_MS);
          continue;
        }
        throw new Error(`BeatAPI task poll ${r.status}`);
      }
      const task = (await r.json())?.data || {};
      const status = task.status;
      if (status === TERMINAL_OK) return task;
      if (TERMINAL_BAD.has(status)) {
        throw new Error(task.error_message || `BeatAPI task ${status}${task.error_code ? ` (${task.error_code})` : ""}`);
      }
      // Server-told backoff, clamped so a bad value cannot stall or spin the loop.
      const advised = Number(task.poll_after_seconds);
      wait = Number.isFinite(advised) && advised > 0
        ? Math.min(Math.max(advised * 1000, MIN_POLL_MS), MAX_POLL_MS)
        : MIN_POLL_MS;
    }
    throw new Error("BeatAPI image polling timeout");
  },

  normalize: (task) => {
    // `output.r2_url` is deprecated upstream in favour of output.media[].url; read
    // the array and keep r2_url only as a fallback so a single-asset result still
    // normalizes if the array is ever absent.
    const media = Array.isArray(task?.output?.media) ? task.output.media : [];
    const urls = media.length
      ? media.map((m) => m?.url).filter(Boolean)
      : [task?.output?.r2_url].filter(Boolean);
    return { created: nowSec(), data: urls.map((url) => ({ url })) };
  },
};
