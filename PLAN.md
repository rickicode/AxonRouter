# BLUEPRINT RESMI: Refactor Arsitektur Database AxonRouter (PostgreSQL-Only + Redis L2 Speed Layer + Docker First)

Dokumen ini merupakan hasil konsensus dari sesi grilling design tree (12 keputusan final terkonfirmasi).

---

## 1. Keputusan Desain Terkunci (The 12 Pillars)

| No | Komponen | Keputusan Final | Rasional |
|---|---|---|---|
| **1** | **Database Engine** | **PostgreSQL Only (Clean Cut)** | Hapus SQLite/sql.js total. Tidak ada dual-engine overhead. |
| **2** | **Redis Role** | **Soft Dependency (L2 Speed Layer)** | Wajib kencang, tapi jika Redis down sistem otomatis fallback ke Postgres tanpa outage. |
| **3** | **Format Kredensial** | **Native JSONB (Plaintext)** | Tetap ikuti standar AxonRouter (plaintext JSONB). Nol overhead enkripsi/dekripsi, query fleksibel. |
| **4** | **Logging Architecture**| **Table Partitioning Bulanan** | Partisi native per bulan. Drop partisi lama instan O(1) tanpa bloating/lock table. |
| **5** | **Schema Migration** | **Embedded Self-Healing Bootstrap** | Auto-run DDL + cek kolom + auto-create partisi saat container start via `_meta`. |
| **6** | **Anti-Collision Router**| **Optimistic Fair-Share + Jitter** | Top 5 akun tersehat via SQL $\rightarrow$ jitter pick $\rightarrow$ update `last_used_at`. Non-blocking. |
| **7** | **CLI Sub-package** | **Docker Server Focus** | Deprecate desktop tray `cli/`. Standar deployment adalah Docker Compose stack. |
| **8** | **Kebijakan Retensi** | **Tiered Retention** | `request_details` 7 hari, `usage_history` 30 hari, `usage_daily` permanen. |
| **9** | **Data Migration** | **Standalone Script CLI Terkendali**| `node scripts/migrate-sqlite-to-pg.mjs` batch 1.000 akun dengan progress bar & checksum check. |
| **10**| **Quota Persistence** | **Write-Through on Upstream** | Sisa kuota (Antigravity/Codex) langsung disimpan di `usage_snapshots` (<0.5ms). |
| **11**| **Redis Auto-Recovery** | **Auto Re-warm on Reconnect** | Saat Redis up kembali, auto-populate ZSET pool & subscribe ulang pub/sub. |
| **12**| **Legacy Cleanup** | **Hapus Total SQLite Adapters** | Hapus semua adapter SQLite & uninstall dependensi `better-sqlite3`, `sql.js`. |

---

## 2. Arsitektur Multi-Tier & Flow Request

```
[ Inbound AI Request /v1/chat/completions ]
                    │
                    ▼
[ L1: Node.js Memory Cache ]
  ├── Cek API Key (Auth Token), Fast Routing Cache
  └── Latensi: ~0.02ms
                    │
                    ▼
[ L2: Redis Speed Layer (Docker: redis:7-alpine) ]
  ├── 1. Response/Prompt Hash Cache (Hit -> Stream langsung)
  ├── 2. Fast Cooldown Check (TTL Keys: cooldown:conn:{id}, cooldown:model:{id}:{model})
  ├── 3. In-Flight Concurrency Limiter (INCR/DECR active_req:{id})
  ├── 4. Ultra-Fast Round-Robin Pool (ZSET pool:{provider}) -> Latensi <0.2ms
  └── 5. Distributed Lock OAuth Refresh (SETNX lock:refresh:{id})
                    │ (Bypass / Fallback jika Redis non-aktif atau Cache Miss)
                    ▼
[ L3: PostgreSQL Storage Engine (Docker: postgres:17-alpine) ]
  ├── provider_connections:
  │     Query Top-5 -> Pick Jitter -> UPDATE last_used_at = NOW()
  ├── usage_snapshots: Persistensi kuota upstream real-time
  ├── proxy_pools: Health & proxy group routing
  ├── api_keys, combos, settings, kv
  └── request_details & usage_history: Tabel terpartisi per bulan
```

---

## 3. Skema Database PostgreSQL Lengkap

```sql
-- 1. Metadata Schema Versioning
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 2. Akun Provider
CREATE TABLE IF NOT EXISTS provider_connections (
  id TEXT PRIMARY KEY,
  provider VARCHAR(64) NOT NULL,
  auth_type VARCHAR(32) NOT NULL,
  name TEXT,
  email TEXT,
  priority INTEGER DEFAULT 999,
  is_active BOOLEAN DEFAULT TRUE,
  test_status VARCHAR(32) DEFAULT 'active',
  locked_all_until TIMESTAMPTZ,                -- Kunci akun total (403, banned, credits exhausted)
  rate_limited_until TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,                    -- Fair-share round-robin load balancing
  model_locks JSONB DEFAULT '{}'::jsonb,      -- Kunci per-model {"model-id": "ISO-TIMESTAMP"}
  last_error TEXT,
  error_code INTEGER,
  last_error_at TIMESTAMPTZ,
  data JSONB NOT NULL,                        -- Encrypted sensitive fields + non-sensitive settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks Parsial Kritis untuk Latensi Sub-Milidetik
CREATE INDEX IF NOT EXISTS idx_pc_routing ON provider_connections (provider, priority, last_used_at NULLS FIRST)
WHERE is_active = true AND (locked_all_until IS NULL OR locked_all_until <= NOW());

CREATE INDEX IF NOT EXISTS idx_pc_model_locks ON provider_connections USING GIN (model_locks);
CREATE INDEX IF NOT EXISTS idx_pc_token_refresh ON provider_connections (provider, token_expires_at)
WHERE is_active = true AND token_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pc_provider_active ON provider_connections (provider, is_active);

-- 3. Quota & Usage Snapshot Engine
CREATE TABLE IF NOT EXISTS usage_snapshots (
  connection_id TEXT PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  plan TEXT,
  quotas JSONB NOT NULL,
  rate_limits JSONB,
  remaining_pct NUMERIC,
  raw_dosage NUMERIC,
  reset_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_snap_provider ON usage_snapshots (provider);
CREATE INDEX IF NOT EXISTS idx_usage_snap_reset ON usage_snapshots (reset_at);

-- 4. Proxy Pools
CREATE TABLE IF NOT EXISTS proxy_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  proxy_url TEXT NOT NULL,
  no_proxy TEXT DEFAULT '',
  type VARCHAR(32) DEFAULT 'http',
  "group" VARCHAR(64) DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  strict_proxy BOOLEAN DEFAULT FALSE,
  test_status VARCHAR(32) DEFAULT 'unknown',
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pp_group ON proxy_pools ("group") WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pp_active ON proxy_pools (is_active);

-- 5. API Keys, Combos, Settings, KV
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT,
  machine_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ak_key ON api_keys (key);

CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT,
  models JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_combos_name ON combos (name);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kv (
  scope VARCHAR(64) NOT NULL,
  key VARCHAR(128) NOT NULL,
  value JSONB NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE INDEX IF NOT EXISTS idx_kv_scope ON kv (scope);

-- 6. Logging Terpartisi Native (Auto Retention Zero-Cost)
CREATE TABLE IF NOT EXISTS request_details (
  id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  status VARCHAR(32),
  data JSONB NOT NULL,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE IF NOT EXISTS usage_history (
  id BIGSERIAL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(64),
  model VARCHAR(128),
  connection_id TEXT,
  api_key TEXT,
  endpoint TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  status VARCHAR(32),
  tokens JSONB,
  meta JSONB,
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);

CREATE TABLE IF NOT EXISTS usage_daily (
  date_key DATE PRIMARY KEY,
  data JSONB NOT NULL
);
```

---

## 4. Query Routing Teroptimasi (Sub-Milidetik)

```sql
-- Ambil 5 akun kandidat terbaik
SELECT id, provider, auth_type, name, priority, last_used_at, model_locks, data
FROM provider_connections
WHERE provider = $1
  AND is_active = true
  AND (locked_all_until IS NULL OR locked_all_until <= NOW())
  AND (
    model_locks->>$2 IS NULL
    OR (model_locks->>$2)::timestamptz <= NOW()
  )
ORDER BY priority ASC, last_used_at ASC NULLS FIRST
LIMIT 5;
```
Di Node.js:
1. Pilih 1 dari 5 akun secara acak terbobot (jitter).
2. Langsung eksekusi fire-and-forget update: `UPDATE provider_connections SET last_used_at = NOW() WHERE id = $1;`.

---

## 5. Modernisasi UX Quota Tracker & Real-Time Observability

### A. Masalah Arsitektur Quota Lama
1. **Volatile**: Kuota disimpan di memory cache JS (`antigravityQuota.js`). Container restart -> bar kuota langsung blank/abu-abu.
2. **N+1 Fetching Storm**: Dashboard me-render 50 kartu akun = mengirim 50 request individual ke `/api/usage/[connectionId]`. UI lag dan rawan timeout.
3. **Client-Side Sorting**: Sorting akun tersehat/sekarat diproses di browser setelah semua request selesai.
4. **Stale Data**: Tidak ada push update otomatis saat kuota di upstream reset di jam 00:00.

### B. Arsitektur UX Baru (Postgres + Redis + SSE Push)
1. **Instant Cold-Start Render (<50ms)**:
   - Data kuota dibaca langsung dari tabel `usage_snapshots` via satu endpoint agregat baru: `GET /api/usage/quotas?provider=...`.
   - Menghapus 100% fenomena kartu kuota kosong setelah restart container.
2. **Single Batch Endpoint (`GET /api/usage/quotas`)**:
   - Query SQL teroptimasi dengan 1 kali round-trip:
     ```sql
     SELECT s.connection_id, s.provider, s.plan, s.quotas, s.rate_limits,
            s.remaining_pct, s.reset_at, s.updated_at,
            c.name, c.email, c.priority, c.is_active, c.locked_all_until
     FROM usage_snapshots s
     JOIN provider_connections c ON s.connection_id = c.id
     WHERE s.provider = $1
     ORDER BY s.remaining_pct ASC NULLS LAST;
     ```
   - Menggantikan 50+ request individual menjadi 1 request tunggal.
3. **Live UI Synchronization via SSE Stream (`/api/usage/stream`)**:
   - Saat request AI selesai atau background healthcheck mendeteksi perubahan kuota:
     Backend publish event `quota_updated` ke Redis channel `axonrouter:events`.
   - Dashboard menerima update real-time via SSE dan menganimasikan progress bar kuota secara mulus tanpa perlu reload halaman (F5).
4. **Komponen UI Interaktif di Dashboard**:
   - **Smart Countdown Badge**: Menampilkan sisa waktu reset dinamis (`Reset in 2j 15m`).
   - **Batch Force Sync**: Tombol "Sync All Quotas" dengan rate-limited background worker queue (mencegah akun di-ban saat mass-checking).
   - **Router Status Pill**: Indikator jelas pada akun yang dilewati oleh routing engine: `Skipped: Quota Depleted` atau `Cooldown Active`.

---

## 6. Hardening Operasional & Proteksi Produksi

### A. Redis Memory Guard & Eviction Policy
- Cegah container Redis OOM akibat prompt cache dan ribuan key ZSET.
- Konfigurasi `docker-compose.yml`:
  `--maxmemory 512mb --maxmemory-policy allkeys-lru`
- Key ephemeral dan cache lama otomatis dibuang saat batas memori 512MB tercapai.

### B. PostgreSQL Connection Tuning
- Parameter Docker Postgres:
  `command: postgres -c max_connections=200 -c shared_buffers=256MB`
- Pool `postgres.js` di Node.js:
  `max: 20`, `idle_timeout: 30`, `connect_timeout: 10`.
- Mencegah error `FATAL: remaining connection slots are reserved` saat burst traffic.

### C. Composite Health Check Endpoint (`GET /api/health`)
- Verifikasi konektivitas real-time:
  1. `SELECT 1` ke PostgreSQL (<200ms).
  2. `PING` ke Redis (<50ms).
- Response JSON `{ status: "ok", db: true, redis: true, uptime: ... }`.
- Return HTTP 503 jika DB utama down. Docker / Kubernetes / reverse proxy otomatis tahan traffic.

### D. Backup & Restore Engine (`scripts/backup-pg.mjs`)
- Menggantikan `src/lib/db/backup.js` lama (yang hanya copy file `data.sqlite`).
- Menjalankan `pg_dump` via child process atau pg-dump stream ke file `.sql.gz` di folder backup dengan rotasi 7 hari.

### E. Global Token Bucket Rate-Limiter (Background Refresh)
- Mencegah 1.2k akun Google/Grok me-refresh bersamaan dan memicu IP ban upstream.
- Worker refresh menggunakan Redis token bucket: max 5 refresh request / detik.

---

## 7. Rencana Eksekusi Bertahap

### Tahap 1: Pembersihan SQLite & Setup Core Driver
- Hapus adapter SQLite lama (`bunSqliteAdapter.js`, `betterSqliteAdapter.js`, `nodeSqliteAdapter.js`, `sqljsAdapter.js`).
- Hapus dependensi tak terpakai dari `package.json` (`better-sqlite3`, `sql.js`).
- Buat `src/lib/db/adapters/postgresAdapter.js` menggunakan `postgres.js` (connection pool, singleton hot-reload safe, error mapper).
- Buat `src/lib/db/schema.pg.js` (DDL bootstrap + auto-creator partisi bulanan).
- Buat `src/lib/security/vault.js` (AES-256-GCM field-level encryption).
- Buat `src/lib/redis/client.js` (ZSET, Lock, TTL, PubSub, graceful fallback & auto-recovery).
- Update `src/lib/db/driver.js` murni PostgreSQL.
- Buat endpoint `src/app/api/health/route.js` (composite healthcheck DB + Redis).

### Tahap 2: Refactor Repository Layer ke 100% Async & UX Quota
- Refactor `connectionsRepo.js` (implementasi query SQL native, `jsonb_set` model lock, transparent decrypt).
- Refactor `proxyPoolsRepo.js`, `apiKeysRepo.js`, `combosRepo.js`, `settingsRepo.js`, `nodesRepo.js`.
- Refactor `usageRepo.js` (dukungan partisi bulanan & agregat harian).
- Buat `usageSnapshotsRepo.js` (CRUD snapshot kuota, query batch sorting, persistensi real-time).
- Buat API endpoint batch `src/app/api/usage/quotas/route.js`.
- Update komponen UI `QuotaTable.js` & `QuotaProgressBar.js` untuk konsumsi endpoint batch & SSE live update.

### Tahap 3: Integrasi Engine Routing (`open-sse` & `src/sse`)
- Hubungkan pemilihan akun di `src/sse/handlers/chat.js` ke query SQL native + Redis ZSET speed layer.
- Pasang distributed lock pada refresh token di background scheduler.
- Pasang in-flight concurrency tracker per connection ID.
- Pasang token bucket rate limiter (max 5 refresh/detik) pada background refresh loop.
- Sambungkan write-through update kuota dari upstream langsung ke `usageSnapshotsRepo` dan Redis pub/sub.

### Tahap 4: Script Migrasi Data & Backup Engine
- Buat `scripts/migrate-sqlite-to-pg.mjs` (batch streaming cursor, normalisasi status, enkripsi transparan, verifikasi `COUNT(*)`).
- Buat `scripts/backup-pg.mjs` (dump terkompresi `.sql.gz` + rotasi file backup).

### Tahap 5: Docker Verification & End-to-End Test
- Update `docker-compose.yml` dengan tuning RAM Redis (`--maxmemory 512mb --maxmemory-policy allkeys-lru`) dan Postgres params.
- Jalankan stack Docker Compose (`docker compose up -d`).
- Verifikasi healthcheck (`postgres`, `redis`, `headroom`, `axonrouter-web`).
- Uji routing request inferensi ke endpoint `/v1/chat/completions`.
- Uji failover Redis crash (sistem tetap jalan via Postgres).
- Uji UX Quota Tracker di browser: instant load, batch sync, live progress bar.
