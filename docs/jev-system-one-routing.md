# TypeSafe Jev / System One Routing & Multi-Upstream Cascade

Dokumentasi fitur **Jev routing** (difficulty classification cascade) di AxonRouter.
Sumber kode diverifikasi pada 2026-09-28 terhadap tree `/workspaces/AxonRouter`
(`open-sse/services/combo.js`, `open-sse/services/jevUpstream.js`, `open-sse/config/jevModels.js`, dan konsumennya).

---

## 1. Ringkasan — apa itu System One (Jev)

System One (Jev) adalah layanan klasifikasi kesulitan (difficulty, ambiguity, domain) eksternal berlatensi rendah yang dipanggil AxonRouter lewat protokol HTTP REST standar sebelum mengeksekusi LLM besar.

### 1.1 Upstream ditentukan oleh registry (bukan hardcode)

Daftar upstream Jev **tidak lagi ditulis di kode**. Setiap provider di registry yang mendeklarasikan
`serviceKinds` memuat `"jev"` **dan** blok `jevConfig` otomatis menjadi kandidat upstream:

```js
// open-sse/providers/registry/opencode.js (keyless — tanpa keyPool)
serviceKinds: ["llm", "jev"],
jevConfig: {
  endpoint: "https://opencode.ai/zen/v1/systemone",
  models: [
    { id: "jev-1.13-free", name: "Jev 1.13 Free (System One)", default: true },
    { id: "jev-1.13", name: "Jev 1.13 (System One)", requiresKey: true },
  ],
},
```

`open-sse/config/jevModels.js` menurunkan seluruh katalog dari proyeksi registry yang aman untuk klien
(`REGISTRY_UI`): `JEV_PROVIDERS` (urut prioritas), `JEV_MODEL_CHOICES`, `JEV_ALL_MODELS`,
`DEFAULT_JEV_MODEL`, `jevEndpointForModel()`, `jevProviderById()`, `jevModelMeta()`, dan
`isKnownJevEndpoint()`. **Menambah upstream Jev baru = mengedit registry saja.**

Semantik field `jevConfig`:

| Field | Arti |
|---|---|
| `endpoint` | URL `…/v1/systemone` absolut milik provider |
| `models[].id` / `.name` | id model dan label picker |
| `models[].default` | nilai default picker bila provider ini terpilih |
| `models[].requiresKey` | model tidak bisa dipakai tanpa key |
| `keyPool` | `true` = provider menyediakan key dari connection pool; **dihilangkan** = keyless |

Upstream yang terdaftar saat ini:

1. **OpenCode Free — `oc/` (keyless, prioritas 40)**
   - Endpoint: `https://opencode.ai/zen/v1/systemone`
   - Model default: `jev-1.13-free` (live-verified: `200` tanpa header `Authorization`)
   - Model berbayar: `jev-1.13` (`requiresKey`, butuh workspace/key Zen)
   - Tanpa `keyPool` — tidak pernah butuh koneksi maupun API key.
2. **TypeSafe AI — `ts/` (keyPool, prioritas 35)**
   - Endpoint: `https://api.typesafe.ai/v1/systemone`, model `jev-latest`
   - Membutuhkan key (`Authorization: Bearer <apiKey>`); tanpa key asli → `403`/`401`.
3. **OpenCode Zen — `ocz/` (keyPool, prioritas 205)**
   - Endpoint: `https://opencode.ai/zen/v1/systemone`, model `jev-1.13-free` / `jev-1.13`
   - Key dari pool `opencode-zen`; model `jev-1.13` `requiresKey`.

`oc/` dan `ocz/` memang **provider yang berbeda** dengan registry entry terpisah, tetapi keduanya
menyajikan System One pada endpoint yang sama. Karena itu nilai picker disimpan sebagai pasangan
**provider + model** (`jevProvider` + `jevModel`), bukan hanya id model — dua upstream yang menyajikan
id model yang sama tetap bisa dibedakan dan di-pin secara eksplisit.

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
        "easy": "Simple questions, greetings, trivia, formatting, lightweight syntax, quick answers, casual chat",
        "hard": "Complex reasoning, system architecture, programming, debugging, algorithms, deep analysis, edge cases"
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
- `answers.difficulty.choice` (atau `.answer`, `data.difficulty`, `data.tier`): dinormalkan; nilai `medium`
  dipetakan ke `hard` di `normalizeJudgeOutput`/`resolveTierMatrix` karena router hanya menjalankan dua tier.
- `answers.ambiguity.choice`: dinormalkan ke `"low" | "medium" | "high"` (default `"low"`).
- `answers.domain.choice`: dinormalkan ke string domain (default heuristik `detectDomain(body)`).
- `answers.difficulty.confidence`: angka float 0..1 (default fallback `0.85`).

Hasil akhir diumpankan ke `resolveTierMatrix(diff, amb, domain, policy)` untuk menghasilkan `tier` final
(`"easy" | "hard"`). Judul difficulty yang dikirim ke upstream hanya menawarkan `easy|hard`.

---

## 2. Arsitektur Cascade & Resolusi Upstream

### 2.1 Upstream Resolver (`resolveJevTarget`)

Modul `open-sse/services/jevUpstream.js` memilih di antara deklarasi registry; modul ini tidak lagi
menulis daftar provider di dalam kode.
1. Membaca `model` dan `provider` yang diminta (dari tuning combo atau setting global).
2. Membentuk urutan kandidat:
   - **`provider` eksplisit = pin keras.** Bila diisi, HANYA provider itu yang dicoba; pin yang tidak
     terkonfigurasi akan terdegradasi ke LLM judge, bukan diam-diam berpindah ke upstream lain.
   - Tanpa pin: provider dari `endpoint` eksplisit → provider yang mendeklarasikan `model` yang diminta →
     sisa provider menurut prioritas registry.
3. Memuat pool koneksi hanya untuk provider yang `keyPool: true` (`loadPool(provider.id)`), dengan rotasi
   *round-robin* multi-key (`peekKey` + `commitRotate`).
4. Urutan sumber key: connection pool → key pemanggil (`jevApiKeys[provider]`) → env provider
   (`<PROVIDER_ID>_API_KEY`, mis. `TYPESAFE_API_KEY`).
5. Provider keyless (tanpa `keyPool`) selalu `available`; model dengan `requiresKey: true` butuh key.

Hierarchy fallback yang berlaku sekarang:
- Default `jev-1.13-free`: provider keyless `oc/` (prioritas 40) menjawab tanpa key apa pun.
- Model `jev-1.13` (`requiresKey`): hanya provider yang punya key (`oc/` dengan key, atau `ocz/` pool).
- Model `jev-latest`: provider `ts/` (TypeSafe), butuh key.
- Semua kandidat tidak tersedia (mis. pin `ts/` tanpa key): `available: false` (fail-open tanpa error),
  cascade terdegradasi ke `llm-only` **tanpa fetch jaringan** (0 fetch).

### 2.2 Diagram Alur Keputusan

```
Chat Request (comboStrategy === "difficulty")
  │
  ├─ (1) Mode Check: tuning.judgeMode ?? cfg.judgeMode ("two-layer" | "jev-only" | "llm-only")
  │       └─ resolveJevTarget({ model, provider, apiKeys, ... })
  │            ├─ Ada upstream usable (keyless / pool / key pemanggil / env) ──► Target Siap
  │            └─ Semua kandidat tidak usable (biasanya karena provider di-pin) ──► degradedToLlm = true ──► Mode jadi "llm-only" (0 fetch)
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
  └─ (5) Eksekusi Model Sesuai Tier Terpilih ("easy" | "hard")
```

---

## 3. Konfigurasi, Multi-Key & Menu Navigation

### 3.1 Model Picker & Default Upstream

Pada menu Dashboard **Combos -> Smart Routing Section**:
- Pilihan classifier adalah pasangan **provider + model**; nilai yang disimpan tetap dua field
  (`jevProvider` + `jevModel`), sehingga `oc/jev-1.13-free` dan `ocz/jev-1.13-free` — endpoint yang sama,
  id model yang sama — tetap dapat dibedakan dan di-pin.
- Pilihan yang muncul diturunkan otomatis dari registry:
  1. `OpenCode Free / jev-1.13-free (Default, Free)` -> `https://opencode.ai/zen/v1/systemone` (keyless)
  2. `OpenCode Free / jev-1.13 (key required)` -> `https://opencode.ai/zen/v1/systemone`
  3. `OpenCode Zen / jev-1.13-free (Free)` -> `https://opencode.ai/zen/v1/systemone`
  4. `OpenCode Zen / jev-1.13 (key required)` -> `https://opencode.ai/zen/v1/systemone`
  5. `TypeSafe AI (Jev) / jev-latest (key required)` -> `https://api.typesafe.ai/v1/systemone`
- Nilai default sistem adalah `jev-1.13-free` pada provider keyless (`DEFAULT_JEV_MODEL`).
- Provider baru muncul di picker begitu registry-nya mendeklarasikan `serviceKinds: ["jev"]` + `jevConfig`.

### 3.2 Dukungan Multi API Key (Connection Pool)

Dukungan multi API key berlaku untuk semua provider yang menandai `keyPool: true` (`typesafe`,
`opencode-zen`):
- Pengguna dapat menambahkan lebih dari satu API key untuk provider tersebut.
- Setiap koneksi disimpan di database PostgreSQL (`connectionsRepo.js`) dengan status aktif/inaktif dan atribut cooldown.
- Service `open-sse/services/jevUpstream.js` memuat pool koneksi ini dan melakukan rotasi *round-robin* otomatis antar permintaan klasifikasi.
- Bila satu key mengalami rate limit atau error kuota, sistem memutar ke key berikutnya dalam pool.
- Provider keyless (mis. `oc/`) tidak pernah memuat pool: tidak butuh koneksi maupun key.

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
| `jevProvider` | `""` | Provider upstream yang di-pin; `""` = pilih otomatis menurut prioritas registry |
| `jevApiKeys` | `{}` | Key per provider: `{ [providerId]: key }`; key provider yang dihilangkan tetap tersimpan |
| `jevConfidenceThreshold` | `0.7` | Ambang batas confidence untuk eskalasi ke LLM judge / tier hard |
| `jevTimeoutMs` | `2500` | Batas waktu respon System One sebelum timeout fallback |
| `judgeTimeoutMs` | `4000` | Batas waktu respon LLM judge |

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
   - Secara default (`jevProvider = ""`) provider keyless `oc/` selalu tersedia, jadi klasifikasi Jev tetap
     jalan gratis tanpa key maupun koneksi.
   - Degradasi ke `llm-only` (0 fetch) hanya terjadi bila **semua kandidat tidak usable** — kasus paling
     umum adalah `jevProvider` di-pin ke provider ber-key (mis. `typesafe`) tanpa key, koneksi, maupun env.
     Request klien tetap diproses tanpa gangguan.
2. **Jev Timeout atau Network Error**:
   - Jika request ke endpoint upstream (`api.typesafe.ai` atau `opencode.ai`) mengalami timeout (`> 2500ms`), koneksi terputus, atau mengembalikan respons selain 200, status `jevFallback` di-increment dan kendali langsung diserahkan ke fallback LLM judge.
3. **Malfungsi Format / JSON Rusak**:
   - Jika respon upstream bukan format JSON yang valid atau kehilangan struktur jawaban, fungsi menangkap error secara internal, mencatat log peringatan, dan mengembalikan `null` ke mekanisme fallback tanpa menimbulkan error 500 ke klien.

---

## 6. Verifikasi & Pengujian

Suite pengujian komprehensif memvalidasi cascade multi-upstream ini di `tests/`:

1. `tests/unit/jev-cascade.test.js`:
   - Pengujian default model `jev-1.13-free` memanggil endpoint keyless `https://opencode.ai/zen/v1/systemone`.
   - Pengujian model `jev-latest` memanggil endpoint TypeSafe `https://api.typesafe.ai/v1/systemone`.
   - Pengujian high confidence (`jevUsed`), low confidence (`jevEscalated`), timeout/error (`jevFallback`).
   - Pengujian kondisi provider di-pin tanpa key yang mendegradasi ke `llm-only` (0 fetch).
2. `tests/unit/jev-multi-provider.test.js`:
   - Validasi rotasi round-robin multi-key pool untuk provider `typesafe` dan `opencode-zen`.
   - Validasi routing keyless `oc/` (tanpa header `Authorization`) dan pinning provider eksplisit.
   - Validasi prioritas upstream dan degradasi cascade.
3. `tests/unit/combo-typesafe-jev.test.js`:
   - Validasi integrasi `classifyWithJev` dan ketiga mode cascade (`two-layer`, `jev-only`, `llm-only`).
4. `tests/unit/typesafe-provider.test.js`:
   - Validasi registrasi ketiga provider classifier (`opencode`, `opencode-zen`, `typesafe`), blok `jevConfig`
     di registry dan `REGISTRY_UI`, serta katalog `JEV_MODEL_CHOICES`.
5. `tests/unit/settings-judge.test.js` dan `tests/unit/chat-judge-settings.test.js`:
   - Validasi default & validasi setting `jevProvider` / `jevApiKeys`, redaksi `jevApiKeysConfigured`, dan
     penerusan tuning dari `chat.js` ke `handleDifficultyChat`.
