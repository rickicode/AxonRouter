# Upstream Tracking & Lineage: Decolua vs MIBP vs AxonRouter

Dokumen ini adalah **Single Source of Truth (SSOT)** status sinkronisasi, perbedaan lineage, dan riwayat porting dari dua hulu upstream:
1. **`decolua/9router`** (Official Upstream — repository publik)
2. **`9router-mibp-version`** (Custom Fork MIBP — repo internal `mhiqrambg/9router-mibp-version`)

Setiap agen AI atau developer yang memeriksa status upstream **wajib membaca file ini terlebih dahulu** untuk mengetahui baseline sistem terakhir yang telah di-porting ke AxonRouter.

---

## 1. Matriks Perbandingan Tiga Sistem

| Parameter | Official (`decolua/9router`) | Fork MIBP (`9router-mibp-version`) | AxonRouter (Enterprise) |
|---|---|---|---|
| **Repository** | `https://github.com/decolua/9router` | `https://github.com/mhiqrambg/9router-mibp-version` | `https://github.com/rickicode/AxonRouter` |
| **Target Lingkungan** | Single-user local desktop dev | Community/team local tool | Enterprise high-concurrency production gateway |
| **Storage Engine** | Embedded SQLite (`data.sqlite`) | Embedded SQLite (`data.sqlite`) | **Pure PostgreSQL 17 SSOT** (monthly range partitioned) |
| **Frontend/Server** | Next.js fullstack (hybrid) | Next.js fullstack (hybrid) | **Vite 7 SPA + Hono API Gateway Cluster** |
| **MITM Engine** | Tidak ada | Ada (`mitm-root-ca`, certs injection) | **Ditolak oleh policy** (keamanan & arsitektur clean) |
| **Baseline Tag/Commit** | **`v0.5.95` (`a99cf57`)** | **`67c9c5bc`** (base `v0.5.86` + patch MIBP) | **`v0.1.5`** (Commit `8cc8a6c`) |
| **Tanggal Baseline** | 2026-10-01 | 2026-09-25 | 2026-10-02 (sync) / 2026-10-04 (active) |
| **Status Parity** | **100% Up-to-date** dengan `master` | **Fitur terpilih di-port** (katalog & auth) | **Superset** (18 provider eksklusif, Jev chain, UI gen) |

---

## 2. Status `decolua/9router` (Official Upstream)

### 2.1 Status Terkini (Per 2026-10-04)
- **Tag Rilis Terakhir**: `v0.5.95` (2026-10-01)
- **Commit Terakhir di `master`**: `a99cf57239ff778b61e434c2786009d5ed1c412c` (`# v0.5.95 (2026-10-01)`)
- **Delta Commit Baru**: **0 commit** (Belum ada commit atau rilis baru di branch `master` upstream decolua sejak 2026-10-01).
- **Semua fitur & bugfix resmi v0.5.91 – v0.5.95 SUDAH SELESAI di-port ke AxonRouter pada v0.1.5 (2026-10-02)**.

### 2.2 Rangkuman Porting dari Decolua ke AxonRouter
- **Provider Baru**: `muse` (Meta Model API dual-auth), `tinyfish` (webSearch/webFetch), `dahl` (Gonka node), `agnes` (curated seed), `v1m` (SystemOne di-port ke subsistem Jev).
- **Model & Capabilities**:
  - Codex: `gpt-6.1-sol`, `gpt-6-sol`, `gpt-6-luna`, varian extended context `[1m]` (872k context window), `gpt-daybreak-blue-latest`, `gpt-reserve`.
  - Codex Client Identity: bump ke `0.159.0` (mencegah reject OpenAI) dan refresh lead time 10 menit (mencegah token logout race).
  - Claude Sonnet 5.5: Registry + capabilities definition + pricing + adaptive thinking `xhigh`.
  - Grok CLI: Upgrade ke identitas client `1.0.44` (mencegah HTTP 426).
- **Pipeline & Routing Fixes**:
  - Responses stream: penundaan `response.completed` hingga token usage asli tiba (watchdog 3s).
  - Strict proxy leak fix: eliminasi direct IP leak ketika pool kosong; auto-fallback TLS retry untuk self-signed cert.
  - Gemini & DeepSeek tool handling: pembersihan schema keyword `errorMessage` dan deduplikasi nama tool.
  - **Forwarding header upstream** (2026-10-04): `open-sse/utils/upstreamHeaders.js` meneruskan `retry-after`, `x-should-retry`, dan `anthropic-ratelimit-*` ke klien. `errorResponse` / `unavailableResponse` / `createErrorResult` masing-masing gaining parameter `extraHeaders`; wiring di `chatCore.js` (error + non-streaming + streaming) dan rotasi `src/sse/handlers/chat.js` (`lastHeaders`). Catatan breaking: `createErrorResult` berubah menjadi `(status, message, resetsAtMs, extra, extraHeaders)`.

### 2.3 Deviasi dari Upstream (Sengaja, AxonRouter bukan mirror)
- **Antigravity Claude → Opus 5.5** (2026-10-04, instruksi owner): `claude-sonnet-4-6` + `claude-opus-4-6-thinking` diganti `claude-opus-5-5` + `claude-opus-5-5-thinking` di registry, quota lockout list, usage fetcher, combo `claude-latest`, dan CLI picks. Upstream masih 4.6 — AxonRouter sengaja menyimpang. **Belum diverifikasi live** (tidak ada DB/koneksi Antigravity yang bisa dijangkau dari host ini).
- **`claude-opus-5*` di Kiro TIDAK di-port** (§2.2 upstream #4410): audit katalog live 2026-10-02 menghapus `claude-opus-5*` dari Kiro karena setiap akun membalas HTTP 400 "Invalid model" — probe 10 hari lebih baru dari klaim upstream, jadi probe kami menang.
- **`atria.js` vs `atria-asi.js`**: upstream menamai entry `atria` (alias `atria-asi`); AxonRouter memakai `atria-asi` + `commitPeekMs` 120000 (prefill lambat terukur). Bukan gap fungsional.

### 2.4 Radar PR Komunitas di Decolua (Open, Belum Dimerge)
Terdapat 5 PR baru yang masuk pada 2026-10-03 di repo decolua (sedang dipantau):
1. **PR #4551**: `fix(usage): keep Responses cached and reasoning token details`
2. **PR #4550**: `fix(cursor): cover every ExecServerMessage variant in EXEC_RESULT_FIELD`
3. **PR #4547**: `fix(responses): map Chat Completions response_format to text.format`
4. **PR #4546**: `Add models for MiMo and Kiro MITM` (abaikan MITM sesuai policy)
5. **PR #4545**: `fix(responses): clamp tool names to the real 64-char API limit`

---

## 3. Status `9router-mibp-version` (Fork MIBP)

Repo lokal: `/workspaces/9router-mibp-version` (`mhiqrambg/9router-mibp-version`).  
Berbasis `decolua/9router` v0.5.86 dengan sejumlah modifikasi komunitas dan provider regional.

### 3.1 Fitur MIBP yang SUDAH Di-port ke AxonRouter
1. **Freebuff Catalog Sync (2026-09-25)**:
   - Model baru: `openai/gpt-6-luna`, `upstage/solar-mini4`, `stealth/space-bunny-alpha`, `anthropic/claude-fable-5.1`.
   - Model retired/purged: `openai/gpt-5.6-luna`, `anthropic/claude-fable-5`.
   - Update `FREE_ROOT_AGENT_BY_MODEL` dan perbaikan `OFFER_GATED_MODELS`.
2. **OpenCode Zen + Fingerprint Cloak**:
   - `open-sse/utils/opencodeFingerprint.js`: tool quartet case normalization (`bash`, `glob`, `grep`, `read`) dan pencegahan duplikasi decoy gate.
   - Penambahan model `mimo-v2.6-flash-free` dan endpoint usage `/zen/v1/usage`.

### 3.2 Fitur MIBP yang Berstatus BACKLOG (Belum Di-port)
1. **`grok-web` (Cookie Auth)**:
   - Transport berbasis cookie browser `sso=` dari grok.com. **DITOLAK** atas permintaan owner (2026-10-04) — provider ini hanya meng scraping cookie browser.
2. **`xiaomi-mimo` Server-Assisted Login & 5 Regional Clusters**:
   - Server-assisted desktop login (`src/lib/mimoLoginSession.js`) dan pemilihan cluster regional (`cn`, `sgp`, `ams`, `ru`, `in`).

### 3.3 Fitur yang SUDAH Di-port (2026-10-04)
1. **`qoder-cn` (Qoder China)** — **DONE (2026-10-04)**:
   - `open-sse/providers/registry/qoder-cn.js`: alias `qdcn`, 16 model, endpoint `gateway.qoder.com.cn` + `openapi.qoder.com.cn`, `authModes: ["oauth","apikey"]`, `usageApikey`.
   - `QoderService` di-parameterisasi config (`loginUrl` / `deviceTokenUrl` / `userInfoUrl`); default tetap intl.
   - `src/lib/oauth/providers/qoder.js` jadi factory `createQoderProvider(config)`; `qoder-cn.js` memakainya dengan `QODER_CN_CONFIG`.
   - Diverifikasi: factory + routing device-flow ke region CN (test throwaway, dihapus setelah terbukti).

### 3.4 Fitur MIBP yang DITOLAK / TIDAK AKAN Di-port (Won't Port)
1. **MITM Engine (`tests/unit/mitm-root-ca.test.js`, cert injection)**:
   - Ditolak oleh policy arsitektur AxonRouter. AxonRouter fokus pada routing gateway murni tanpa MITM hijacking.
2. **`devin-cli` (`baseUrl: devin://acp/stdio`)**:
   - Berbasis stdio process spawn lokal, tidak cocok untuk gateway Hono cluster production.
3. **`mimo-free` / `mmf`**:
   - Layanan gratis upstream sudah dihentikan ("MiMo free API service has ended").

---

## 4. Keunggulan Eksklusif AxonRouter (Tidak Dimiliki Decolua & MIBP)

AxonRouter bukan sekadar mirror, melainkan superset enterprise:
1. **Pure PostgreSQL 17 Storage Engine**: Partisi bulanan native untuk `usage_history` dan `request_details`, multi-worker cluster safe, zero SQLite locks.
2. **Dedicated Hono Gateway Cluster**: Port 3778 berkecepatan tinggi dengan memory cache TTL layer untuk breaker & rotation.
3. **18 Provider Eksklusif**: `tokenharbor`, `unikey`, `kilocode-free`, `orcarouter`, `ovhcloud` (+`-free`), `llmtech` (+`-free`), `morphllm`, `workbuddy`, `typesafe`, `atria-asi`, `bai`, `beatapi`, `cline-free`, `llm7-free`, `vlmrun`, dll.
4. **Jev / SystemOne Dynamic Classifier Chain**: Mesin fallback model combo cerdas berbasis difficulty klasifikasi request.
5. **SSOT UI Registry Generator (`scripts/generate-registry-ui.mjs`)**: Sinkronisasi otomatis aman tanpa kebocoran schema client.
6. **Live Catalog Health Audit**: Pembersihan berkala model-model mati (seperti 51 dead models di Kiro, 17 di Codex, 9 di Copilot, 6 di NVIDIA NIM).

---

## 5. Quick Check CLI untuk Verifikasi Upstream

Jalankan perintah ini kapan saja untuk mengecek apakah ada commit baru setelah baseline:

```bash
# 1. Cek delta commit terhadap master decolua
gh api "repos/decolua/9router/compare/a99cf57...master" -q '{status: .status, ahead_by: .ahead_by, total_commits: .total_commits}'

# 2. Cek tag terbaru decolua
gh api repos/decolua/9router/tags?per_page=1 -q '.[0].name'

# 3. Cek commit terbaru di workspace MIBP lokal
cd /workspaces/9router-mibp-version && git log -n 1 --oneline

# 4. Bikin worktree bersih upstream master (JANGAN reset /workspaces/9router —
#    tree itu 151 commit behind dan 48 file dirty, 46 di antaranya hasil lokal
#    yang tidak ada di origin/master). Worktree tidak menyentuh tree utama.
cd /workspaces/9router && git fetch origin --tags
cd /workspaces/9router && git worktree add /workspaces/9router-upstream-ref origin/master --detach

# 5. Bandingkan path-set subsystem kunci vs AxonRouter
comm -23 \
  <(cd /workspaces/9router-upstream-ref && find open-sse/providers open-sse/translator open-sse/services open-sse/utils -name '*.js' | sort) \
  <(find open-sse/providers open-sse/translator open-sse/services open-sse/utils -name '*.js' | sort)
```
