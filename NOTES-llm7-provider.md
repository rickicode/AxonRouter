# Catatan Analisis & Rencana Integrasi Provider LLM7

Dokumen ini mencatat hasil pengujian komprehensif seluruh model pada LLM7.io (`https://api.llm7.io/v1`) untuk dasar implementasi/pembaruan provider di AxonRouter.

---

## 1. Ringkasan Endpoint & Autentikasi
* **Website Resmi**: `https://llm7.io` / `https://dash.llm7.io`
* **Base URL Chat**: `https://api.llm7.io/v1/chat/completions`
* **Endpoint Models**: `https://api.llm7.io/v1/models` (Menampilkan 48 model katalog)
* **Header Autentikasi**: `Authorization: Bearer <API_KEY>`
* **Format API**: OpenAI Compatible (`chat/completions`)

---

## 2. Hasil Pengujian Model (Kategori Chat/LLM)

### A. Model Aktif & Berhasil Merespons (Free / Quota Tersedia)
Model-model ini berhasil diuji langsung via HTTP POST dengan status **HTTP 200 OK**:
1. **`codestral-latest`**
   * Sangat responsif dan cocok untuk coding/agent.
   * Model ID: `codestral-latest`
2. **`GLM-5.3-Flash`**
   * Mendukung output reasoning/thinking token.
   * Model ID: `GLM-5.3-Flash`
3. **`mistral-Nemo-Instruct-2407`**
   * Model general instruction 12B dari Mistral.
   * Model ID: `mistral-Nemo-Instruct-2407`

### B. Model Berbayar / Kuota Berbayar Habis (`402 Insufficient Balance`)
Model ini mengembalikan `{"error": {"code": "insufficient_balance", "message": "Insufficient balance."}}`:
* **Claude Series**: `claude-opus-5`, `claude-opus-4-8`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `claude-fable-5`, `claude-fable-5-1`
* **OpenAI / GPT Series**: `gpt-6-astra`, `gpt-5.5`, `gpt-5.6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`
* **Gemini Series**: `gemini-3.8-flash-high`, `gemini-3.7-flash`, `gemini-3.1-flash-lite`, `gemini-3-flash`
* **DeepSeek Series**: `deepseek-v4-pro`, `DeepSeek-V4.1-Flash`, `DeepSeek-V4-Flash-0731`
* **Model Lain**: `grok-4.5`, `grok-4.6`, `kimi-k3`, `glm-5.3`, `llama-4-maverick`, `gemma4:31b`, `Inkling`, `Inkling-Small`, `XiaomiMiMo/MiMo-V2.5`, `XiaomiMiMo/MiMo-V2.5-Pro`, `seed-2.0-mini`

### C. Model Non-Chat / Media (`400 Unsupported Model Feature`)
Model image/video yang tidak mendukung endpoint chat:
* `gpt-image-2`, `gpt-image-2.5`, `kling-v3.0-pro`, `kling-v3.0-turbo`, `seedance-2.0`, `seedance-2.0-fast`, `seedance-2.0-mini`, `gemini-omni-flash`, `chroma-v.46-flash`, `dark-beast-krea2`

### D. Model Mengalami Gangguan Upstream (`502 Bad Gateway`)
* `minimax-m2.7`

---

## 3. Rencana Tindak Lanjut untuk AxonRouter
1. **Dua Mode Integrasi**:
   * **`llm7` (API Key Mode)**: Bagi user yang memasukkan API key dari dashboard `llm7.io`.
   * **`llm7-free` (Anonymous Mode)**: Endpoint `/v1/chat/completions` juga mendukung 500k token/hari tanpa API key untuk model free (`GLM-5.3-Flash`, `codestral-latest`, `mistral-Nemo-Instruct-2407`).
2. **Pembaruan Daftar Model Seed**:
   * Menambahkan model terverifikasi yang aktif (`codestral-latest`, `GLM-5.3-Flash`, `mistral-Nemo-Instruct-2407`) ke `models` registry agar langsung muncul di pilihan combo dan UI.
3. **Penanganan Error 402**:
   * Memastikan error `insufficient_balance` ditangani secara informatif bahwa model tersebut memerlukan saldo berbayar di LLM7.

---

## 4. Pengujian Provider Gratis Tambahan (Anonymous / Tanpa Login)

### A. VLM Run Gateway (`vlm.run`)
* **Endpoint**: `https://gateway.vlm.run/v1/openai/chat/completions`
* **Status**: ✅ Aktif & Berhasil Tanpa Login (HTTP 200 OK)
* **Model Teruji**: `qwen/qwen3.8-27b` (Merliput penalaran tingkat lanjut)
* **Batas**: 10 req/menit, 30 req/jam, 100 req/hari per alamat IP.
* **Catatan**: OpenAI-compatible. Tanpa memerlukan API Key (Anonymous tier).

---

### B. OVHcloud AI Endpoints (`ovhcloud.com`)
* **Endpoint**: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions`
* **Status**: ✅ Aktif & Berhasil Tanpa Login (Menggunakan Anonymous Tier)
* **Model Teruji**: `Qwen3.6-27B`, `Qwen3.8-27B` (Live di server EU mereka)
* **Batas**: 2 request per menit per IP per model. Sistem berhasil mendeteksi batas ini (mengembalikan **HTTP 429 API rate limit exceeded** begitu batas kami lewat).
* **Catatan**: Tanpa memerlukan API Key, kompatibel sepenuhnya dengan OpenAI format.

---

### C. LLM Tech (`llmtech.eu`)
* **Endpoint**: `https://api.llmtech.eu/v1/chat/completions`
* **Trial Key Gratis**: `lt-trial-ba1ef28c6d32ed6980678d8d` (Disediakan langsung di halaman dokumentasi mereka, tanpa daftar).
* **Status**: ✅ Aktif & Berhasil Menggunakan Shared Trial Key (HTTP 200 OK)
* **Model Teruji**: `nvidia/Qwen3.8-27B-NVFP4` (Server di EU, context 262k, berjalan di arsitektur Blackwell).
* **Batas**: 2 concurrent requests dan 2.000.000 token per hari per alamat IP.
* **Catatan**: Sangat stabil. Mendukung tool calling, reasoning control (`enable_thinking`), dan prompt caching otomatis.

---

## 5. Ringkasan Akhir & Rencana Aksi Lanjutan untuk AxonRouter
1. **VLM Run, OVHcloud, dan LLM Tech** semuanya terbukti berjalan dan dapat diakses langsung dari server kita tanpa login (Anonymous), sehingga sangat layak untuk dijadikan provider fallback berbasis IP seperti `kilocode-free`.
2. **LLM7** akan diintegrasikan dalam dua mode:
   * **`llm7-free` (Anonymous Mode)**: 500k token/hari tanpa API key untuk model `GLM-5.3-Flash`, `codestral-latest`, `mistral-Nemo-Instruct-2407`.
   * **`llm7` (API Key Mode)**: 1M token/hari menggunakan API Key personal pengguna.
3. **OVHcloud & LLM Tech** sangat ideal karena berbasis EU dengan latensi rendah untuk wilayah ini, serta memiliki batasan request per menit yang dapat dirotasi menggunakan sistem `proxyPoolFitness` yang sudah ada.
