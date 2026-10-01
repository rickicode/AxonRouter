# Technical Audit & Architecture Blueprint: Kilo Code Free (`kilocode-free`) Provider in AxonRouter and Porting to Go Rotator

**Date:** 2026-10-01  
**Author:** Technical Architecture & Security Audit  
**Target Repository:** AxonRouter (`/workspaces/AxonRouter`) & Go Rotator (`/workspaces/petanian/api-rotator`)  
**Commit Reference:** `7696ddf` (`main`)  
**Document Status:** Complete Technical Specification & Implementation Blueprint  

---

## 1. Executive Summary

Kilo Code Free (`kilocode-free`, alias `kcf`) provides unauthenticated access to high-capability AI models (e.g. `kilo-auto/free`, `nemotron-3-ultra-550b:free`, `laguna-s-2.1:free`) hosted on Kilo AI Gateway (`https://api.kilo.ai/api/gateway`). It requires zero credentials (`noAuth: true`) but strictly enforces a quota of 200 requests/hour per egress IP. Sending virtual tokens (`Bearer public`) triggers immediate `401 INVALID_TOKEN`. AxonRouter successfully isolates rate limits via `poolScoped` proxy rotation and strict `failClosedProxy` guards. This document audits AxonRouter's implementation and provides a complete, drop-in technical blueprint (`kilocode.go`) for `/workspaces/petanian/api-rotator`.

---

## 2. Findings & Architectural Analysis

### [HIGH] `stream_options` Not Stripped on Non-Streaming Requests
- **File & Line:** `open-sse/executors/kilocode-free.js:44-51`
- **Observed Behavior:**
  ```javascript
  transformRequest(model, body, stream) {
    const out = { ...body };
    if (stream && !out.stream_options) {
      out.stream_options = { include_usage: true };
    }
    return out;
  }
  ```
  When a client sends `stream: false` but includes `stream_options` in the JSON payload (e.g., standard OpenAI SDK clients or prompt inspectors), `KiloCodeFreeExecutor` passes `stream_options` unmodified to Kilo Gateway.
- **Expected Behavior:**
  When `stream === false`, `stream_options` must be purged (`delete out.stream_options`). Certain upstream providers (like DeepSeek, OpenAI-strict endpoints, or internal proxies) reject requests with HTTP 400 Bad Request if `stream_options` is present when `stream` is false or omitted.
- **Root Cause:**
  `transformRequest` only conditionally adds `stream_options` when `stream === true`, but lacks a deletion branch for `!stream`.
- **Remediation Snippet:**
  ```javascript
  transformRequest(model, body, stream) {
    const out = { ...body };
    if (stream) {
      if (!out.stream_options) {
        out.stream_options = { include_usage: true };
      }
    } else {
      delete out.stream_options;
    }
    return out;
  }
  ```

---

### [MEDIUM] Static Model Catalog Stale Compared to Live Kilo AI Gateway
- **File & Line:** `open-sse/providers/registry/kilocode-free.js:28-50`
- **Observed Behavior:**
  The static registry lists several retired or unlisted models:
  - `nex-agi/nex-n2.5-pro:free` (404/retired upstream)
  - `nex-agi/nex-n2.5-mini:free` (404/retired upstream)
  - `inclusionai/ling-3.0-flash-vl:free` (retired upstream)
  - `inclusionai/ling-3.0-flash-fin:free` (retired upstream)
  - `z-ai/glm-5.2:free` (retired upstream)
  Furthermore, newly added models in the live catalog are missing from the static fallback list:
  - `stealth/space-bunny-alpha` (Free preview, 1M context)
  - `nvidia/nemotron-3-super-120b-a12b:free`
  In addition, `kilo-auto/free` top provider `max_completion_tokens` is 32,768 in the live API, but listed as 10,000 in the static registry.
- **Expected Behavior:**
  Static models list should mirror the current active free catalog on `https://api.kilo.ai/api/gateway/models`.
- **Root Cause:**
  Upstream Kilo Gateway rotates free models dynamically without webhook notifications. While dynamic discovery via `modelsFetcher` works (`src/app/api/providers/suggested-models/filters.js:51`), static registry entries remain frozen at registration time.
- **Remediation Snippet:**
  Update `open-sse/providers/registry/kilocode-free.js:28-50` with the verified active free model list (see Section 4).

---

### [MEDIUM] Egress Proxy Pool Rotation Ignores Upstream `resetsAtMs` / `Retry-After` Header
- **File & Line:** `open-sse/executors/kilocode-free.js:68-75`
- **Observed Behavior:**
  ```javascript
  if (isIpLimit(status, text)) {
    return {
      status,
      message: text.slice(0, 300) || `Kilo Gateway free IP rate limit (${status})`,
      poolScoped: { reason: "ip-limit" },
    };
  }
  ```
  When Kilo Gateway responds with 429 Too Many Requests, `parseError` flags `poolScoped: { reason: "ip-limit" }` but does not pass an explicit `resetsAtMs` or `retryAfterMs` to `markPoolUnfit`.
- **Expected Behavior:**
  `markPoolUnfit` in `open-sse/services/proxyPoolFitness.js` accepts `(poolId, scope, untilMs, reason)`. When `untilMs` is omitted, it defaults to a generic cooldown (e.g. 60 seconds). Because Kilo Gateway enforces an hourly window (200 req/hr), an IP marked unfit for only 60 seconds will re-enter the eligible pool prematurely and fail again.
- **Root Cause:**
  `parseError` does not parse the `Retry-After` header or calculate the 1-hour window expiry.
- **Remediation Snippet:**
  ```javascript
  if (isIpLimit(status, text)) {
    const retryAfterHeader = response?.headers?.get?.("retry-after");
    const retrySec = Number(retryAfterHeader);
    const cooldownMs = Number.isFinite(retrySec) && retrySec > 0
      ? retrySec * 1000
      : 3600 * 1000; // 1 hour default for 200 req/hr IP limit
    return {
      status,
      message: text.slice(0, 300) || `Kilo Gateway free IP rate limit (${status})`,
      resetsAtMs: Date.now() + cooldownMs,
      poolScoped: { reason: "ip-limit", untilMs: Date.now() + cooldownMs },
    };
  }
  ```

---

### [LOW] Virtual Token `Bearer public` Forwarding Risk on Empty Credentials
- **File & Line:** `open-sse/executors/kilocode-free.js:37-39`
- **Observed Behavior:**
  ```javascript
  if (credentials?.apiKey && credentials.apiKey !== "public") {
    headers["Authorization"] = `Bearer ${credentials.apiKey}`;
  }
  ```
  If `credentials.apiKey` is passed as `"Bearer public"` or `"token:public"` or empty string `""`, it might evade the `!== "public"` check and construct an invalid `Authorization: Bearer Bearer public` header.
- **Expected Behavior:**
  All variations of public/empty tokens must be stripped; only non-empty, genuine user API keys should be sent.
- **Root Cause:**
  Direct string inequality check without normalization (`trim()` or lower-casing).
- **Remediation Snippet:**
  ```javascript
  const key = String(credentials?.apiKey || "").trim();
  if (key && key.toLowerCase() !== "public" && key.toLowerCase() !== "none") {
    headers["Authorization"] = key.startsWith("Bearer ") ? key : `Bearer ${key}`;
  }
  ```

---

## 3. Upstream Protocol & Wire Specifications

### 3.1 Base Endpoints
- **Chat Completions:** `POST https://api.kilo.ai/api/gateway/chat/completions`
- **Model Discovery:** `GET https://api.kilo.ai/api/gateway/models`
- **Provider Website:** `https://kilo.ai`

### 3.2 Authentication Behavior (`noAuth: true`)
Kilo Gateway's `/api/gateway` endpoints are designed for public, keyless consumption of designated `:free` models.
1. **No Authorization Header (Direct/Clean):**
   - Returns `HTTP/2 200 OK`.
2. **With `Authorization: Bearer public`:**
   - Returns `HTTP/2 401 Unauthorized`:
     ```json
     {
       "error": {
         "code": "INVALID_TOKEN",
         "message": "Your authentication token is invalid. Please sign in again."
       },
       "error_type": "authentication_required"
     }
     ```
3. **With Paid Model Requested Without Key:**
   - Returns `HTTP/2 401 Unauthorized`:
     ```json
     {
       "error": {
         "code": "PAID_MODEL_AUTH_REQUIRED",
         "message": "You need to sign in to use this model."
       },
       "error_type": "paid_model_auth_required"
     }
     ```

**Strict Rule:** When proxying requests to Kilo Code Free, the rotator **MUST completely strip the `Authorization` header** unless a valid private user token is explicitly supplied by the caller (BYOK mode).

### 3.3 Request Headers
| Header | Value | Condition |
|---|---|---|
| `Content-Type` | `application/json` | Mandatory |
| `Accept` | `text/event-stream` | Required for streaming |
| `Accept` | `application/json` | Non-streaming calls |
| `Authorization` | *Omitted* | Keyless requests (never send `Bearer public`) |
| `User-Agent` | Custom or generic HTTP client | Optional, no fingerprint restrictions |

### 3.4 Request Payload
Kilo Gateway natively accepts the standard OpenAI Chat Completions JSON schema:
```json
{
  "model": "kilo-auto/free",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true,
  "stream_options": { "include_usage": true },
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### 3.5 Native Streaming vs Non-Streaming
- **Streaming (`stream: true`):**
  Emits standard Server-Sent Events (SSE). Each chunk follows `data: {"id": "gen-...", "object": "chat.completion.chunk", ...}`.
  Usage chunk is emitted at the end when `stream_options.include_usage: true`.
  Stream terminates with `data: [DONE]`.
- **Non-Streaming (`stream: false`):**
  Unlike OpenCode (which only supports SSE and requires server-side aggregation), Kilo Gateway **natively supports non-streaming responses** and returns standard `chat.completion` JSON immediately with `HTTP 200`.

### 3.6 Reasoning Content Format
Reasoning models on Kilo Gateway (e.g. `dots-studio/dots-3-note-preview:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, `thinkingmachines/inkling-small:free`) emit thinking tokens in two places:
1. `delta.reasoning` (raw text delta)
2. `delta.reasoning_details`:
   ```json
   "reasoning_details": [
     {
       "type": "reasoning.text",
       "text": "...",
       "format": "unknown",
       "index": 0
     }
   ]
   ```
In non-streaming responses:
`message.reasoning` and `message.reasoning_details` are populated alongside `message.content`.

---

## 4. Live Model Catalog & Taxonomy (Verified 2026-10-01)

Live query to `https://api.kilo.ai/api/gateway/models` reveals 17 active free models:

| Model ID | Model Name | Context Window | Max Completion | Multimodal (Vision) | Reasoning |
|---|---|---|---|:---:|:---:|
| `kilo-auto/free` | Auto Free (Rotates available free models) | 256,000 | 32,768 | No | Yes |
| `stealth/space-bunny-alpha` | Space Bunny Alpha (retires Oct 5) | 1,000,000 | 524,288 | Yes | Yes |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | NVIDIA: Nemotron 3 Ultra | 1,000,000 | 65,536 | No | Yes |
| `nvidia/nemotron-3.5-lightning:free` | NVIDIA: Nemotron 3.5 Lightning | 1,000,000 | 65,536 | No | Yes |
| `thinkingmachines/inkling-small:free` | Thinking Machines: Inkling Small | 1,048,576 | 262,144 | Yes | Yes |
| `dots-studio/dots-3-note-preview:free` | Dots Studio: Dots3-Note Preview | 512,000 | 460,800 | Yes | Yes |
| `stepfun/step-3.7-flash:free` | StepFun: Step 3.7 Flash | 262,144 | 262,144 | Yes | Yes |
| `qwen/qwen3.8-27b:free` | Qwen: Qwen3.8 27B | 262,144 | 235,929 | Yes | Yes |
| `nvidia/nemotron-3-super-120b-a12b:free` | NVIDIA: Nemotron 3 Super | 262,144 | 235,929 | No | Yes |
| `poolside/laguna-s-2.1:free` | Poolside: Laguna S 2.1 | 262,144 | 32,768 | No | Yes |
| `poolside/laguna-xs-2.1:free` | Poolside: Laguna XS 2.1 | 262,144 | 32,768 | No | Yes |
| `inclusionai/ling-3.0-flash-sante:free` | inclusionAI: Ling 3.0 Flash Santé | 262,144 | 32,768 | No | Yes |
| `cohere/north-mini-code:free` | Cohere: North Mini Code | 256,000 | 64,000 | No | Yes |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | NVIDIA: Nemotron 3 Nano Omni | 256,000 | 65,536 | Yes | Yes |
| `openrouter/free` | OpenRouter Free Models Router | 200,000 | Dynamic | Yes | Yes |
| `nvidia/nemotron-3.5-content-safety:free` | NVIDIA: Nemotron 3.5 Content Safety | 128,000 | 8,192 | Yes | Yes |
| `liquid/lfm-2.5-2.6b:free` | LiquidAI: LFM2.5-2.6B | 65,536 | 8,192 | No | Yes |

### 4.1 Model Routing & Prefix Stripping Rules
1. **Supported Prefixes:**
   - `kcf/` (primary short alias, e.g. `kcf/kilo-auto/free`, `kcf/nvidia/nemotron-3-ultra-550b-a55b:free`)
   - `kilocode/` (e.g. `kilocode/kilo-auto/free`)
   - `kilo-free/` (e.g. `kilo-free/dots-studio/dots-3-note-preview:free`)
   - `kf/` (e.g. `kf/qwen/qwen3.8-27b:free`)
2. **Prefix Stripping:**
   When routing to Kilo Gateway, strip the matching prefix so the `model` parameter sent to upstream matches the exact upstream catalog ID (e.g. `kcf/kilo-auto/free` becomes `kilo-auto/free`).
3. **Standalone Known Models:**
   Any request targeting `kilo-auto/free`, `stealth/space-bunny-alpha`, or any model string containing `laguna-`, `nemotron-`, or `dots-3` with a `:free` suffix can be automatically routed to Kilo Code Free if no prefix is supplied.

---

## 5. Rate Limits, Quota Enforcement & Proxy Pool Integration

### 5.1 Quota Structure
- **Threshold:** 200 requests per hour per egress IP.
- **Authentication:** Unauthenticated (IP is the identity).
- **Scope:** Cross-account IP pool limit.

### 5.2 Error Signatures
When an egress IP hits the rate limit, Kilo Gateway returns:
- **HTTP Status:** `429 Too Many Requests`
- **Error Bodies:**
  - `{"error":{"message":"Rate limit exceeded. 200 requests per hour per IP.","code":429}}`
  - `{"error":{"message":"model is temporarily rate-limited upstream","metadata":{"limit_source":"upstream_provider_shared_pool"}}}`
  - `"temporarily rate-limited"`

### 5.3 Proxy Pool Strategy in Go Rotator
In `/workspaces/petanian/api-rotator`, `ProxyPool` (`proxy.go`) supports both Subscription mode (`PROXY_SUBSCRIPTION_URL` / `PROXY_FILE`) and Bright Data Session mode.
To maintain high availability and prevent IP exhaustion:
1. **Atomic Lease:** Every outbound request to Kilo Gateway leases a proxy via `h.pool.Lease()`.
2. **Round-Robin Egress:** Successive requests originate from different IP addresses, effectively multiplying the hourly quota by `N` (where `N` is the number of proxies in the pool).
3. **429 Handling & Cooldown:** When Kilo Gateway responds with 429 or any IP-limit signature:
   - Call `h.pool.MarkProxyFailed(sid)`.
   - Log `[kilocode] proxy %s hit 429 rate limit, rotating...`.
   - Retry immediately with the next leased proxy up to `MaxRetries`.
4. **Fail-Closed Guard:** If proxying is enabled, never fall back to direct connection on proxy error, as doing so burns the main server IP.

---

## 6. Go Rotator Technical Porting Blueprint

This section provides the complete implementation specification to add Kilo Code Free into `/workspaces/petanian/api-rotator`.

### 6.1 Architecture Overview
```
Incoming Client Request (/v1/chat/completions)
                     │
                     ▼
         ┌────────────────────────┐
         │     ServeHTTP Mux      │
         └────────────────────────┘
                     │
         isKiloCodeModel(origModel)?
         ├── YES ─────────────────────────────┐
         └── NO                               │
              │                               ▼
    TokenHarbor Key Rotation       ┌────────────────────────┐
              │                    │   executeKiloCode()    │
     (Primary Exhausted?)          └────────────────────────┘
              │                               │
    Combo / Ultimate Fallback                 ▼
              │                    Lease Proxy (p.Lease())
              ▼                               │
    Route to KiloCode Fallback ───────────────┘
                                              │
                                              ▼
                             Strip "Authorization" header
                             Inject stream_options.include_usage
                                              │
                                              ▼
                             POST api.kilo.ai/api/gateway
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
                   200 OK (Stream/SSE)                       429 Rate Limit
                         │                                         │
             Forward chunks / Flush                    MarkProxyFailed(sid)
                         │                                    Retry Next
                   Client Return
```

---

### 6.2 New File: `kilocode.go`
Create `/workspaces/petanian/api-rotator/kilocode.go`:

```go
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Constants for Kilo Code Free provider.
const (
	DefaultKiloCodeUpstream = "https://api.kilo.ai/api/gateway"
	KiloCodeUserAgent       = "AxonRouter-Go/1.0"
)

var (
	kiloCodeIpLimitRe = regexp.MustCompile(`(?i)(rate[_\s-]?limit|too\s+many\s+requests|temporarily\s+rate-limited|200\s+requests\s+per\s+hour|upstream_provider_shared_pool|PAID_MODEL_AUTH_REQUIRED)`)
)

// List of verified free models exposed in GET /v1/models (with kcf/ prefix).
var kiloCodeFreeModels = []string{
	"kilo-auto/free",
	"stealth/space-bunny-alpha",
	"poolside/laguna-s-2.1:free",
	"nvidia/nemotron-3-ultra-550b-a55b:free",
	"dots-studio/dots-3-note-preview:free",
	"inclusionai/ling-3.0-flash-sante:free",
	"qwen/qwen3.8-27b:free",
	"liquid/lfm-2.5-2.6b:free",
	"nvidia/nemotron-3.5-lightning:free",
	"thinkingmachines/inkling-small:free",
	"poolside/laguna-xs-2.1:free",
	"cohere/north-mini-code:free",
	"nvidia/nemotron-3.5-content-safety:free",
	"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
	"nvidia/nemotron-3-super-120b-a12b:free",
	"openrouter/free",
	"stepfun/step-3.7-flash:free",
}

// Known standalone models routing directly to Kilo Code Free even without prefix.
var knownStandaloneKiloCodeModels = map[string]bool{
	"kilo-auto/free":                                    true,
	"stealth/space-bunny-alpha":                         true,
	"poolside/laguna-s-2.1:free":                        true,
	"poolside/laguna-xs-2.1:free":                       true,
	"nvidia/nemotron-3-ultra-550b-a55b:free":            true,
	"nvidia/nemotron-3.5-lightning:free":                true,
	"nvidia/nemotron-3-super-120b-a12b:free":            true,
	"nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": true,
	"nvidia/nemotron-3.5-content-safety:free":           true,
	"dots-studio/dots-3-note-preview:free":              true,
	"inclusionai/ling-3.0-flash-sante:free":             true,
	"qwen/qwen3.8-27b:free":                             true,
	"liquid/lfm-2.5-2.6b:free":                          true,
	"thinkingmachines/inkling-small:free":               true,
	"cohere/north-mini-code:free":                       true,
	"stepfun/step-3.7-flash:free":                       true,
}

// isKiloCodeModel checks if the model name targets Kilo Code Free.
func isKiloCodeModel(model string) bool {
	clean := strings.ToLower(strings.TrimSpace(model))
	if strings.HasPrefix(clean, "kcf/") ||
		strings.HasPrefix(clean, "kilocode/") ||
		strings.HasPrefix(clean, "kilo-free/") ||
		strings.HasPrefix(clean, "kf/") {
		return true
	}
	if knownStandaloneKiloCodeModels[clean] {
		return true
	}
	return false
}

// cleanKiloCodeModel removes prefixes (kcf/, kilocode/, kilo-free/, kf/).
func cleanKiloCodeModel(model string) string {
	clean := strings.TrimSpace(model)
	lower := strings.ToLower(clean)
	if strings.HasPrefix(lower, "kcf/") {
		return clean[len("kcf/"):]
	}
	if strings.HasPrefix(lower, "kilocode/") {
		return clean[len("kilocode/"):]
	}
	if strings.HasPrefix(lower, "kilo-free/") {
		return clean[len("kilo-free/"):]
	}
	if strings.HasPrefix(lower, "kf/") {
		return clean[len("kf/"):]
	}
	return clean
}

// buildKiloCodeHeaders constructs headers strictly omitting any Authorization token.
func (h *Handler) buildKiloCodeHeaders(r *http.Request, stream bool) http.Header {
	hdr := make(http.Header)
	hdr.Set("Content-Type", "application/json")
	if stream {
		hdr.Set("Accept", "text/event-stream")
	} else {
		hdr.Set("Accept", "application/json")
	}

	ua := r.Header.Get("User-Agent")
	if ua != "" {
		hdr.Set("User-Agent", ua)
	} else {
		hdr.Set("User-Agent", KiloCodeUserAgent)
	}

	// Strictly NO Authorization header for keyless free tier
	// (Unless caller supplied a BYOK custom key that isn't public)
	clientAuth := strings.TrimSpace(r.Header.Get("Authorization"))
	if clientAuth != "" && !strings.EqualFold(clientAuth, "Bearer public") && !strings.EqualFold(clientAuth, "Bearer none") {
		// Opt-in BYOK support
		hdr.Set("Authorization", clientAuth)
	}

	return hdr
}

// prepareKiloCodePayload sanitizes payload and injects stream_options for streaming.
func prepareKiloCodePayload(origPayload []byte, cleanModel string, stream bool) ([]byte, error) {
	var body map[string]any
	if err := json.Unmarshal(origPayload, &body); err != nil {
		return origPayload, err
	}

	body["model"] = cleanModel
	body["stream"] = stream

	if stream {
		if _, exists := body["stream_options"]; !exists {
			body["stream_options"] = map[string]any{"include_usage": true}
		}
	} else {
		delete(body, "stream_options")
	}

	return json.Marshal(body)
}

// runKiloCodeAttempt performs one HTTP request through the leased proxy.
func (h *Handler) runKiloCodeAttempt(ctx context.Context, w http.ResponseWriter, method, cleanModel string, origPayload []byte, clientStream bool, r *http.Request) attempt {
	start := time.Now()
	sid, cc, client := h.pool.Lease()
	proxyStr := "direct"
	if sid != "direct" {
		if cc != "" {
			proxyStr = fmt.Sprintf("%s(%s)", sid, cc)
		} else {
			proxyStr = sid
		}
	}
	h.log.Printf("[kilocode] %s /chat/completions -> model:%s [proxy:%s(%s)]", method, cleanModel, sid, cc)

	upstreamBase := h.cfg.KiloCodeUpstream
	if upstreamBase == "" {
		upstreamBase = DefaultKiloCodeUpstream
	}
	endpoint := upstreamBase + "/chat/completions"

	payload, err := prepareKiloCodePayload(origPayload, cleanModel, clientStream)
	if err != nil {
		h.log.Detailf("[kilocode] payload preparation failed: %v", err)
		return attempt{ok: false, err: err, key: "kilocode:public", proxy: proxyStr, duration: time.Since(start)}
	}

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(payload))
	if err != nil {
		h.log.Detailf("[kilocode] request build failed: %v", err)
		return attempt{ok: false, err: err, key: "kilocode:public", proxy: proxyStr, duration: time.Since(start)}
	}

	req.Header = h.buildKiloCodeHeaders(r, clientStream)
	req.ContentLength = int64(len(payload))

	resp, err := client.Do(req)
	if err != nil {
		h.log.Detailf("[kilocode] request failed on proxy %s: %v", proxyStr, err)
		if sid != "direct" {
			h.pool.MarkProxyFailed(sid)
		}
		return attempt{ok: false, err: err, key: "kilocode:public", proxy: proxyStr, duration: time.Since(start)}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		h.log.Detailf("[kilocode] upstream returned %d: %s", resp.StatusCode, string(body))
		if resp.StatusCode == 429 || kiloCodeIpLimitRe.Match(body) {
			if sid != "direct" {
				h.pool.MarkProxyFailed(sid)
			}
		}
		return attempt{
			ok:       false,
			status:   resp.StatusCode,
			body:     body,
			hasBody:  true,
			key:      "kilocode:public",
			proxy:    proxyStr,
			duration: time.Since(start),
		}
	}

	// 1. Streaming response:
	if clientStream {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Accel-Buffering", "no")
		for k, v := range resp.Header {
			if strings.HasPrefix(strings.ToLower(k), "x-") {
				for _, val := range v {
					w.Header().Add(k, val)
				}
			}
		}
		w.WriteHeader(http.StatusOK)

		var flusher http.Flusher
		if f, ok := w.(http.Flusher); ok {
			flusher = f
		}
		fw := &flushWriter{w: w, flusher: flusher}
		_, _ = io.Copy(fw, resp.Body)
		return attempt{ok: true, status: http.StatusOK, written: true, key: "kilocode:public", proxy: proxyStr, duration: time.Since(start)}
	}

	// 2. Non-streaming response:
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		h.log.Detailf("[kilocode] reading response body failed: %v", err)
		return attempt{ok: false, err: err, key: "kilocode:public", proxy: proxyStr, duration: time.Since(start)}
	}

	return attempt{
		ok:          true,
		status:      http.StatusOK,
		body:        body,
		contentType: "application/json",
		hasBody:     true,
		written:     false,
		key:         "kilocode:public",
		proxy:       proxyStr,
		duration:    time.Since(start),
	}
}

// executeKiloCode runs attempts with model fallback and proxy retries.
func (h *Handler) executeKiloCode(ctx context.Context, w http.ResponseWriter, r *http.Request, requestedModel string, payload []byte, clientStream bool, fallbacks []string) (winner *attempt, lastErr *attempt, retries int) {
	cleanModel := cleanKiloCodeModel(requestedModel)
	maxAttempts := 3
	if h.cfg.MaxRetries > 0 && h.cfg.MaxRetries < maxAttempts {
		maxAttempts = h.cfg.MaxRetries
	}

	modelsToTry := append([]string{cleanModel}, fallbacks...)
	for _, m := range modelsToTry {
		cm := cleanKiloCodeModel(m)
		for i := 0; i < maxAttempts; i++ {
			res := h.runKiloCodeAttempt(ctx, w, r.Method, cm, payload, clientStream, r)
			if res.written {
				if res.ok {
					winner = &res
				} else {
					lastErr = &res
				}
				return
			}
			if res.ok {
				winner = &res
				return
			}
			lastErr = &res
			retries++
		}
	}
	return
}
```

---

### 6.3 Integration into `config.go`
Add `KiloCodeUpstream` to `Config`:

```go
type Config struct {
	// ... existing fields ...
	KiloCodeUpstream string
}
```

In `LoadConfig`:
```go
cfg.KiloCodeUpstream = strings.TrimRight(str(getenv, "KILOCODE_UPSTREAM_URL", DefaultKiloCodeUpstream), "/")
if u := str(getenv, "KILOCODE_BASE_URL", ""); u != "" {
	cfg.KiloCodeUpstream = strings.TrimRight(u, "/")
}
```

---

### 6.4 Integration into `models.go`
1. Update `isFreeModel`:
```go
func isFreeModel(model string) bool {
	// ... existing checks ...
	if isKiloCodeModel(model) {
		return true
	}
	return false
}
```

2. Register model aliases (optional shortcut for users):
```go
modelAliases["kilo"] = "kilo-auto/free"
modelAliases["kcf"] = "kilo-auto/free"
```

---

### 6.5 Integration into `handler.go`
1. **Routing in `ServeHTTP` (`handler.go:365`):**
```go
if isKiloCodeModel(origModel) {
	h.log.Detailf("[route] routing KiloCode model '%s' directly to KiloCode upstream", origModel)
	winner, lastErr, retries = h.executeKiloCode(ctx, w, r, origModel, payload, clientStream, comboFallbacks)
} else if isOpenCodeModel(origModel) {
	h.log.Detailf("[route] routing OpenCode model '%s' directly to OpenCode upstream", origModel)
	winner, lastErr, retries = h.executeOpenCode(ctx, w, r, origModel, payload, clientStream, comboFallbacks)
} else {
	// TokenHarbor execution loop...
}
```

2. **Fallback Chain (`handler.go:424`):**
```go
for _, fbModel := range fallbacksToTry {
	h.log.Detailf("[fallback] primary model '%s' exhausted, trying '%s'...", origModel, fbModel)
	if isKiloCodeModel(fbModel) {
		kcWinner, kcLastErr, kcRetries := h.executeKiloCode(ctx, w, r, fbModel, payload, clientStream, nil)
		retries += kcRetries
		if kcWinner != nil {
			winner = kcWinner
			break
		}
		lastErr = kcLastErr
		continue
	}
	if isOpenCodeModel(fbModel) {
		// ...
	}
}
```

3. **Ultimate Fallback (`handler.go:465`):**
If TokenHarbor keys are completely exhausted, fall back to Kilo Code `kilo-auto/free` before or alongside OpenCode:
```go
if winner == nil && (lastErr == nil || !lastErr.written) && isChat && isFreeModel(origModel) {
	fallbackModel := "kilo-auto/free"
	h.log.Detailf("[fallback] TokenHarbor keys exhausted, attempting KiloCode ultimate fallback with %s...", fallbackModel)
	fbPayload, err := withModel(payload, fallbackModel)
	if err == nil {
		kcWinner, kcLastErr, kcRetries := h.executeKiloCode(ctx, w, r, fallbackModel, fbPayload, clientStream, nil)
		retries += kcRetries
		if kcWinner != nil {
			winner = kcWinner
		} else if kcLastErr != nil {
			lastErr = kcLastErr
		}
	}
}
```

4. **Model Discovery (`/v1/models` in `handler.go:875 & 912`):**
```go
var kiloCodeEntries []any
for _, m := range kiloCodeFreeModels {
	kiloCodeEntries = append(kiloCodeEntries, map[string]any{
		"id":          "kcf/" + m,
		"object":      "model",
		"created":     1700000000,
		"owned_by":    "kilocode",
		"description": "Kilo Code Free " + m,
	})
}
allData = append(allData, kiloCodeEntries...)
```

---

## 7. Prioritized Action List

1. **Deploy `kilocode.go` in `/workspaces/petanian/api-rotator` (P0 - Immediate)**
   - Wire `isKiloCodeModel` in `handler.go` and add the 17 verified free models to `kiloCodeFreeModels`.
   - Provide an instant alternative keyless route when OpenCode or TokenHarbor encounter upstream downtime.
2. **Fix `stream_options` Cleanup in `KiloCodeFreeExecutor` (P1 - High)**
   - Update `open-sse/executors/kilocode-free.js:44` in AxonRouter to delete `stream_options` when `stream === false`.
3. **Propagate Precise Hourly Cooldown in AxonRouter (P2 - Medium)**
   - Update `KiloCodeFreeExecutor.parseError` to return a 1-hour `untilMs` on 429 errors so marked proxy pools are not reused before Kilo's hourly quota resets.
4. **Synchronize Static Registry in AxonRouter (P3 - Low)**
   - Update `open-sse/providers/registry/kilocode-free.js` to match the 17 active models and remove deprecated `nex-agi/*` models.

---

## 8. Verification & Unverifiable Items

### Verified in this Audit Session:
1. Live network probes to `https://api.kilo.ai/api/gateway/chat/completions`:
   - Clean request (no auth): HTTP 200 OK (verified with `kilo-auto/free` and `dots-studio/dots-3-note-preview:free`).
   - Request with `Authorization: Bearer public`: HTTP 401 `INVALID_TOKEN` (rejection confirmed).
   - Request with paid model: HTTP 401 `PAID_MODEL_AUTH_REQUIRED` (rejection confirmed).
   - Streaming SSE format, reasoning format, and `[DONE]` termination verified.
2. Live model catalog on `https://api.kilo.ai/api/gateway/models`: 17 active free models cataloged.
3. AxonRouter test suites:
   - `tests/unit/kilocode-free.test.js` (12 tests passed).
   - `tests/unit/kilocode-free-proxy-fitness.test.js` (2 tests passed).
   - Vite production build (`npm run build`) succeeded in 9.48s.
   - Codebase graph (`graft build`) generated with 6,460 nodes and 17,026 edges.

### Unverifiable Items (Must NOT Guess):
1. **Upstream Daily Per-Model Caps:** Kilo Gateway does not disclose undocumented per-model limits (e.g., whether specific models like `nemotron-3-ultra-550b:free` have hidden concurrency gates beyond the 200 req/hr IP limit). This can only be observed under sustained production load.
2. **Retirement Schedule:** Model `stealth/space-bunny-alpha` indicates retirement on October 5; exact decommission hour depends entirely on Kilo Gateway operators.
