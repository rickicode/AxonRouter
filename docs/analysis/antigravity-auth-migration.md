# Analisis Auth Antigravity: AxonRouter vs agy Native

> Dibuat: 2026-06-07
> Tujuan: Dokumen referensi untuk mengubah provider Antigravity di AxonRouter dari callback OAuth menjadi manual authorization code paste flow (seperti `agy` native)

---

## Ringkasan

AxonRouter dan `agy` native menggunakan **protokol OAuth Google yang identik** — endpoint, scope, token exchange, post-exchange (`loadCodeAssist` + `onboardUser`), dan format file token sudah 100% kompatibel.

**Satu-satunya perbedaan** adalah UX login:
- **AxonRouter saat ini**: redirect callback ke localhost server
- **agy native**: tampilkan URL → user buka browser → paste authorization code

Semua lapisan lain (model requests, quota/usage, token refresh, multi-account, auto-switch) sudah sejajar dan tidak perlu perubahan.

---

## 1. Auth Flow End-to-End

### 1.1 AxonRouter Saat Ini (Callback-based)

```
Dashboard ──GET──► /api/oauth/antigravity/init
                    │
                    ▼ buildAuthUrl()
          https://accounts.google.com/o/oauth2/v2/auth?
            client_id=...&response_type=code&
            redirect_uri=http://localhost:{port}/callback&
            scope=cloud-platform+userinfo.email+...&
            access_type=offline&prompt=consent&state=...
                    │
                    ▼ (redirect browser ke Google)
          User login di browser Google
                    │
                    ▼ (redirect balik ke localhost:PORT/callback?code=...)
          /api/oauth/antigravity/callback
                    │
                    ▼ exchangeToken()
          POST https://oauth2.googleapis.com/token
            grant_type=authorization_code&code=...&
            client_id=...&client_secret=...&redirect_uri=...
                    │
                    ▼ (dapat access_token, refresh_token)
                    ▼ postExchange()
          POST cloudcode-pa.googleapis.com/v1internal:loadCodeAssist
          GET  www.googleapis.com/oauth2/v1/userinfo
          POST cloudcode-pa.googleapis.com/v1internal:onboardUser
                    │
                    ▼ mapTokens()
          Simpan ProviderConnection ke DB
          Tulis ~/.gemini/antigravity-cli/antigravity-oauth-token
```

### 1.2 agy Native (Manual Paste)

```
CLI: $ agy "prompt"
                    │
                    ▼ (cek token, tidak ada)
          Mencetak ke terminal:
          "Authentication required. Please visit the URL to log in:
           https://accounts.google.com/o/oauth2/v2/auth?..."
          "Or, paste the authorization code here and press Enter:"
                    │
                    ▼ (user buka URL di browser, login)
          User mendapat authorization code
                    │
                    ▼ (user paste code + Enter)
          Token exchange + postExchange (sama persis)
          Simpan ke ~/.gemini/antigravity-cli/antigravity-oauth-token
```

### 1.3 Perbandingan Detail

| Dimensi | AxonRouter | agy Native | Compatible? |
|---|---|---|---|
| OAuth endpoint | `accounts.google.com/o/oauth2/v2/auth` | Sama | ✅ |
| Token endpoint | `oauth2.googleapis.com/token` | Sama | ✅ |
| Scopes | cloud-platform, userinfo.email, userinfo.profile, cclog, experimentsandconfigs | Sama | ✅ |
| `response_type=code` | ✅ | ✅ | ✅ |
| `access_type=offline` | ✅ | ✅ | ✅ |
| `prompt=consent` | ✅ | ✅ | ✅ |
| **Callback method** | **Localhost HTTP server redirect** | **Manual paste authorization code** | ❌ |
| Token exchange | `POST` grant_type=authorization_code | Sama | ✅ |
| loadCodeAssist | ✅ | ✅ | ✅ |
| onboardUser | ✅ | ✅ | ✅ |
| **File token** | `~/.gemini/antigravity-cli/antigravity-oauth-token` | Sama | ✅ |
| **Format file token** | `{"token":{"access_token", "refresh_token", "expiry"}, "auth_method":"consumer"}` | **Identik** | ✅ |
| Token refresh | `POST` grant_type=refresh_token | Sama | ✅ |

---

## 2. Token File Format (Diverifikasi dari File Asli)

### 2.1 Format `antigravity-oauth-token`

```json
{
  "token": {
    "access_token": "ya29.a0...",
    "token_type": "Bearer",
    "refresh_token": "1//0g...",
    "expiry": "2026-06-07T11:59:28.397673431+07:00"
  },
  "auth_method": "consumer"
}
```

- **Lokasi**: `~/.gemini/antigravity-cli/antigravity-oauth-token`
- **Permission**: `0600` (hanya owner)
- **Sama persis** antara yang ditulis AxonRouter (`updateAntigravityAuthToken()`) dan yang dibaca agy native

### 2.2 AxonRouter Write Path

File ini ditulis oleh `src/lib/antigravityAutoSwitch.ts` → `updateAntigravityAuthToken()`:

1. Ambil `accessToken`, `refreshToken` dari `ProviderConnection` DB
2. Dapat `expiry` dengan menambah `createdAt + expiresIn * 1000`
3. Tulis JSON ke `~/.gemini/antigravity-cli/antigravity-oauth-token`
4. Set permission `0600`

### 2.3 Implikasi

File token sudah **fully compatible**. Tidak perlu perubahan format. Setiap kali AxonRouter auto-switch atau update token, agy native langsung bisa membaca token baru tanpa restart.

---

## 3. Usage / Quota System

### 3.1 Endpoint

| Endpoint | Path | Dipakai AxonRouter | Dipakai agy |
|---|---|---|---|
| loadCodeAssist | `POST cloudcode-pa.googleapis.com/v1internal:loadCodeAssist` | ✅ `postExchange`, `getAntigravitySubscriptionInfo` | ✅ (dari log) |
| fetchAvailableModels | `POST cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels` | ✅ `getAntigravityUsage` | ✅ (periodik, 6 menit dari log) |
| onboardUser | `POST cloudcode-pa.googleapis.com/v1internal:onboardUser` | ✅ `postExchange` | ✅ (dari strings binary) |
| userInfo | `GET www.googleapis.com/oauth2/v1/userinfo` | ✅ `postExchange` | ✅ |
| generateContent | `POST cloudcode-pa.googleapis.com/v1internal:generateContent` | ✅ AntigrityExecutor | ✅ (API spec) |
| streamGenerateContent | `POST ...:streamGenerateContent?alt=sse` | ✅ AntigrityExecutor | ✅ (API spec) |
| token refresh | `POST oauth2.googleapis.com/token` | ✅ | ✅ |

### 3.2 Host Fallback

AxonRouter sudah implementasi multiple base URLs (`getBaseUrls()` → fallbackCount):
- Primary: `https://cloudcode-pa.googleapis.com`
- Fallback: kemungkinan `https://daily-cloudcode-pa.sandbox.googleapis.com`

### 3.3 Mock Project ID

Keduanya generate mock project ID jika project ID tidak tersedia:
- **AxonRouter**: `generateMockAntigravityProjectId()` di `usage.ts` + `AntigrityExecutor.generateProjectId()`
- **agy**: Juga generate mock (terkonfirmasi dari `strings` binary)

### 3.4 MITM Bypass

Keduanya menggunakan header `x-request-source: local` untuk bypass MITM. AxonRouter sudah implementasi ini di:
- `providers.ts` — postExchange
- `usage.ts` — getAntigravityUsage, getAntigravitySubscriptionInfo

### 3.5 403 & Eligibility Error Handling (Kritis untuk UI)

#### Sumber Error

403 dari endpoint Antigravity (`fetchAvailableModels`, `loadCodeAssist`) bisa berarti account perlu diverifikasi. Response error dari Antigravity Gateway menggunakan format:

```json
{
  "error": {
    "code": 403,
    "message": "Eligibility check failed...",
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "metadata": {
          "validation_url": "https://accounts.google.com/signin/continue?..."
        }
      }
    ]
  }
}
```

#### extractGoogleValidationUrl

**Lokasi**: `open-sse/utils/error.ts`

Fungsi ini sudah ada dan mengekstrak `validation_url` dari:
1. `error.details[].metadata.validation_url` — structured field
2. `error.details[].@type === google.rpc.Help` → links dengan deskripsi "Verify"
3. `error.message` — regex fallback ke pola `https://accounts.google.com/...`
4. Raw text — regex fallback

**Digunakan di**: `open-sse/services/usage.ts` line 394 — ketika `fetchAvailableModels` return 403.

#### Pesan Error dari Antigravity Gateway

Berdasarkan observasi runtime:

```
Eligibility check failed: Your current account is not eligible for Antigravity.
Verify your account to continue.

Alternatively, try signing in with another personal Google account.

Please verify your account in your browser to continue:
https://accounts.google.com/signin/continue?sarp=1&scc=1&
  continue=https://developers.google.com/gemini-code-assist/auth/auth_success_gemini&
  plt=AKgnsbthcMzRhumyHtxNbICLBV8EFoiafxLxMTbaAiiNxhcK9tkYUdnR...&
  flowName=GlifWebSignIn&authuser=
```

Ini terjadi ketika:
- Akun Google **belum pernah login** ke Antigravity/Gemini Code Assist via browser
- Akun **belum disetujui** (unprovisioned)
- Sesi Google **kedaluwarsa** dan perlu re-verifikasi

#### Implikasi UI

Di dashboard AxonRouter, ketika user connect Antigravity dan dapat error 403:

| Skenario | Tampilkan ke User |
|---|---|
| `validationUrl` tersedia dari `extractGoogleValidationUrl()` | **Button/link**: "Verify Your Account" → buka `validationUrl` di browser. **Pesan**: "Akun Anda perlu diverifikasi. Klik tombol untuk login ke Google dan verifikasi akun Antigravity Anda." **Alternatif**: "Atau coba login dengan akun Google pribadi lain." |
| `validationUrl` tidak tersedia | **Pesan**: "Akses quota Antigravity ditolak. Chat mungkin tetap berfungsi. Coba reconnect dengan akun Google lain." |

**Lokasi UI yang perlu perubahan**:
1. **Halaman provider connection** setelah submit auth code — jika `postExchange` atau `getAntigravityUsage` return 403 dengan validationUrl, tampilkan inline warning dengan tombol/link
2. **Usage/Quota card** di dashboard — jika refresh usage menemukan 403, tampilkan banner dengan tombol verify
3. **AntigravityCliCard** — status bisa berubah jadi "needs verification" dengan tombol aksi

#### Alur Lengkap Error Eligibility

```
POST /api/oauth/antigravity/callback  (exchange + postExchange + save)
  │
  ▼
postExchange → loadCodeAssist  (bisa 403 di sini)
  │
  ├── Sukses → save connection → selesai
  │
  └── 403/Gagal →
        Cek validationUrl dari error body
        ├── Ada → return { error, validationUrl, needsVerification: true }
        └── Tidak ada → return { error }
  │
  ▼
Frontend:
  ├── validationUrl ada →
  │     Tampilkan warning + button "Verify Account"
  │     [Button] → buka validationUrl di tab baru
  │     [Button or link] "Try again" → retry postExchange
  │
  └── validationUrl tidak ada →
        Tampilkan error message standalone
```

#### Referensi: pesan dari agy native

Saat account butuh verifikasi, agy menampilkan pesan serupa dan menyediakan URL yang bisa dibuka user di browser. Ini adalah perilaku yang harus ditiru AxonRouter di UI dashboard.

### 3.6 Quota Parse

**AxonRouter**: Parse response `fetchAvailableModels` → extract per-model `quotaInfo.remainingFraction`, `resetTime`, `displayName`. Filter model internal dan unknown.

**agy/CCS**: Parse struktur yang sama (`models[]` dengan `percentage`, `resetTime`).

---

## 4. Model Request (Executor)

### 4.1 AntigravityExecutor

File: `open-sse/executors/antigravity.ts`

Class `AntigravityExecutor extends BaseExecutor`:

| Method | Fungsi |
|---|---|
| `buildUrl()` | `{base}/v1internal:streamGenerateContent?alt=sse` atau `generateContent` |
| `buildHeaders()` | Bearer token + User-Agent + x-request-source + session ID |
| `transformRequest()` | Gemini-style → contents[], project, model, tool cloaking |
| `refreshCredentials()` | `POST oauth2.googleapis.com/token` grant_type=refresh_token |
| `execute()` | Retry 429, fallback URL, parse Retry-After, exponential backoff |
| `cloakTools()` | Anti-ban: rename tools dengan `_ide` suffix, inject AG decoy tools |

### 4.2 Tool Cloaking

AxonRouter sudah implement anti-ban mechanism yang canggih:
- Rename semua client tool names dengan suffix `_ide`
- Inject AG native default tools sebagai decoy (semua marked "unavailable")
- Map tool names di conversation history (functionCall, functionResponse)

---

## 5. Multi-Account & Auto-Switch

### 5.1 AxonRouter

| Komponen | File | Fungsi |
|---|---|---|
| ProviderConnection DB | SQLite | Menyimpan multiple antigravity connections |
| `updateAntigravityAuthToken()` | `src/lib/antigravityAutoSwitch.ts` | Menulis token ke file untuk agy |
| `checkAndRotateAntigravityAccount()` | `src/lib/antigravityAutoSwitch.ts` | Cari connection lain, update file token |
| `getActiveAntigravityAccount()` | `src/lib/antigravityAutoSwitch.ts` | Baca file token + cocokkan dengan DB |
| `setActiveAntigravityAccount()` | `src/lib/antigravityAutoSwitch.ts` | Set active + tulis file token |
| Auto-switch settings | Settings DB | enabled, activeConnectionId, lastRotatedAt |
| Rotate API | `POST .../auto-switch/rotate` | Trigger rotasi manual |
| Active API | `GET/PUT .../auto-switch/active` | Lihat/set active account |

### 5.2 Auto-Switch Flow (di `connectionUsageRefresh.ts`)

```
connectionUsageRefresh()
  │
  ▼ (setelah refresh usage sukses untuk antigravity)
  checkAndRotateAntigravityAccount()
  │
  ▼ (cek quota connection active)
  ├── Jika quota cukup → selesai
  └── Jika quota habis →
        Cari connection antigravity lain dengan quota
        ├── Jika ada → overwrite antigravity-oauth-token → update DB
        └── Jika tidak ada → selesai (tanpa perubahan)
```

### 5.3 Multi-Account agy Native

agy native hanya support **satu active account** pada satu waktu via file token `antigravity-oauth-token`. Multi-account sebenarnya di-handle oleh CCS wrapper (`ccs agy`):
- Token terpisah di `~/.ccs/cliproxy/auth/antigravity-*.json`
- Account registry di `~/.ccs/cliproxy/accounts.json` dengan nickname, email, tier
- Switch: `ccs agy --use <nickname>` → overwrite token file

**Kesimpulan**: Model AxonRouter (DB + file overwrite) sudah lebih sophisticated dan compatible.

---

## 6. Gap Satu-Satunya: Login UX

### 6.1 Saat Ini (Callback)

```
Frontend AxonRouter
  │
  ├──► Buka popup/tab ke Google OAuth URL
  │     redirect_uri = http://localhost:12711/api/oauth/antigravity/callback
  │
  └──► Google redirect ke callback URL
        AxonRouter terima authorization code dari query param
        → exchange → selesai
```

**Kelemahan:**
- Membutuhkan AxonRouter server listen di port yang bisa direct Google redirect
- Tidak bekerja di environment remote/SSH tanpa tunnel (Ngrok)
- Berbeda dari UX yang agy user kenali

### 6.2 Target (Manual Paste)

```
Frontend AxonRouter
  │
  ├──► Tampilkan ke user:
  │     "Please visit the URL to log in:
  │      https://accounts.google.com/o/oauth2/v2/auth?..."
  │
  ├──► User buka URL di browser (mesin manapun)
  │     → login Google
  │     → dapat authorization code
  │
  └──► User paste authorization code ke form/input
        → POST ke backend
        → exchangeToken(code, redirectUri)
        → postExchange()
        → selesai
```

**Catatan**: `redirect_uri` untuk token exchange harus SAMA dengan yang didaftarkan di Google Cloud Console. Untuk manual paste, bisa pakai `redirect_uri` seperti `urn:ietf:wg:oauth:2.0:oob` (out-of-band) atau URL tetap seperti `http://localhost:12711/api/oauth/antigravity/callback` (walaupun tidak benar-benar di-redirect).

---

## 7. Implikasi Perubahan

### 7.1 File yang Perlu Diubah

| File | Perubahan | Prioritas |
|---|---|---|
| `src/app/api/oauth/[provider]/[action]/route.ts` | Support `POST` callback dengan body `{ code, state }` untuk antigravity | **Wajib** |
| Frontend baru: komponen koneksi Antigravity | UI: tampilkan auth URL + input field + tombol submit | **Wajib** |
| `src/lib/oauth/providers.ts` | Mungkin tidak perlu perubahan (hanya exchange endpoint) | Opsional |
| `src/lib/oauth/services/antigravity.ts` | Jika ingin method CLI `connectManual()` | Opsional |

### 7.2 File yang Tidak Perlu Diubah

| File | Alasan |
|---|---|
| `src/lib/antigravityAutoSwitch.ts` | Token file format sudah kompatibel |
| `src/lib/connectionUsageRefresh.ts` | Logic refresh tidak berubah |
| `open-sse/services/usage.ts` | Endpoint dan parsing sudah benar |
| `open-sse/executors/antigravity.ts` | Model request tidak berubah |
| `src/lib/oauth/constants/oauth.tsx` | Config endpoint sudah benar |
| `src/lib/oauth/postConnectValidation.ts` | Post-connect validation tidak berubah |
| `src/app/api/providers/antigravity/auto-switch/*` | API auto-switch tidak berubah |
| `src/app/(dashboard)/app/providers/[id]/AntigravityCliCard.tsx` | Card CLI reference tidak berubah |

### 7.2.5 Eligibility Check saat Post-Exchange

**Penting**: `postExchange` untuk antigravity di `providers.ts` sudah memanggil `loadCodeAssistEndpoint` dan `onboardUserEndpoint`. Jika endpoint-endpoint ini return 403 (akun belum diverifikasi), flow saat ini tetap membuat connection di DB (tidak throw error untuk 403).

**Rekomendasi**: Di route `POST /api/oauth/antigravity/callback`, setelah `exchangeTokens`, tambahkan pengecekan hasil `postExchange`. Jika `loadCodeAssist` gagal dengan 403 dan ada `validationUrl`, jangan simpan connection sebagai `healthy` — set `healthStatus: "degraded"` atau `authState: "pending_verification"` dan return `validationUrl` ke frontend.

**Lihat §3.5 untuk detail format error dan extractGoogleValidationUrl**.

### 7.3 Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| `redirect_uri` mismatch | Google tolak token exchange | Pastikan `redirect_uri` yang dipakai untuk exchange SAMA dengan yang terdaftar di Google Cloud Console |
| State validation hilang | CSRF pada callback | Generate & validasi state parameter seperti flow saat ini |
| User paste code expired | Code hanya berlaku ~10 menit | Tampilkan warning timeout di UI |
| Headless tidak support | User SSH tidak bisa pakai dashboard | Pertimbangkan flow CLI via `AntigravityService.connect()` |

---

## 8. Pendekatan Implementasi

### 8.1 Opsi A: Dashboard Flow (Rekomendasi)

**Langkah:**

1. **Backend**: Di route `[provider]/[action]`, tambahkan handling untuk `POST /api/oauth/antigravity/callback`:
   - Terima `{ code, state }` dari request body
   - Sama seperti callback saat ini, tapi dari POST body bukan query param redirect

2. **Frontend**: Buat komponen/dialog baru untuk Antigravity connect:
   - Panggil `GET /api/oauth/antigravity/init` → dapat `{ authUrl, state }`
   - Tampilkan URL (bisa diklik atau di-copy)
   - Tampilkan text area/input untuk authorization code
   - Button "Connect" → `POST /api/oauth/antigravity/callback` dengan `{ code, state }`
   - Tampilkan hasil (email, projectId, sukses/gagal)

3. **OAuth route** (`src/app/api/oauth/[provider]/[action]/route.ts`):
   - Route handler perlu deteksi: jika provider === "antigravity" dan method === "POST" di action "callback", baca body JSON bukan query param

### 8.2 Opsi B: CLI Service

Tambahkan method di `AntigravityService`:

```typescript
// src/lib/oauth/services/antigravity.ts

/**
 * Tampilkan auth URL dan exchange manual code
 */
async connectManual(authCode: string): Promise<boolean> {
  const redirectUri = ANTIGRAVITY_CONFIG.redirectUri; // tetap URL yang terdaftar
  const state = crypto.randomBytes(32).toString("base64url");
  const authUrl = this.buildAuthUrl(redirectUri, state);

  console.log(`\nPlease visit:\n${authUrl}\n`);
  console.log("Enter authorization code:");

  // authCode dari input user
  const tokens = await this.exchangeCode(authCode, redirectUri);
  const userInfo = await this.getUserInfo(tokens.access_token);
  const { projectId, tierId } = await this.loadCodeAssist(tokens.access_token);
  // ... onboarding + save
}
```

---

## 9. Referensi File

### 9.1 File Inti AxonRouter

| Path | Peran |
|---|---|
| `src/lib/oauth/providers.ts` | Provider config: antigravity (buildAuthUrl, exchangeToken, postExchange, mapTokens) |
| `src/lib/oauth/constants/oauth.tsx` | ANTIGRAVITY_CONFIG (endpoint, scopes, client credentials) |
| `src/app/api/oauth/[provider]/[action]/route.ts` | OAuth route handler (init, callback) |
| `src/lib/oauth/services/antigravity.ts` | Antigravity OAuth service (connect, exchange, loadCodeAssist, onboard) |
| `src/lib/antigravityAutoSwitch.ts` | Auto-switch: baca/tulis token file, rotasi akun |
| `src/lib/connectionUsageRefresh.ts` | Refresh usage + trigger rotasi |
| `open-sse/services/usage.ts` | getAntigravityUsage, getAntigravitySubscriptionInfo, fetchAvailableModels |
| `open-sse/executors/antigravity.ts` | AntigravityExecutor: model request ke gateway |
| `src/app/api/providers/antigravity/auto-switch/route.ts` | API settings auto-switch |
| `src/app/api/providers/antigravity/auto-switch/active/route.ts` | API active account |
| `src/app/api/providers/antigravity/auto-switch/rotate/route.ts` | API trigger rotasi |
| `src/app/(dashboard)/app/providers/[id]/AntigravityCliCard.tsx` | Card CLI reference (tampilkan status CLI) |
| `src/lib/oauth/postConnectValidation.ts` | Post-connect: refresh usage + sync models |

### 9.2 State Lokal agy

| Path | Peran |
|---|---|
| `~/.gemini/antigravity-cli/antigravity-oauth-token` | Token aktif (format: `{token:{access_token, refresh_token, expiry}, auth_method}`) |
| `~/.gemini/antigravity-cli/settings.json` | Settings CLI |
| `~/.gemini/antigravity-cli/cache/projects.json` | Cache project |
| `~/.gemini/google_accounts.json` | Account Google |
| `~/.gemini/antigravity-cli/conversations/*.db` | Riwayat chat (SQLite) |
| `~/.gemini/antigravity-cli/log/cli-*.log` | Log runtime (termasuk `fetchAvailableModels` periodik) |

---

## 10. Referensi Eksternal

- [CCS Documentation: Antigravity Provider](https://ccs-7e541244.mintlify.app/providers/oauth/agy) — OAuth flow, token format, quota management
- [Antigravity API Spec (GitHub)](https://github.com/NoeFabris/opencode-antigravity-auth/blob/HEAD/docs/ANTIGRAVITY_API_SPEC.md) — Endpoint, request/response format, auth

---

## Lampiran: Verifikasi Runtime agy

Dari eksekusi `agy` langsung di environment terisolasi:

```
$ agy --print "hello"

Authentication required. Please visit the URL to log in:
https://accounts.google.com/o/oauth2/v2/auth?...
Waiting for authentication... (30s)
Or, paste the authorization code here and press Enter:
```

Konfirmasi:
- agy menampilkan URL Google OAuth
- agy menunggu paste authorization code (30s timeout)
- Tidak ada localhost callback server
- Flow: browser → code → paste → exchange
