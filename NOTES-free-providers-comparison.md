# Catatan Perbandingan Provider AI Gratis: Anonymous vs Free Account (Login)

Dokumen ini mencatat hasil analisis mendalam mengenai perbandingan limit akses tanpa login (Anonymous/Public API) dibandingkan dengan akun gratis (Login/Register) pada provider-provider AI yang terverifikasi aktif.

---

## Ringkasan Perbandingan Limit

| Provider | Anonymous Free Limits | Free Account (Login) Limits | Faktor Peningkatan |
|---|---|---|---|
| **VLM Run Gateway** | 10 RPM, 30 req/hr, 100 req/hari per IP | 240 RPM, 10.000 req/hr per user + $10 saldo signup | **24x RPM**, 333x HR, tak terbatas harian |
| **OVHcloud AI Endpoints** | 2 RPM per IP per model | 400 RPM per project per model | **200x RPM** |
| **LLM Tech** | 2 concurrent, 2M token/hari per IP | 64 concurrent, tanpa batas token harian (bayar per token) | **32x concurrency** |
| **LLM7.io** | 1/detik, 10/menit, 60/jam, 500k token/hari | 2/detik, 40/menit, 100/jam, 1M token/hari (Free token) | 2x token/hari, 4x RPM |
| **LLM7.io (Pro)** | (anonymous) | 25/detik, 1500/menit, 15000/jam, token dinamis | **250x RPM** |

---

## Detail Per Provider

### 1. VLM Run Gateway (`vlm.run`)

**Anonymous (Tanpa Login):**
* Rate limit: 10 req/menit, 30 req/jam, 100 req/hari
* Keyed by: Client IP
* Token balance: Tidak ada (burn from quota)

**Free Account (Login/Register di `app.vlm.run`):**
* Rate limit: **240 req/menit**, 10.000 req/jam per user
* Keyed by: User ID (bukan IP lagi!)
* Bonus: **$10 saldo signup gratis** (setara 1000 credits)
* Model support: Qwen 3.8 27B, GLM-OCR, PaddleOCR v6, dll.

**Verdict:** Sangat worth untuk login. Limit naik **24x lipat** dan tidak dibatasi IP.

---

### 2. OVHcloud AI Endpoints

**Anonymous (Tanpa Login):**
* Rate limit: **2 request per menit per IP per model**
* Keyed by: Client IP
* Model: 23 model tersedia (Qwen, Mistral, Llama, GPT-OSS, Whisper, Embedding)

**Free Account (Register OVHcloud Account Gratis):**
* Rate limit: **400 request per menit per PCI project per model**
* Keyed by: API Access Key (bukan IP lagi!)
* Model: Sama, 23 model tersedia
* Bonus: Akses ke Batch API dan fitting endpoint

**Verdict:** Limit naik **200x lipat** dari 2 RPM menjadi 400 RPM. Gratis tanpa kartu kredit.

---

### 3. LLM Tech (`llmtech.eu`)

**Shared Trial Key (Tanpa Login, Key Publik):**
* Concurrency: 2 concurrent requests
* Token limit: **2.000.000 token per hari per IP**
* Model: `nvidia/Qwen3.8-27B-NVFP4` (Blackwell, 262K context)

**Personal Key (Email Production Key Request):**
* Concurrency: **64 concurrent requests**
* Token limit: **Tanpa batas harian** (bayar per token: $0.25 input, $2.09 output per 1M)
* Model: Sama, Qwen 3.8 27B

**Verdict:** Concurrency naik **32x lipat** dan tidak ada batas token harian. Untuk trial key gratis sudah sangat cukup.

---

### 4. LLM7.io

**Anonymous (Tanpa Login, Tanpa Key):**
* Rate limit: 1/detik, 10/menit, 60/jam
* Token limit: **500.000 token per 24 jam**
* Model: Hanya model `turbo` (GLM-5.3-Flash, Codestral, Mistral-Nemo)

**Free Token (Register Gratis di `dash.llm7.io`):**
* Rate limit: 2/detik, **40/menit**, **100/jam**
* Token limit: **1.000.000 token per 24 jam** (2x lipat)
* Model: Sama, model turbo

**Pro Account ($12/bulan):**
* Rate limit: **25/detik**, **1500/menit**, **15000/jam**
* Token limit: Dinamis berdasarkan billing period
* Model: Semua model (termasuk Claude, GPT, Gemini, dsb.)

**Verdict:** Free token memberikan 2x token/hari dan 4x RPM. Pro memberikan 250x RPM.

---

## Rekomendasi Strategi untuk AxonRouter

### Prioritas 1: Mode Dual (Anonymous + Authenticated)
Untuk setiap provider, implementasikan dua mode:
1. **`provider-free` (Anonymous)**: Tanpa login, rate limit rendah, sebagai fallback
2. **`provider` (API Key)**: Login gratis, rate limit jauh lebih besar

### Prioritas 2: Pool IP Fitness
* Anonymous mode: Batas rendah (2-10 RPM per IP) → sangat cocok untuk rotasi `proxyPoolFitness`
* Authenticated mode: Batas tinggi (240-400 RPM per key) → jarang kena 429

### Prioritas 3: Model Selection
* **VLM Run**: Vision + OCR + Chat (Qwen 3.8 27B)
* **OVHcloud**: Chat + Coding (Qwen 3.8, Qwen3-Coder, GPT-OSS)
* **LLM Tech**: Coding/Reasoning (Qwen 3.8 27B NVFP4, context 262K)
* **LLM7**: General Chat (GLM-5.3-Flash, Codestral, Mistral-Nemo)

---

## Timestamp Pengujian
* Tanggal: 20 September 2026
* Semua provider terverifikasi aktif dan berfungsi
* Semua limit di atas bersumber dari dokumentasi resmi masing-masing provider
