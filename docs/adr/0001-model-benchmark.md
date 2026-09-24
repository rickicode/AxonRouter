# ADR 0001 — Model benchmark

Date: 2026-09-22
Status: accepted

## Decision

Benchmark runs as a server job inside axonrouter. The dashboard starts the job and shows progress. The browser does not call models itself.

Each selected model is called through `POST /v1/chat/completions` on the local gateway, once per active account of that model's provider. The gateway chooses nothing by rotation for this test: the job pins the account. A dead model does not change `provider_connections.test_status`.

The response parser accepts both JSON and SSE. Antigravity can return `200` with an SSE body even when `stream: false` was requested. A JSON-only parser must not mark that model dead.

## Suites

1. PONG is the gate. Two reps, short timeout. The reply must contain `PONG`. Failure skips every later suite for that account and model.
2. Coding, logic, and native tool call run only after PONG passes. A provider that cannot call tools records `skipped`, not `failed`, and the total score is not reduced.
3. Format and latency are recorded from the same calls. Format is `json` or `sse`. Latency stores time to first byte and total time separately from tokens per second.
4. HTTP 429 is `rate_limited`. It is retried once later and does not count as a liveness failure.

## History

Every attempt is stored with timestamp, provider, account, model, suite, HTTP status, latency, token count, tokens per second, response excerpt, and raw error. Daily model summaries are derived from those rows. Old rows are not overwritten.

## Reviewer

One reviewer runs once, after the job finishes. The operator picks the reviewer before the run. The reviewer may be a model or a combo such as `judge-router`. The reviewer writes a summary of stored results. It does not decide liveness, latency, or tool-call success. Each report is kept with the reviewer id and timestamp.

## Not in scope

Subjective writing or image quality. Mixing benchmark rows into `request_details`.
