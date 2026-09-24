# AxonRouter — Rebrand & Migration Specification (v0.1.2)

> Dokumen spesifikasi rebrand sistem dari **axonrouter** ke **AxonRouter**, peningkatan versi ke **v1.0.0**, identitas visual berbasis Cyan, dan integrasi pemantau upstream `decolua/axonrouter`.

---

## 1. Identitas Brand & Visual

### 1.1 Penamaan
- **Nama Produk**: `AxonRouter`
- **Versi Rilis Awal**: `v0.1.2`
- **Deskripsi**: Enterprise-Grade AI Routing Gateway & Neural Token Infrastructure
- **Tagline**: One neural endpoint for all AI models, providers, and CLI agents.

### 1.2 Palet Warna Utama (Cyan — Wajib Tetap Konsisten)
Sistem warna menggunakan tema gelap murni (Pitch Black & Slate Base) dengan aksen **Cyan**:

| Variabel Token | Nilai Hex | Penggunaan |
|---|---|---|
| `--color-brand-300` | `#67E8F9` | Text highlight, selection |
| `--color-brand-400` | `#22D3EE` | Glow sinapsis, border active, topology pulse |
| `--color-brand-500` (`--color-primary`) | `#06B6D4` | Tombol utama, tab aktif, icon aksen, switch |
| `--color-brand-600` (`--color-primary-hover`) | `#0891B2` | State hover tombol & navigasi |
| `--color-bg` | `#000000` | Background canvas utama |
| `--color-sidebar` / `--color-surface` | `#0A0A0A` / `#121212` | Sidebar, card surface, input base |
| `--color-border` | `#2A2A2A` | Garis batas komponen |

### 1.3 Spesifikasi Logo Baru (Axon Synapse)
- **Konsep**: Nodus neuron (Axon terminal) dengan lintasan transmisi sinapsis berbentuk heksagonal / simetris yang memancarkan sinyal routing ke berbagai percabangan model.
- **Warna Logo**:
  - Gradient: Linear `#22D3EE` (Cyan 400) ke `#0891B2` (Cyan 600)
  - Core Node: `#FFFFFF` dengan shadow glow `#06B6D4`
- **Aset Target**:
  - `public/favicon.svg` (32x32 SVG vector, cyan synapse router)
  - `public/icons/icon-192.svg` & `icon-512.svg` (PWA / mobile web icon)
  - `src/shared/components/Sidebar.js` (Header sidebar logo mark)
  - `src/app/(dashboard)/dashboard/usage/components/ProviderTopology.js` (Center router node icon)

---

## 2. Pemantauan Upstream (`decolua/axonrouter`)

### 2.1 Prinsip Kerja
- Versi aplikasi kita mandiri di **`v1.0.0`**.
- Sistem memiliki **Upstream Tracker internal** yang secara berkala memantau versi rilis resmi, tag git, dan commit master dari repo upstream `decolua/axonrouter`.
- Tidak ada auto-update yang menimpa container; tracker hanya bersifat observabilitas & notifikasi bagi admin.

### 2.2 Sumber Data Upstream
```javascript
export const UPSTREAM_CONFIG = {
  upstreamRepo: "decolua/axonrouter",
  npmPackage: "axonrouter",
  githubReleasesApi: "https://api.github.com/repos/decolua/axonrouter/releases/latest",
  npmRegistryApi: "https://registry.npmjs.org/axonrouter/latest",
  githubCommitsApi: "https://api.github.com/repos/decolua/axonrouter/commits/master",
  changelogUrl: "https://raw.githubusercontent.com/decolua/axonrouter/master/CHANGELOG.md",
  cacheTtlMs: 3600000, // 1 jam cache in-memory untuk hindari rate limit GitHub API
};
```

### 2.3 Endpoint Internal: `GET /api/system/upstream-status`
Response JSON:
```json
{
  "axonVersion": "1.0.0",
  "upstream": {
    "package": "axonrouter",
    "latestVersion": "0.5.83",
    "publishedAt": "2026-09-24T00:00:00Z",
    "releaseUrl": "https://github.com/decolua/axonrouter/releases/tag/v0.5.83",
    "hasUpdate": true,
    "lastChecked": "2026-09-24T17:00:00Z"
  }
}
```

### 2.4 Tampilan UI
- **Sidebar Footer / Header**:
  Pill badge kecil dengan indikator status:
  - Hijau: `AxonRouter v1.0.0 · Upstream: v0.5.81 (synced)`
  - Biru/Cyan Glow: `Upstream v0.5.83 available` (klik untuk melihat release notes/changelog modal).
- **Halaman Profile / Settings**:
  Panel detail "Upstream Sync & Fork Status" berisi link ke commit log pembanding.

---

## 3. Matriks Pemetaan Referensi Kode

| Komponen | Status Saat Ini | Rencana Perubahan | Strategi & Mitigasi |
|---|---|---|---|
| **package.json** | `name: "axonrouter-app"`, `version: "0.5.81"` | `name: "axonrouter"`, `version: "1.0.0"` | Aman, sinkronkan lockfile |
| **UI Metadata & Title** | `AxonRouter - AI Infrastructure...` | `AxonRouter - AI Infrastructure...` | Aman, ubah di `layout.js` & static headers |
| **DATA_DIR & Fallback** | `~/.axonrouter`, `/app/data` | Default `/app/data`, fallback `~/.axonrouter` | Tetap periksa folder lama `~/.axonrouter` jika ada |
| **CLI Detection** | `hasAxonRouterConfig` di 11 tool | `hasRouterConfig` | **Wajib Dual-Check**: deteksi `axonrouter` dan `axonrouter` |
| **Default CLI Key** | `sk_axonrouter` | `sk_axonrouter` | **Wajib Dual-Support**: terima `sk_axonrouter` dan `sk_axonrouter` di auth gate |
| **OpenCode / Codex Provider** | `[model_providers.axonrouter]` | `[model_providers.axonrouter]` | Tool generator tulis nama baru, parser baca keduanya |
| **Docker Compose Services** | `axonrouter-web`, `axonrouter-api` | `axonrouter-web`, `axonrouter-api` | Container rename saat deploy terencana |
| **Docker Volumes** | `axonrouter-data`, `axonrouter-pgdata` | Pertahankan nama fisik volume | **JANGAN GANTI NAMA FISIK VOLUME** di prod tanpa migrasi data live |
| **PostgreSQL Database** | `postgres://axonrouter:.../axonrouter` | Pertahankan connection string prod | Ubah label koneksi saja di docs, pertahankan kredensial live |
| **Header Internal** | `x-axonrouter-test-request`, `x-axonrouter-connection-id` | `x-axon-test-request`, `x-axon-connection-id` | Middleware baca header baru dengan fallback header lama |
| **Pub/Sub Redis Event** | `axonrouter:events` | `axonrouter:events` | Ubah event channel untuk isolasi pesan bersih |

---

## 4. Urutan Eksekusi Bertahap

### Tahap 1: Brand, Logo, & Versi v1.0.0 (Aman)
1. Perbarui `package.json`: nama `axonrouter`, versi `1.0.0`.
2. Generate aset logo baru bertema Cyan: `favicon.svg`, `icon-192.svg`, `icon-512.svg`.
3. Ganti branding tampilan di `src/shared/constants/config.js`, `src/app/layout.js`, `src/app/login/page.js`, dan sidebar.

### Tahap 2: Layanan Pemantau Upstream
1. Buat service `src/lib/upstream/upstreamTracker.js` dengan caching.
2. Buat API route `src/app/api/system/upstream-status/route.js`.
3. Pasang visual indicator badge pada Sidebar/Header.

### Tahap 3: CLI Tools Dual-Compatibility
1. Update `src/app/api/cli-tools/*` agar mendeteksi konfigurasi lama (`axonrouter`) maupun baru (`axonrouter`).
2. Generate setup script baru dengan prefix `axonrouter` dan default key `sk_axonrouter`.
3. Pastikan resolver API key gateway memvalidasi kedua default key lokal.

### Tahap 4: Orkestrasi Docker (Opsional / Terkendali)
1. Perbarui `docker-compose.yml` service name dan container name secara hati-hati tanpa memutus volume persistent data.
2. Validasi deploy di server produksi.
