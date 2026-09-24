import { randomUUID } from "node:crypto";
import { getAdapter } from "@/lib/db/driver.js";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo.js";
import { getApiKeys } from "@/lib/db/repos/apiKeysRepo.js";
import { PROVIDERS } from "open-sse/providers/index.js";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

const jobs = new Map();
const jobAbortControllers = new Map();
const PONG_REPS = 2;
const PONG_TIMEOUT_MS = 20000;
const SUITE_TIMEOUT_MS = 45000;

const PROMPTS = {
  pong: "Jawab singkat satu kata saja: PONG",
  coding: "Implementasikan TokenBucketRateLimiter Python yang thread-safe memakai threading.Lock. Class TokenBucketRateLimiter(capacity, refill_rate). Method consume(tokens=1) mengembalikan bool. Method time_until_next_available(tokens=1) mengembalikan detik. Refill lazy memakai timestamp, tanpa thread latar. Tulis kode lengkap.",
  logic: "Andi, Budi, Citra, dan Doni punya profesi Dokter, Guru, Insinyur, Pengacara dan mobil Merah, Biru, Hitam, Putih. Dokter punya mobil Merah. Guru bukan Andi dan bukan Citra. Mobil Budi bukan Hitam dan bukan Putih, dan Budi adalah Insinyur. Doni tidak punya mobil Putih. Siapa punya mobil Putih dan apa profesinya?",
  tool: "Berapa suhu cuaca di Jakarta sekarang?",
};

const WEATHER_TOOL = [{
  type: "function",
  function: {
    name: "get_current_weather",
    description: "Get the current weather for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
  },
}];

function gatewayBase() {
  return process.env.BENCHMARK_GATEWAY_URL || `http://127.0.0.1:${process.env.PORT || 20127}`;
}

export function parseGatewayBody(raw) {
  const text = String(raw || "").trim();
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const json = JSON.parse(text);
      return { format: "json", json, content: extractContent(json) };
    } catch {
      // Fall through to SSE when the body only looks like JSON.
    }
  }
  if (!text.includes("data:")) return { format: "text", json: null, content: text };
  let content = "";
  const toolCalls = [];
  let usage = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === "[DONE]") continue;
    try {
      const obj = JSON.parse(chunk);
      const choice = obj.choices?.[0] || {};
      const delta = choice.delta || choice.message || {};
      if (delta.content) content += delta.content;
      if (Array.isArray(delta.tool_calls)) toolCalls.push(...delta.tool_calls);
      if (obj.usage) usage = obj.usage;
    } catch {
      // Keep non-JSON SSE lines out of the measured content.
    }
  }
  return { format: "sse", json: { usage, toolCalls }, content, toolCalls };
}

function extractContent(body) {
  const choice = body?.choices?.[0] || {};
  const message = choice.message || {};
  return message.content || choice.text || "";
}

function extractToolCalls(body, parsed) {
  if (parsed?.toolCalls?.length) return parsed.toolCalls;
  return body?.choices?.[0]?.message?.tool_calls || [];
}

async function gatewayKey() {
  const keys = await getApiKeys();
  const active = keys.find((key) => key.isActive !== false);
  if (!active?.key) throw new Error("No active gateway API key");
  return active.key;
}

function modelSupportsTools(model) {
  const [provider, ...rest] = String(model || "").split("/");
  return getCapabilitiesForModel(provider, rest.join("/")).tools !== false;
}

async function readGatewayResponse(response, started) {
  if (!response.body) {
    const raw = await response.text();
    const total = Date.now() - started;
    return { raw, ttft: total, total };
  }
  const reader = response.body.getReader();
  const chunks = [];
  let ttft = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttft === null) ttft = Date.now() - started;
    chunks.push(value);
  }
  const total = Date.now() - started;
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { raw: new TextDecoder().decode(bytes), ttft: ttft ?? total, total };
}

async function callGateway({ model, connectionId, suite, key, signal = null }) {
  const started = Date.now();
  const body = {
    model,
    messages: [{ role: "user", content: PROMPTS[suite] || PROMPTS.pong }],
    max_tokens: { pong: 32, coding: 900, logic: 700, tool: 300 }[suite] || 700,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (suite === "tool") {
    if (!modelSupportsTools(model)) {
      return { request: body, responseBody: "", httpStatus: null, format: null, ttft: null, total: null, tokens: 0, tps: 0, content: "", toolCalls: [], is429: false, skipped: true };
    }
    body.tools = WEATHER_TOOL;
    body.tool_choice = "auto";
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "x-axonrouter-test-request": "1",
  };
  if (connectionId && connectionId !== "noauth") {
    headers["x-connection-id"] = connectionId;
    headers["x-connection-pin"] = "strict";
  }
  const signals = [AbortSignal.timeout(suite === "pong" ? PONG_TIMEOUT_MS : SUITE_TIMEOUT_MS)];
  if (signal) signals.push(signal);
  const combinedSignal = AbortSignal.any ? AbortSignal.any(signals) : signals[0];

  const response = await fetch(`${gatewayBase()}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: combinedSignal,
  });
  const { raw, ttft, total } = await readGatewayResponse(response, started);
  const parsed = parseGatewayBody(raw);
  const tokens = parsed.json?.usage?.completion_tokens || parsed.json?.usage?.output_tokens || 0;
  const unsupportedTool = suite === "tool" && /does not support tools|tool choice|tool calling is not supported|no tools/i.test(raw);
  return {
    request: body,
    responseBody: raw,
    httpStatus: response.status,
    format: parsed.format,
    ttft,
    total,
    tokens,
    tps: tokens > 0 ? Number((tokens / Math.max((total - ttft) / 1000, 0.001)).toFixed(2)) : 0,
    content: String(parsed.content || ""),
    toolCalls: extractToolCalls(parsed.json, parsed),
    is429: response.status === 429 || (!response.ok && /\brate limit\b|too many requests/i.test(raw)),
    skipped: unsupportedTool,
    error: response.ok ? null : raw.slice(0, 500),
  };
}

export function scoreAttempt(suite, result) {
  if (result.skipped) return { status: "skipped", score: null };
  if (result.is429) return { status: "rate_limited", score: null };
  if (!result.httpStatus || result.httpStatus >= 400) return { status: "failed", score: 0 };
  if (suite === "pong") {
    const ok = /pong/i.test(result.content);
    return { status: ok ? "passed" : "failed", score: ok ? 100 : 0 };
  }
  if (suite === "tool") {
    const ok = result.toolCalls.length > 0;
    return { status: ok ? "passed" : "failed", score: ok ? 100 : 0 };
  }
  if (suite === "coding") {
    if (result.content.length < 50) return { status: "failed", score: 0 };
    const checks = [
      [/TokenBucketRateLimiter/, 25],
      [/consume/, 25],
      [/time_until/, 20],
      [/Lock|threading/, 15],
      [/time\.monotonic|time\.time/, 15],
    ];
    const score = checks.reduce((sum, [pattern, points]) => sum + (pattern.test(result.content) ? points : 0), 0);
    return { status: score >= 50 ? "passed" : "failed", score };
  }
  if (suite === "logic") {
    const text = result.content.toLowerCase();
    if (text.length < 20) return { status: "failed", score: 0 };
    const score = (text.includes("pengacara") && text.includes("putih") ? 50 : 0)
      + (text.includes("budi") && text.includes("biru") ? 20 : 0)
      + (text.includes("doni") && (text.includes("hitam") || text.includes("guru")) ? 20 : 0)
      + (text.includes("dokter") && text.includes("merah") ? 10 : 0);
    return { status: score >= 50 ? "passed" : "failed", score };
  }
  return { status: "failed", score: 0 };
}

async function insertAttempt(db, row) {
  await db.run(
    `INSERT INTO benchmark_attempts (
      id, job_id, provider, connection_id, account_name, model, suite, rep, status,
      http_status, format, ttft_ms, total_ms, tokens, tps, score, excerpt, request_body, response_body, error
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      randomUUID(), row.jobId, row.provider, row.connectionId, row.accountName, row.model,
      row.suite, row.rep, row.status, row.httpStatus, row.format, row.ttft, row.total,
      row.tokens, row.tps, row.score, row.content.slice(0, 500),
      JSON.stringify(row.request || null), row.responseBody || "", row.error,
    ],
  );
}

function providerModels(providerId) {
  const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  return getModelsByProviderId(providerId)
    .filter((model) => (model.kind || model.type || "llm") === "llm")
    .map((model) => model.id)
    .filter(Boolean)
    .map((id) => `${alias}/${id}`);
}
function getSelectedModelsForProvider(providerId, modelsFilter) {
  const allModels = providerModels(providerId);
  if (!modelsFilter || !Array.isArray(modelsFilter) || modelsFilter.length === 0) {
    return allModels;
  }
  const set = new Set(modelsFilter);
  const alias = PROVIDER_ID_TO_ALIAS[providerId] || providerId;
  return allModels.filter((m) =>
    set.has(m) ||
    set.has(`${alias}/${m}`) ||
    set.has(m.replace(`${alias}/`, "")) ||
    set.has(m.replace(`${providerId}/`, ""))
  );
}

async function accountsFor(providerId) {
  const provider = PROVIDERS[providerId];
  if (provider?.noAuth) return [{ id: "noauth", name: "Public" }];
  const rows = await getProviderConnections({ provider: providerId, isActive: true });
  return rows
    .filter((row) => row.testStatus === "active")
    .map((row) => ({ id: row.id, name: row.name || row.email || row.id.slice(0, 8) }));
}

async function updateJob(db, id, patch) {
  const sets = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    values.push(key === "progress" ? JSON.stringify(value) : value);
    sets.push(key === "progress" ? `${key} = $${values.length}::jsonb` : `${key} = $${values.length}`);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.run(`UPDATE benchmark_jobs SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
}

let recoveredInterruptedJobs = false;

async function recoverInterruptedJobs(db, currentId) {
  if (recoveredInterruptedJobs) return;
  recoveredInterruptedJobs = true;
  const liveIds = [...new Set([currentId, ...jobs.keys()])];
  await db.run(
    `UPDATE benchmark_jobs
     SET status = 'failed',
         error = 'Server restarted before this benchmark finished',
         finished_at = NOW()
     WHERE status IN ('queued', 'running')
       AND NOT (id = ANY($1::uuid[]))`,
    [liveIds],
  );
}

async function runJob(job) {
  const db = await getAdapter();
  const key = await gatewayKey();
  await recoverInterruptedJobs(db, job.id);
  await updateJob(db, job.id, {
    status: "running",
    started_at: new Date().toISOString(),
    progress: { done: 0, total: job.total, phase: "Memulai pengujian benchmark..." },
  });
  const retries = [];
  const deferred = [];
  let done = 0;
  const abortCtrl = jobAbortControllers.get(job.id);
  const isAborted = () => Boolean(abortCtrl?.signal?.aborted);

  const record = async (providerId, account, model, suite, rep) => {
    if (isAborted()) return "failed";
    await updateJob(db, job.id, {
      status: "running",
      progress: {
        done,
        total: job.total,
        retrying: retries.length,
        currentModel: model,
        currentProvider: providerId,
        currentSuite: suite,
        currentRep: rep,
        currentAccount: account.name,
        phase: `Menguji ${model} · ${suite.toUpperCase()} (Rep ${rep}/${suite === "pong" ? PONG_REPS : 1})`,
      },
    }).catch(() => {});
    const result = await callGateway({ model, connectionId: account.id, suite, key, signal: abortCtrl?.signal }).catch((error) => ({
      httpStatus: 0, format: null, ttft: null, total: null, tokens: 0, tps: 0,
      content: "", toolCalls: [], is429: false, error: error.message,
    }));
    const scored = scoreAttempt(suite, result);
    await insertAttempt(db, {
      ...result, ...scored, jobId: job.id, provider: providerId, connectionId: account.id,
      accountName: account.name, model, suite, rep,
    });
    return scored.status;
  };
  for (const providerId of job.providers) {
    if (isAborted()) break;
    const accounts = await accountsFor(providerId);
    const models = getSelectedModelsForProvider(providerId, job.models);
    for (const account of accounts) {
      if (isAborted()) break;
      for (const model of models) {
        if (isAborted()) break;
        let pongPassed = false;
        let pongLimited = false;
        for (let rep = 1; rep <= PONG_REPS; rep += 1) {
          if (isAborted()) break;
          const status = await record(providerId, account, model, "pong", rep);
          if (status === "passed") pongPassed = true;
          if (status === "rate_limited") {
            pongLimited = true;
            retries.push([providerId, account, model, "pong", rep]);
          }
        }
        if (!pongPassed && pongLimited) deferred.push([providerId, account, model]);
        if (pongPassed) {
          for (const suite of job.suites.filter((suite) => suite !== "pong")) {
            if (isAborted()) break;
            const status = await record(providerId, account, model, suite, 1);
            if (status === "rate_limited") retries.push([providerId, account, model, suite, 1]);
          }
        }
        done += 1;
        await updateJob(db, job.id, {
          progress: {
            done,
            total: job.total,
            retrying: retries.length,
            phase: done < job.total ? `Selesai ${model} (${done}/${job.total})` : "Menyelesaikan putaran utama...",
          },
        });
      }
    }
  }
  if (!isAborted()) {
    for (const [providerId, account, model, suite, rep] of retries) {
      if (isAborted()) break;
      const status = await record(providerId, account, model, suite, rep);
      if (suite === "pong" && status === "passed") {
        const pending = deferred.find((item) => item[0] === providerId && item[1] === account && item[2] === model);
        if (pending) pending.passed = true;
      }
    }
    for (const [providerId, account, model] of deferred.filter((item) => item.passed)) {
      if (isAborted()) break;
      for (const suite of job.suites.filter((suite) => suite !== "pong")) {
        if (isAborted()) break;
        await record(providerId, account, model, suite, 1);
      }
    }
  }
  let reviewError = null;
  if (job.reviewer && !isAborted()) {
    await updateJob(db, job.id, {
      progress: {
        done: job.total,
        total: job.total,
        phase: `Menyusun kesimpulan analisis dengan reviewer (${job.reviewer})...`,
      },
    }).catch(() => {});
    try {
      const wrote = await writeReview(db, job, key);
      if (!wrote) reviewError = "Reviewer tidak mengembalikan teks";
    } catch (error) {
      reviewError = error.message;
    }
  }
  const finalStatus = isAborted() ? "cancelled" : (reviewError ? "review_failed" : "completed");
  const finalError = isAborted() ? "Dibatalkan oleh pengguna" : reviewError;
  await updateJob(db, job.id, {
    status: finalStatus,
    error: finalError,
    finished_at: new Date().toISOString(),
  });
  jobs.delete(job.id);
  jobAbortControllers.delete(job.id);
}

async function writeReview(db, job, key) {
  const rows = await db.all(
    `SELECT provider, model, suite, status, COUNT(*)::int AS n,
            ROUND(AVG(total_ms)::numeric, 1) AS avg_ms
     FROM benchmark_attempts WHERE job_id = $1
     GROUP BY provider, model, suite, status
     ORDER BY provider, model, suite`,
    [job.id],
  );
  const promptResult = await fetch(`${gatewayBase()}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: job.reviewer,
      messages: [{
        role: "user",
        content: `Tulis kesimpulan bahasa Indonesia dari fakta benchmark ini. Jangan mengarang angka. Bagi jadi tiga bagian: Layak dipakai, Jangan dipakai, Cek lagi. Sebut provider, model, status, dan latensi yang ada.\n${JSON.stringify(rows).slice(0, 12000)}`,
      }],
      max_tokens: 800,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(SUITE_TIMEOUT_MS),
  });
  const raw = await promptResult.text();
  const parsed = parseGatewayBody(raw);
  if (!parsed.content) return false;
  await db.run(
    `INSERT INTO benchmark_reports (id, job_id, reviewer, report) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), job.id, job.reviewer, parsed.content],
  );
  return true;
}

export async function startBenchmark({ providers, models = null, suites = ["pong"], reviewer = null }) {
  const db = await getAdapter();
  const id = randomUUID();
  const uniqueProviders = [...new Set(providers.filter((provider) => PROVIDERS[provider]))];
  if (uniqueProviders.length === 0) throw new Error("Tidak ada provider yang valid dipilih");
  let total = 0;
  for (const providerId of uniqueProviders) {
    const pModels = getSelectedModelsForProvider(providerId, models);
    total += (await accountsFor(providerId)).length * pModels.length;
  }
  if (total === 0) throw new Error("Tidak ada akun aktif atau model untuk provider/model yang dipilih");
  await db.run(
    `INSERT INTO benchmark_jobs (id, status, providers, suites, reviewer, progress)
     VALUES ($1, 'queued', $2::jsonb, $3::jsonb, $4, $5::jsonb)`,
    [id, uniqueProviders, suites, reviewer, JSON.stringify({ done: 0, total, phase: "Menyiapkan benchmark..." })],
  );
  const job = { id, providers: uniqueProviders, models, suites, reviewer, total };
  const abortCtrl = new AbortController();
  jobAbortControllers.set(id, abortCtrl);
  jobs.set(id, runJob(job).catch(async (error) => {
    await updateJob(db, id, { status: "failed", error: error.message, finished_at: new Date().toISOString() });
    jobs.delete(id);
    jobAbortControllers.delete(id);
  }));
  return { id, total };
}

export async function cancelBenchmark(id) {
  const ctrl = jobAbortControllers.get(id);
  if (ctrl) {
    ctrl.abort();
  }
  const db = await getAdapter();
  await updateJob(db, id, {
    status: "cancelled",
    error: "Dibatalkan oleh pengguna",
    finished_at: new Date().toISOString(),
  });
  jobs.delete(id);
  jobAbortControllers.delete(id);
  return { ok: true };
}

export async function deleteBenchmarkJob(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""))) return { ok: false };
  cancelBenchmark(id).catch(() => {});
  const db = await getAdapter();
  await db.run(`DELETE FROM benchmark_jobs WHERE id = $1`, [id]);
  return { ok: true };
}

export async function requestBenchmarkAdvice({ reviewer, jobIds = [] }) {
  if (!reviewer) throw new Error("Reviewer kosong");
  const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(val || ""));
  const ids = [...new Set(jobIds.filter(isUuid))].slice(0, 20);
  if (ids.length === 0) throw new Error("Pilih riwayat benchmark dulu");
  const db = await getAdapter();
  const key = await gatewayKey();
  const rows = await db.all(
    `SELECT created_at, provider, account_name, model, suite, status, http_status, total_ms, request_body, response_body, error
     FROM benchmark_attempts
     WHERE job_id = ANY($1::uuid[])
     ORDER BY created_at DESC
     LIMIT 300`,
    [ids],
  );
  if (rows.length === 0) throw new Error("Riwayat itu belum punya request dan response");
  const evidence = [];
  let size = 0;
  for (const row of rows) {
    const item = {
      provider: row.provider,
      account: row.account_name,
      model: row.model,
      suite: row.suite,
      status: row.status,
      http: row.http_status,
      ms: row.total_ms,
      request: String(row.request_body || "").slice(0, 8000),
      response: String(row.response_body || row.error || "").slice(0, 8000),
    };
    const encoded = JSON.stringify(item);
    if (size + encoded.length > 120000) break;
    evidence.push(item);
    size += encoded.length;
  }
  const response = await fetch(`${gatewayBase()}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: reviewer,
      messages: [{
        role: "user",
        content: `Kamu meninjau riwayat benchmark. Gunakan hanya request dan response di bawah. Jangan mengarang. Tulis bahasa Indonesia: Layak dipakai, Jangan dipakai, Cek lagi, lalu alasan dari isi respons.\n${JSON.stringify(evidence)}`,
      }],
      max_tokens: 1200,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(SUITE_TIMEOUT_MS),
  });
  const raw = await response.text();
  const parsed = parseGatewayBody(raw);
  if (!parsed.content) throw new Error(raw.slice(0, 300) || "Reviewer tidak menjawab");
  const id = randomUUID();
  await db.run(
    `INSERT INTO benchmark_jobs (id, status, providers, suites, reviewer, started_at, finished_at, progress)
     VALUES ($1, 'completed', $2::jsonb, '["advice"]'::jsonb, $3, NOW(), NOW(), $4::jsonb)`,
    [id, ids, reviewer, JSON.stringify({ kind: "advice", evidence: evidence.length, attempts: rows.length })],
  );
  await db.run(
    `INSERT INTO benchmark_reports (id, job_id, reviewer, report) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), id, reviewer, parsed.content],
  );
  return { id, report: parsed.content, evidence: evidence.length };
}
export async function pruneBenchmarkHistory({ retentionDays } = {}) {
  const db = await getAdapter();
  let days = Number(retentionDays);
  if (!Number.isFinite(days)) {
    const { getSettings } = await import("@/lib/db/repos/settingsRepo.js");
    days = Number((await getSettings())?.benchmarkRetentionDays);
  }
  days = Math.max(1, Math.min(365, days || 30));
  const result = await db.run(
    `DELETE FROM benchmark_jobs AS jobs
     USING (
       SELECT id FROM benchmark_jobs
       WHERE created_at < NOW() - ($1 || ' days')::interval
       ORDER BY created_at
       LIMIT 500
     ) AS old
     WHERE jobs.id = old.id`,
    [days],
  );
  return { deleted: Number(result?.changes || 0), retentionDays: days };
}


// A benchmark row can stay 'running' after the process dies (restart, crash):
// no in-memory abort controller means no live runner owns it. Sweep such rows
// to 'failed' whenever the job list or a job detail is read.
async function sweepStaleJobs(db, id = null) {
  const live = [...jobs.keys()];
  if (id && jobAbortControllers.has(id)) return;
  await db.run(
    `UPDATE benchmark_jobs
     SET status = 'failed',
         error = COALESCE(error, 'Server restarted before this benchmark finished'),
         finished_at = COALESCE(finished_at, NOW())
     WHERE status IN ('queued', 'running')
       AND NOT (id = ANY($1::uuid[]))`,
    [id ? [...new Set([id, ...live])] : live],
  ).catch(() => {});
}

export async function listBenchmarkJobs(limit = 30) {
  const db = await getAdapter();
  await sweepStaleJobs(db);
  const jobs = await db.all(
    `SELECT id, status, providers, suites, reviewer, created_at, started_at, finished_at, progress, error
     FROM benchmark_jobs ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  const daily = await db.all(
    `SELECT provider, model,
            COUNT(*) FILTER (WHERE suite = 'pong' AND status IN ('passed', 'failed'))::int AS pong_total,
            COUNT(*) FILTER (WHERE suite = 'pong' AND status = 'passed')::int AS pong_passed,
            ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_ms) FILTER (WHERE status = 'passed'))::numeric, 1) AS median_ms,
            ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ttft_ms) FILTER (WHERE status = 'passed'))::numeric, 1) AS median_ttft,
            ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) FILTER (WHERE score IS NOT NULL))::numeric, 1) AS median_score
     FROM benchmark_attempts
     WHERE created_at >= date_trunc('day', NOW())
     GROUP BY provider, model
     ORDER BY provider, model
     LIMIT 200`,
  );
  return { jobs, daily };
}

export async function getBenchmarkJob(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""))) return null;
  const db = await getAdapter();
  await sweepStaleJobs(db, id);
  const job = await db.get(`SELECT * FROM benchmark_jobs WHERE id = $1`, [id]);
  if (!job) return null;
  const attempts = await db.all(
    `SELECT id, provider, account_name, model, suite, status, format, rep,
            http_status, ttft_ms, total_ms, tokens, tps, score, error, excerpt,
            request_body, response_body, created_at
     FROM benchmark_attempts WHERE job_id = $1
     ORDER BY created_at ASC`,
    [id],
  );
  const reports = await db.all(
    `SELECT reviewer, report, created_at FROM benchmark_reports WHERE job_id = $1 ORDER BY created_at DESC`,
    [id],
  );
  return { ...job, attempts, reports };
}
