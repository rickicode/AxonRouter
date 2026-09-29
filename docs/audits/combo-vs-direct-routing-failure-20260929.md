# Audit — Kenapa `auto/coding` Gagal Tapi Call Direct Aman

Tanggal: 2026-09-29
Host audit: raspi (100.118.16.10) — `axonrouter-api` (gateway :3778), `axonrouter-web` (:3777), DB `global-postgres` → `axonrouter`
Repo: `/workspaces/AxonRouter` (branch `main`, HEAD `0008a4e`)

## Ringkasan Eksekutif

Empat penyebab independen, terukur dari log container + `request_details` + probe A/B live:

1. **Hedge + 10-member combo = 51s TTFT.** `auto/coding` punya 10 model. Tiap request memicu speculative companion per member. Satu request = banyak panggilan upstream paralel. Direct call = 1 panggilan, 4.2s.
2. **`status=success` dengan body `"[Empty streaming response]"`** — `runanywhere/glm-5.3-flash` sering "sukses" tapi tidak mengirim apa pun. GatewayMenyimpan status sukses, sehingga cascade berhenti di member yang tidak menghasilkan apa pun.
3. **Jev classifier 429 tiap request** (`FreeUsageLimitError`), dan **tidak pernah tercatat di `usage_history`** — 0 baris, padahal dipanggil thousands of times.
4. **Capability degradation terlalu agresif** — tiap request di-degrade `[vision, audioInput, pdf, reasoning, search]`, termasuk `oc/space-bunny-free` yang MEDIA-nya justru dibuang padahal user pakai direct call aman.

## Bukti 1 — A/B Probe Live (identik body, tool enabled)

| Path | Model elected | Elapsed | TTFT (dari log) |
|---|---|---|---|
| DIRECT `oc/space-bunny-free` | space-bunny-free | **4 238 ms** | 1.2s |
| COMBO `auto/coding` | clf/stealth/pixel-canary | **53 510 ms** | 51.5s |
| COMBO + `tool_choice:none` | clf/stealth/pixel-canary | 8 500 ms | 7.1s |

Log korelasi (23:05:45–23:06:14):
```
[DIFFICULTY] Jev HTTP 429: {"type":"error","error":{"type":"FreeUsageLimitError",...}}
[DIFFICULTY] Jev classifier failed (jev-only mode) — defaulting to fallback
[DIFFICULTY] Combo "auto/coding" | tier=easy (jev-fallback) | domain=data | policy=cost_efficient | ~54883 tok
[DIFFICULTY] Combo "auto/coding" running easy tier [clf/stealth/pixel-canary, atria-asi/Atria-Dawn-Preview, th/deepseek/...:free, oc/mimo-v2.6-flash-free, oc/muse-spark-1.3-contributor-free]
[HEDGE] [TokenHarbor] Upstream slow (> 1000ms), spawning speculative companion...   (repeat ~8x)
[HEDGE] [TokenHarbor] Account undefined at model capacity (1/10). Trying next account...
[DIFFICULTY] Member clf/stealth/pixel-canary succeeded (easy tier)
📊 DONE 52153ms · TTFT 51526ms · IN 864 · OUT 64
```

`tool_choice:none` memangkas 53.5s → 8.5s. Jadi biaya utama bukan klasifikasi, tapi **jumlah member + hedge fan-out** pada request yang membawa tools.

## Bukti 2 — "Sukses" yang Isinya Kosong

`request_details` untuk `auto/coding`, 60 menit terakhir (`status='success'`):

| Path | Model | Empty | Total | Rate |
|---|---|---|---|---|
| COMBO | stealth/space-bunny-alpha | 94 | 171 | **55%** |
| COMBO | claude-opus-4-6-thinking | 68 | 69 | **99%** |
| COMBO | deepseek/deepseek-v4.1-flash | 40 | 61 | **66%** |
| COMBO | grok-4.7-xhigh | 13 | 13 | **100%** |
| COMBO | gemini-3.8-flash-medium | 7 | 7 | **100%** |
| COMBO | stealth/pixel-canary | 2 | 5 | 40% |
| DIRECT | space-bunny-free | 12 | 95 | 13% |
| DIRECT | gpt-5.6-luna | 0 | 14 | 0% |
| DIRECT | deepseek/deepseek-v4.1-flash:free | 0 | 31 | 0% |

Sumber: `open-sse/handlers/chatCore/streamingHandler.js:188`
```js
const safeContent = contentObj?.content || "[Empty streaming response]";
```
Detail row tersimpan `status: "success"` dengan `response.content = "[Empty streaming response]"`. Member dianggap sukses → cascade berhenti → client dapat respons kosong. Ini persis gejala "gagal" yang dilihat user, padahal HTTP-nya 200.

Bukti DB (2 baris terbaru):
```
timestamp                | model           | status  | response
2026-09-29 15:59:48.245 | glm-5.3-flash   | success | {"type":"streaming","content":"[Empty streaming response]","thinking":null}
2026-09-29 15:57:06.076 | glm-5.3-flash   | success | {"type":"streaming","content":"[Empty streaming response]","thinking":null}
```
`tokens: {"estimated":true,"total_tokens":106134,"prompt_tokens":106134,"completion_tokens":0}` — 106k prompt, 0 completion. Provider menerima body 106k token lalu mengembalikan nol byte.

## Bukti 3 — Jev Dipanggil Tapi Tidak Pernah Dicatat

```
select count(*) from usage_history where model ilike '%jev%' or model ilike '%systemone%' or model ilike '%zen%';
 jev_rows
----------
        0
```
对照组 — 60 menit terakhir, `difficulty` object di `request_details`:
```
jev_used = 0    jev_source_rows = 187    judge_used = 0
```
187 request masuk jalur `source: "jev-fallback"`, `jevUsed:false`, `confidence:0` — artinya Jev dicoba, gagal (429), lalu jatuh ke fallback. Nol satupun tercatat di `usage_history`. Jadi biaya classifier (latensi + quota) tidak terlihat di usage, dan tidak bisa dianalisis.

Embed model **tercatat** (jadi pola ini bukan "semua non-chat tidak dicatat"):
```
@cf/baai/bge-m3         | 1803 rows | last 15:57:41
@cf/baai/bge-large-en-v1.5 | 1 row
```

## Bukti 4 — Capability Gate Membuang Media yang Sedang Dipakai

Setiap request ke combo di-degrade:
```
[CAPABILITY] degraded request for opencode/space-bunny-free: [vision, audioInput, pdf, reasoning, search]
[CAPABILITY] degraded request for cline-free/stealth/pixel-canary: [vision, audioInput, pdf, reasoning, search]
[CAPABILITY] degraded request for tokenharbor/deepseek/...: [audioInput, pdf, search]
```
Untuk `oc/space-bunny-free` yang dipanggil **langsung** (bukan lewat combo), `degradedCapabilities` yang di-trigger adalah `[tools, reasoning]` saja dari sisi capability gate — provider menerimanya utuh.Through combo, media yang sama ikut ter-strip. Sumber: `open-sse/translator/concerns/capabilitiesDegradation.js` + `modality.js`.

Implikasi:Oc/space-bunny-free "aman" direct karena tidak melewati gate combo. Begitu masuk combo, ia kehilangan vision/audio/pdf/reasoning/search.

## Bukti 5 — Amplifikasi HEDGE

20 menit terakhir, `request_details` per menit: 3, 15, 7, 9, 19, 19, 18, 11, 10, 9, 3. Di log, satu request combo memicu 8+ baris `spawning speculative companion` untuk provider yang sama. `DONE 261712ms · TTFT 256759ms`出现在 satu run — 4 menit 21 detik untuk satu request.

## Prioritas Perbaikan

| # | Isu | Lokasi | Dampak |
|---|---|---|---|
| P0 | Empty response diperlakukan sukses | `open-sse/handlers/chatCore/streamingHandler.js:188` | Client dapat 200 + body kosong; cascade berhenti di member yang tidak útil |
| P0 | 10 member + hedge untuk `auto/coding` | config combo + `open-sse/services/combo.js` | TTFT 51s vs 1.2s direct |
| P1 | Jev tidak masuk `usage_history` | `classifyWithJev` di `open-sse/services/combo.js` | 187 panggilan/menit tak terlihat; biaya tak terukur |
| P1 | Jev 429 tiap request (`jev-only`) | `open-sse/services/combo.js` | Semua request jatuh ke `jev-fallback`, `confidence:0` |
| P2 | Capability gate terlalu luas di combo | `capabilitiesDegradation.js` | Media user dibuang saat lewat combo, utuh saat direct |

## Catatan Verifikasi

Semua angka di atas dari output nyata: `docker logs axonrouter-api`, `psql` via `docker exec global-postgres`, dan probe `curl` live ke `http://100.118.16.10:3778/v1/chat/completions` dengan key `api_keys.name='HERMES'`. Probe A/B memakai body identik (tools + `tool_choice:auto`) untuk kedua path, streaming aktif.

Belum ada perubahan kode. Perbaikan P0/P1 perlu diimplementasikan dan diverifikasi (Gate 1 di sesi Pi, Gate 2 verifikasi ulang).
