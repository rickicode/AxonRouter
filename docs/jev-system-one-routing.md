# TypeSafe Jev / System One Routing & Multi-Upstream Cascade

Dokumentasi fitur **Jev routing** (difficulty classification cascade) di AxonRouter.
Sumber kode diverifikasi pada 2026-09-27 terhadap tree `/workspaces/AxonRouter`
(`open-sse/services/combo.js`, `open-sse/services/jevUpstream.js`, `open-sse/config/jevModels.js`, dan konsumennya).

---

## 1. Ringkasan — apa itu System One (Jev)

System One (Jev) adalah layanan klasifikasi kesulitan (difficulty, ambiguity, domain) eksternal berlatensi rendah yang dipanggil AxonRouter lewat protokol HTTP REST standar sebelum mengeksekusi LLM besar.

### 1.1 Dua Upstream Endpoint

AxonRouter mendukung dua penyedia hulu (upstream) untuk System One:

1. **OpenCode Zen (Default, Cost 0)**
   - Endpoint: `https://opencode.ai/zen/v1/systemone`
   - Model default: `jev-1.13-free` (live-verified, cost 0, tidak memotong kuota berbayar)
   - Model berbayar: `jev-1.13` (pay-as-you-go, butuh Zen API key)
   - Otentikasi: Menggunakan koneksi pool `opencode-zen` di menu Providers / Capabilities, atau header kosong untuk tier gratis bila mode `free-zen` aktif.

2. **TypeSafe AI Direct (Fallback / Enterprise)**
   - Endpoint: `https://api.typesafe.ai/v1/systemone`
   - Model: `jev-latest`
   - Otentikasi: Membutuhkan API key (`Authorization: Bearer <apiKey>`). Tanpa API key valid, server TypeSafe mengembalikan status `401 Unauthorized`.
   - Multi API Key: Menggunakan koneksi pool `typesafe` (round-robin multi-key) di menu Providers / Capabilities, setting global/combo, atau env `TYPESAFE_API_KEY`.

Konstanta endpoint dan model didefinisikan secara modular di `open-sse/config/jevModels.js`:
```js
export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
export const ZEN_SYSTEMONE_URL = "https://opencode.ai/zen/v1/systemone";
export const JEV_MODEL_TYPESAFE = "jev-latest";
export const JEV_MODEL_ZEN_FREE = "jev-1.13-free";
export const JEV_MODEL_ZEN = "jev-1.13";
export const DEFAULT_JEV_MODEL = JEV_MODEL_ZEN_FREE;
```
Kedua URL juga di-re-export dari `open-sse/services/combo.js`.

### 1.2 Bentuk Permintaan (Wire Payload)

Dibangun di `classifyWithJev` (`open-sse/services/combo.js`):
```json
{
  "model": "jev-1.13-free",
  "state": "<teks prompt user, hasil extractJudgeInput(body) / body.prompt>",
  "questions": {
    "difficulty": {
      "type": "choice",
      "instructions": "Classify the difficulty of this task.",
      "criteria": {
        "easy": "Simple questions, greetings, trivial clarification, basic syntax, quick answer",
        "medium": "Moderate complexity, multi-step problem, standard coding or reasoning task",
        "hard": "Complex reasoning, intricate architecture, deep debugging, ambiguous edge case"
      }
    },
    "ambiguity": {
      "type": "choice",
      "instructions": "Evaluate the ambiguity of the request.",
      "criteria": {
        "low": "Clear, specific, and well-specified requirements",
        "medium": "Somewhat open-ended or partially specified requirements",
        "high": "Vague, contradictory, or missing critical context"
      }
    },
    "domain": {
      "type": "choice",
      "instructions": "Classify the primary domain of this task.",
      "criteria": {
        "general": "General conversation, facts, or questions",
        "summary": "Summarization, synthesis, translation, or rewriting",
        "coding": "Programming, code generation, debugging, software engineering",
        "design": "Architecture, system design, UI/UX, or technical design",
        "data": "Data analysis, math, SQL, data manipulation"
      }
    }
  }
}
```

### 1.3 Bentuk Respons dan Normalisasi

Respons diproses di `classifyWithJev`:
- `answers.difficulty.choice` (atau `.answer`, `data.difficulty`, `data.tier`): dinormalkan ke `"easy" | "medium" | "hard"`. Jika tidak ada pilihan valid, dianggap error dan return `null`.
- `answers.ambiguity.choice`: dinormalkan ke `"low" | "medium" | "high"` (default `"low"`).
- `answers.domain.choice`: dinormalkan ke string domain (default heuristik `detectDomain(body)`).
- `answers.difficulty.confidence`: angka float 0..1 (default fallback `0.85`).

Hasil akhir klasifikasi diumpankan ke `resolveTierMatrix(diff, amb, domain, policy)` untuk menghasilkan `tier` final (`"easy" | "medium" | "hard"`).

---

## 2. Arsitektur Cascade & Resolusi Upstream

### 2.1 Upstream Resolver (`resolveJevTarget`)

Modul `open-sse/services/jevUpstream.js` memisahkan logika pemilihan target upstream per klasifikasi:
1. Membaca model yang diminta (`jevModel` dari tuning combo atau setting).
2. Mengecek pool koneksi aktif di database (`loadPool("opencode-zen")` dan `loadPool("typesafe")`).
3. Mendukung multi-key round-robin: setiap panggilan menggunakan kunci berikutnya secara bergiliran (`peekKey` + `commitRotate`).
4. Hierarchy fallback:
   - Model `jev-1.13-free` / `jev-1.13`: prioritas ke OpenCode Zen (`https://opencode.ai/zen/v1/systemone`). Bila Zen tidak ada upstream (tanpa koneksi & bukan mode free-zen), fallback ke TypeSafe jika ada key.
   - Model `jev-latest`: prioritas ke TypeSafe (`https://api.typesafe.ai/v1/systemone`).
   - Tanpa key & tanpa koneksi: `resolveJevTarget` mengembalikan `available: false` (fail-open tanpa error), sehingga cascade langsung terdegradasi ke `llm-only` tanpa melakukan fetch jaringan (0 fetch).

### 2.2 Diagram Alur Keputusan

```
Chat Request (comboStrategy === "difficulty")
  │
  ├─ (1) Mode Check: tuning.judgeMode ?? cfg.judgeMode ("two-layer" | "jev-only" | "llm-only")
  │       └─ resolveJevTarget({ model, apiKey, ... })
  │            ├─ Ada Upstream (Zen pool / TypeSafe pool / API Key) ──► Target Siap
  │            └─ Tanpa Key & Tanpa Koneksi ──► degradedToLlm = true ──► Mode jadi "llm-only" (0 fetch)
  │
  ├─ (2) Heuristic Difficulty Check
  │       └─ Match pattern ──► Selesai (Source: "heuristic")
  │
  ├─ (3) Session Cache & Context Lock
  │       └─ Cache hit & tokens >= 60,000 ──► Pakai tier sesi (Source: "context-lock")
  │
  ├─ (4) Eksekusi Mode
  │       ├─ [Mode "jev-only"]
  │       │    └─ classifyWithJev()
  │       │         ├─ High Confidence (>= threshold) ──► Pakai tier Jev (bump jevUsed)
  │       │         ├─ Low Confidence (< threshold)   ──► Eskalasi ke Hard (bump jevEscalated)
  │       │         └─ Timeout / Error                ──► Fallback ke Default Policy (bump jevFallback)
  │       │
  │       ├─ [Mode "two-layer"]
  │       │    └─ classifyWithJev()
  │       │         ├─ High Confidence (>= threshold) ──► Pakai tier Jev, LLM Judge TIDAK dipanggil (bump jevUsed)
  │       │         ├─ Low Confidence (< threshold)   ──► Eskalasi ke LLM Judge (bump jevEscalated)
  │       │         └─ Timeout / Error                ──► Fallback ke LLM Judge (bump jevFallback)
  │       │
  │       └─ [Mode "llm-only"]
  │            └─ classifyWithJudge() langsung tanpa memanggil Jev
  │
  └─ (5) Eksekusi Model Sesuai Tier Terpilih ("easy" | "medium" | "hard")
```

---

## 3. Konfigurasi, Multi-Key & Menu Navigation

### 3.1 Model Picker & Default Upstream

Pada menu Dashboard **Combos -> Smart Routing Section**:
- Pilihan model classifier (`jevModel`):
  1. `OpenCode Zen / jev-1.13-free (Default, Free)` -> `https://opencode.ai/zen/v1/systemone`
  2. `OpenCode Zen / jev-1.13 (Pay-as-you-go)` -> `https://opencode.ai/zen/v1/systemone`
  3. `TypeSafe AI / jev-latest (Direct TypeSafe)` -> `https://api.typesafe.ai/v1/systemone`
- Nilai default sistem adalah `jev-1.13-free` (`DEFAULT_JEV_MODEL`).

### 3.2 Dukungan Multi API Key (Connection Pool)

Dukungan multi API key untuk provider `typesafe` dan `opencode-zen` diintegrasikan penuh ke sistem koneksi AxonRouter:
- Pengguna dapat menambahkan lebih dari satu API key untuk provider `typesafe` atau `opencode-zen`.
- Setiap koneksi disimpan di database PostgreSQL (`connectionsRepo.js`) dengan status aktif/inaktif dan atribut cooldown.
- Service `open-sse/services/jevUpstream.js` memuat pool koneksi ini dan melakukan rotasi *round-robin* otomatis antar permintaan klasifikasi.
- Bila satu key mengalami rate limit atau error kuota, sistem memutar ke key berikutnya dalam pool.

### 3.3 Rename Menu: Media Providers -> Capabilities

Untuk merefleksikan fungsinya yang mencakup multi-modalitas dan routing khusus (seperti TTS, STT, Embeddings, dan provider kemampuan System One):
- Menu sidebar dan navigation bar telah berganti nama dari **Media Providers** menjadi **Capabilities** (atau *Capabilities Providers*).
- Route URL web dashboard tetap dipertahankan pada `/dashboard/media-providers` (dan route alias `/dashboard/capabilities-providers`) untuk kompatibilitas tautan yang sudah ada.
- Pengelolaan koneksi provider `typesafe` dan `opencode-zen` dapat diakses melalui menu **Providers** atau **Capabilities**.

### 3.4 Ringkasan Parameter Tuning

| Parameter | Default | Keterangan |
|---|---|---|
| `judgeMode` | `"two-layer"` | Pilihan mode: `"two-layer"`, `"jev-only"`, `"llm-only"` |
| `jevModel` | `"jev-1.13-free"` | Model klasifikasi Jev yang digunakan |
| `jevConfidenceThreshold` | `0.7` | Ambang batas confidence untuk eskalasi ke LLM judge / tier hard |
| `jevTimeoutMs` | `2500` | Batas waktu respon System One sebelum timeout fallback |
| `judgeTimeoutMs` | `4000` | Batas waktu respon LLM judge |
| `typeSafeApiKey` | `""` | Kunci API khusus TypeSafe (opsional jika menggunakan connection pool) |

---

## 4. Metrik Observability

Routing metrics mencatat perjalanan klasifikasi Jev melalui counter internal:

- `jevUsed`: Jumlah request di mana klasifikasi Jev berhasil dengan confidence tinggi (`>= threshold`) dan langsung dipakai untuk routing tanpa memanggil LLM judge.
- `jevEscalated`: Jumlah request di mana confidence Jev berada di bawah threshold (`< threshold`), sehingga dieskalasi ke LLM judge (pada `two-layer`) atau dipaksa ke tier `hard` (pada `jev-only`).
- `jevFallback`: Jumlah request di mana pemanggilan Jev mengalami kegagalan (HTTP 5xx/4xx, network error, timeout), sehingga cascade beralih ke fallback LLM judge atau policy default.

Metrik ini diekspos melalui:
1. Internal in-memory: `getRoutingMetrics()` di `open-sse/services/routingMetrics.js`.
2. Prometheus endpoint: `GET /api/metrics` dengan label `axonrouter_routing_jev_used_total`, `axonrouter_routing_jev_escalated_total`, dan `axonrouter_routing_jev_fallback_total`.
3. Health JSON: `GET /api/health` pada properti `check.routing`.

---

## 5. Fail-Open Behavior

AxonRouter menjamin prinsip **Zero Request Failure** akibat kegagalan komponen klasifikasi:
1. **Tanpa Key & Tanpa Koneksi**:
   - Jika `judgeMode = "two-layer"` namun pengguna tidak memiliki koneksi aktif `opencode-zen` maupun `typesafe`, dan tidak ada API key di settings maupun environment, mode secara otomatis diturunkan (*fail-open degrade*) ke `llm-only` tanpa melakukan fetch jaringan (0 fetch). Request klien diproses tanpa gangguan.
2. **Jev Timeout atau Network Error**:
   - Jika request ke endpoint upstream (`api.typesafe.ai` atau `opencode.ai`) mengalami timeout (`> 2500ms`), koneksi terputus, atau mengembalikan respons selain 200, status `jevFallback` di-increment dan kendali langsung diserahkan ke fallback LLM judge.
3. **Malfungsi Format / JSON Rusak**:
   - Jika respon upstream bukan format JSON yang valid atau kehilangan struktur jawaban, fungsi menangkap error secara internal, mencatat log peringatan, dan mengembalikan `null` ke mekanisme fallback tanpa menimbulkan error 500 ke klien.

---

## 6. Verifikasi & Pengujian

Suite pengujian komprehensif memvalidasi cascade multi-upstream ini di `tests/`:

1. `tests/unit/jev-cascade.test.js`:
   - Pengujian default model `jev-1.13-free` memanggil endpoint OpenCode Zen `https://opencode.ai/zen/v1/systemone`.
   - Pengujian model `jev-latest` memanggil endpoint TypeSafe `https://api.typesafe.ai/v1/systemone`.
   - Pengujian high confidence (`jevUsed`), low confidence (`jevEscalated`), timeout/error (`jevFallback`).
   - Pengujian kondisi tanpa key & tanpa koneksi yang mendegradasi ke `llm-only` (0 fetch).
2. `tests/unit/jev-multi-provider.test.js`:
   - Validasi rotasi round-robin multi-key pool untuk provider `typesafe` dan `opencode-zen`.
   - Validasi prioritas upstream dan degradasi cascade.
3. `tests/unit/combo-typesafe-jev.test.js`:
   - Validasi integrasi `classifyWithJev` dan ketiga mode cascade (`two-layer`, `jev-only`, `llm-only`).
4. `tests/unit/typesafe-provider.test.js`:
   - Validasi registrasi provider `typesafe` dan model Jev di registry dan UI.
