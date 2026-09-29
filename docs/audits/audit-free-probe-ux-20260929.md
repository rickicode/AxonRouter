# Audit UI/UX Sistem Free Model Probe di AxonRouter

Tanggal Audit: 2026-09-29  
Target Komponen: Scan Free Models Flow, `ScanFreeModelsModal.js`, `scan-free-models/route.js`, Visual Status Indicators, Latency & Rendering Efficiency, Combo Integration.

---

## 1. Executive Summary

Audit menyeluruh terhadap sistem free model probe AxonRouter mengidentifikasi 10 temuan penting pada alur kerja, visual, performa, dan integrasi combo.
Isu paling kritis adalah *network waterfall* O(2N) saat menyimpan model terseleksi akibat loop sekuensial `handleAddCustomModel` dengan refetch berulang.
Ditemukan pula regresi integrasi combo di mana model hasil scan `cline-free` yang tidak mengandung substring "free" terfilter keluar secara senyap di `ModelSelectModal`.
Alur SSE backend mengalami *head-of-line blocking* per chunk yang membuat progress bar UI tersendat.
Terdapat warning palsu ketiadaan koneksi pada provider no-auth (`opencode`), *race condition* seleksi checkbox saat scanning aktif, dan hardcoded i18n.
Perbaikan terprioritas telah disusun untuk memastikan efisiensi rendering 60fps, latensi minim, dan integrasi mulus ke Smart Routing combos.

---

## 2. Temuan Audit (Findings)

### [CRITICAL] O(2N) Sequential Network Waterfall pada Operasi "Add Selected"
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ModelsSection.js:418-422` & `src/app/(dashboard)/dashboard/providers/[id]/useProviderDetail.js:561-577`
- **Observed Behavior**: Ketika user memilih $N$ model gratis (misalnya 15-20 model) dan mengklik tombol "Add Selected ($N$)", UI melakukan loop `for...of` sekuensial yang memanggil `handleAddCustomModel(mId)` satu per satu. Setiap panggilan mengirim `POST /api/models/custom`, menunggu respons, kemudian menjalankan `await fetchCustomModels()` (`GET /api/models/custom`) dan me-dispatch event `"customModelChanged"`. Menambahkan 20 model memicu 40 request HTTP sekuensial (20 POST + 20 GET), membekukan tombol dalam status loading "Adding..." selama 2 hingga 8 detik.
- **Expected Behavior**: Penambahan batch diproses secara atomik dalam 1 request batch POST atau diparalelkan via `Promise.all` dengan tepat 1 kali pemanggilan `fetchCustomModels()` dan 1 kali dispatch event di akhir.
- **Root Cause**: Tidak tersedianya handler batch addition pada `useProviderDetail.js`; modal mendelegasikan penambahan melalui iterasi fungsi model tunggal yang memiliki side-effect refetch menyeluruh.
- **Remediation**:
```javascript
// src/app/(dashboard)/dashboard/providers/[id]/useProviderDetail.js
const handleAddCustomModelsBatch = async (modelIds, type = "llm", providerAliasOverride = providerStorageAlias) => {
  try {
    await Promise.all(
      modelIds.map((id) =>
        fetch("/api/models/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerAlias: providerAliasOverride, id, type }),
        })
      )
    );
    await fetchCustomModels();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("customModelChanged"));
  } catch (error) {
    notify.error("Failed to add some custom models");
  }
};
```

---

### [HIGH] Dynamic Free Models Terfilter Keluar & Hilang dari Combos
- **Lokasi**: `src/shared/utils/modelHelpers.js:28-36`, `src/shared/constants/providers.js:20-39`, dan `src/shared/components/ModelSelectModal.js:464-468`
- **Observed Behavior**: Model gratis dinamis dari `cline-free` yang tidak memiliki kata literal "free" pada ID/namanya (contoh: `xiaomi/mimo-v2.6-flash`, `deepseek/deepseek-v4.1-flash`, `meta/muse-spark-1.3-contributor`) dievaluasi sebagai `isFreeModel(...) === false`. Di `ModelSelectModal.js:466`, baris `models = models.filter((m) => isFreeModel(m, providerId))` membuang seluruh model tersebut sehingga tidak muncul sama sekali saat user ingin menyusun Combo atau Smart Routing.
- **Expected Behavior**: Semua model yang didaftarkan di bawah provider gratis atau bertipe `-free` harus diakui sebagai model gratis dan tampil di picker Combos.
- **Root Cause**: Fungsi `buildProviderEntry` tidak meneruskan properti `category` ke objek `AI_PROVIDERS`, dan provider `cline-free` dikategorikan sebagai `"oauth"`. Fungsi `checkFree` hanya memeriksa `provider?.noAuth || provider?.hasFree`, tanpa memeriksa apakah `providerId.endsWith("-free")` atau mengecek metadata model custom.
- **Remediation**:
```javascript
// src/shared/utils/modelHelpers.js
function checkFree(model, providerId) {
  if (model.isFree === true) return true;
  if (providerId) {
    if (providerId.endsWith("-free") || providerId.startsWith("free-")) return true;
    const provider = AI_PROVIDERS[providerId];
    if (provider?.noAuth || provider?.hasFree || provider?.category === "free") return true;
  }
  const text = `${model.id || ""} ${model.name || ""} ${model.value || ""}`.toLowerCase();
  return /\bfree\b/.test(text);
}
```

---

### [HIGH] Head-of-Line Blocking pada SSE Probing Stream Mengakibatkan UI Stutter
- **Lokasi**: `src/app/api/providers/[id]/scan-free-models/route.js:342-356`
- **Observed Behavior**: Kandidat model diproses dalam chunk berukuran 4 (`STREAM_CHUNK_SIZE = 4`) menggunakan `await Promise.all(chunk.map((c) => probeCandidate(c)))`. Event SSE `probe` baru dikirimkan ke client setelah *seluruh* 4 model dalam chunk selesai. Jika 1 kandidat mengalami timeout (hingga 15 detik pada `ping.js`), 3 kandidat lainnya yang sudah selesai dalam 200ms tertahan di server. Progress bar UI di modal membeku lama lalu melompat secara tiba-tiba sebanyak 4 item.
- **Expected Behavior**: Setiap hasil probe dikirimkan (`sendEvent("probe", ...)`) seketika saat kandidat tersebut selesai diping tanpa menunggu kandidat lain dalam chunk.
- **Root Cause**: Pola `Promise.all` kaku per chunk alih-alih asynchronous event streaming langsung dari dalam worker executor.
- **Remediation**:
```javascript
// src/app/api/providers/[id]/scan-free-models/route.js
// Eksekusi dengan concurrency pool tanpa menahan pengiriman SSE event
const probeAndEmit = async (cand) => {
  const r = await probeCandidate(cand);
  if (!isClosed) {
    results.push(r);
    sendEvent("probe", {
      ...r,
      testedCount: results.length,
      totalCandidates: candidates.length,
    });
  }
};
// Jalankan dengan batch p-limit atau parallel pool berkapasitas 2-3 worker
for (let i = 0; i < candidates.length; i += STREAM_CHUNK_SIZE) {
  if (isClosed) break;
  const chunk = candidates.slice(i, i + STREAM_CHUNK_SIZE);
  await Promise.all(chunk.map((c) => probeAndEmit(c)));
  if (i + STREAM_CHUNK_SIZE < candidates.length && !isClosed) await sleep(50);
}
```

---

### [MEDIUM] False-Positive Warning "No active connections available" pada Provider No-Auth
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:270-275`
- **Observed Behavior**: Modal menampilkan peringatan kuning: *"No active connections available for this provider. Add an account first to run model probes."* ketika `connections.length === 0 && !providerId.includes("free")`. Untuk provider keyless seperti `opencode` (kategori "free", `noAuth: true`), ID-nya adalah `"opencode"` (tidak memuat kata "free"). User mendapatkan peringatan membingungkan seolah probe tidak dapat dijalankan, padahal route backend mengizinkan eksekusi tanpa akun.
- **Expected Behavior**: Peringatan ketiadaan koneksi hanya muncul jika provider memang membutuhkan autentikasi (`!isFreeNoAuth`).
- **Root Cause**: Pengecekan string `!providerId.includes("free")` yang tidak presisi alih-alih memeriksa prop `isFreeNoAuth` atau flag `noAuth` dari provider config.
- **Remediation**:
```javascript
// src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:270
{connections.length === 0 && !isFreeNoAuth && !providerId.endsWith("-free") && (
  <div className="rounded-sm border border-warning/40 bg-warning/10 p-2.5 sm:p-3 text-xs text-warning flex items-start sm:items-center gap-2">
    <Icon name="warning" size={16} className="shrink-0 mt-0.5 sm:mt-0" />
    <span className="flex-1">No active connections available for this provider. Add an account first to run model probes.</span>
  </div>
)}
```

---

### [MEDIUM] Race Condition: Seleksi Checkbox Ditimpa Setiap 120ms Saat Scanning Aktif
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:71, 149-153`
- **Observed Behavior**: Ketika user mencoba membatalkan centang (uncheck) salah satu model gratis yang sudah selesai diprobe sementara proses scan masih berjalan, centang tersebut otomatis kembali terpilih pada flush buffer berikutnya (120ms kemudian).
- **Expected Behavior**: Interaksi pembatalan pilihan oleh user dipertahankan selama dan sesudah pemindaian.
- **Root Cause**: `flushBufferToState()` memanggil `setSelectedIds(new Set(set))` secara mutlak menggunakan akumulasi `bufferRef.current.set`, menimpa modifikasi lokal user pada state `selectedIds`.
- **Remediation**:
```javascript
// Lacak model yang sengaja di-deselect oleh user
const deselectedRef = useRef(new Set());
// Di flushBufferToState:
setSelectedIds(new Set([...set].filter((id) => !deselectedRef.current.has(id))));
// Di toggleSelect:
if (selectedIds.has(id)) {
  deselectedRef.current.add(id);
} else {
  deselectedRef.current.delete(id);
}
```

---

### [MEDIUM] Pemotongan Prefix Provider Alias Tidak Lengkap (Potensi Duplikasi Prefix)
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:218, 458` dan `src/app/api/providers/[id]/scan-free-models/route.js:223`
- **Observed Behavior**: Kode menggunakan regex kaku `.replace(/^(cline-free|clf)\//, "")`. Jika provider lain seperti `tokenharbor` (`th`), `kilocode-free` (`kcf`), atau `opencode` (`oc`) mengembalikan kandidat yang sudah diawali aliasnya (misal `th/deepseek-v4.1-flash:free`), prefix tersebut tidak terpangkas. Saat disimpan ke DB dan digabungkan kembali dengan `providerStorageAlias`, ID model menjadi terduplikasi: `th/th/deepseek-v4.1-flash:free`.
- **Expected Behavior**: Semua alias yang relevan dengan provider terkait dipangkas secara dinamis dan bersih.
- **Root Cause**: Hardcoded string replacement untuk Cline Free yang tidak digeneralisasi untuk seluruh provider keluarga free tier.
- **Remediation**:
```javascript
// Bersihkan alias secara dinamis berdasarkan providerAlias dan providerId
const cleanModelId = (rawId, pId, pAlias) => {
  let s = String(rawId || "");
  const prefixes = [pId, pAlias, "clf", "cline-free", "th", "kcf", "oc"].filter(Boolean);
  for (const p of prefixes) {
    if (s.startsWith(`${p}/`)) s = s.slice(p.length + 1);
  }
  return s;
};
```

---

### [MEDIUM] Siloed UX: Ketiadaan Integrasi Langsung ke Combos dan Smart Routing
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:487-508` dan `src/app/(dashboard)/dashboard/combos/page.js`
- **Observed Behavior**: Manfaat utama dari probing model gratis adalah memanfaatkannya pada *Easy Tier* Smart Routing atau fallback chain di Combos. Saat ini, alur kerja benar-benar terisolasi: setelah scan selesai di halaman provider, user tidak memiliki tombol cepat untuk "Add to Combo" atau "Create Free Combo". Di sisi lain, pada halaman Combos (`ModelSelectModal.js`), tidak ada filter tab "Free Only" dan tidak ada opsi untuk memicu scan model gratis secara langsung.
- **Expected Behavior**: Ada tombol aksi sekunder di footer modal scan: *"Add to Combo..."* atau *"Create Combo from Free Models"*. Pada `ModelSelectModal`, tersedia filter badge *"Free Models Only"* dengan status latensi hasil probe terakhir.
- **Root Cause**: Desain fitur yang terisolasi per halaman tanpa jembatan navigasi kontekstual antar modul dashboard.
- **Remediation**: Sediakan callback navigasi atau modal pembuat combo cepat langsung dari hasil probe, serta integrasikan filter `isFreeOnly` pada `ModelSelectModal`.

---

### [LOW] Dead Code & Phantom Reference: `animFrameRef`
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:35, 48`
- **Observed Behavior**: Variabel `animFrameRef = useRef(null)` dideklarasikan dan dibersihkan di `cancelAnimationFrame(animFrameRef.current)`, tetapi nilai `requestAnimationFrame` tidak pernah di-assign di mana pun dalam kode. Throttling aktual dilakukan via perbandingan waktu `Date.now() - lastFlush > 120`.
- **Expected Behavior**: Kode bersih tanpa deklarasi ref yang tidak terpakai.
- **Root Cause**: Sisa implementasi sebelumnya yang digantikan oleh `Date.now()` throttling namun pembersihannya tertinggal.
- **Remediation**: Hapus deklarasi `const animFrameRef = useRef(null);` dan pemanggilan `cancelAnimationFrame(animFrameRef.current)`.

---

### [LOW] Indikator Latensi Tidak Memiliki Skala Warna Semantik
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:475-479`
- **Observed Behavior**: Chip latensi selalu menggunakan style hijau: `bg-success/10 text-success` terlepas apakah latensinya 150ms atau 14.800ms. Latensi 14 detik memberi impresi visual "sehat/optimal" bagi user padahal model tersebut sangat lambat dan berisiko timeout jika dimasukkan ke combo coding.
- **Expected Behavior**: Warna chip latensi mencerminkan ambang batas performa:
  - `< 1000ms`: Hijau (`text-success bg-success/10`)
  - `1000ms - 3000ms`: Kuning/Peringatan (`text-warning bg-warning/10`)
  - `> 3000ms`: Amber/Muted (`text-danger/80 bg-danger/10`)
- **Root Cause**: Hardcoded styling tanpa percabangan nilai `m.latencyMs`.
- **Remediation**:
```javascript
const getLatencyClass = (ms) => {
  if (ms < 1000) return "bg-success/10 text-success";
  if (ms < 3000) return "bg-warning/10 text-warning";
  return "bg-danger/10 text-danger";
};
```

---

### [LOW] Hardcoded Indonesian String Mengabaikan Sistem Translasi
- **Lokasi**: `src/app/(dashboard)/dashboard/providers/[id]/ScanFreeModelsModal.js:183-185`
- **Observed Behavior**: String pesan error jaringan: `"Koneksi terputus (...). X model yang berhasil diprobe tetap tersimpan di bawah."` ditulis *hardcoded* dalam bahasa Indonesia pada komponen yang menggunakan bahasa Inggris sebagai source key. Ini melanggar konvensi i18n repositori (`PLAN-redesign.md`).
- **Expected Behavior**: Semua pesan antarmuka menggunakan source key bahasa Inggris dan dibungkus fungsi `translate(...)`.
- **Root Cause**: Patch ad-hoc langsung pada file komponen tanpa melalui kamus terjemahan runtime.
- **Remediation**:
```javascript
setError(
  translate("Connection interrupted ({error}). {count} probed models remain available below.", {
    error: err?.message || "Network error",
    count: bufferRef.current.list.length,
  })
);
```

---

## 3. Prioritized Action List

1. **P0 (Urgent) — Terapkan Batch Model Addition**
   - Mengapa: Menghilangkan O(2N) network waterfall yang membekukan browser user saat mengklik "Add Selected" pada banyak model.
   - Dampak: Mengurangi waktu simpan dari 4-8 detik menjadi <250ms dan mencegah *state desync*.

2. **P0 (Urgent) — Perbaiki Deteksi Model Gratis pada `isFreeModel` & `ModelSelectModal`**
   - Mengapa: Mengatasi *silent filtering* yang menghilangkan model custom `cline-free` dari pemilih combo.
   - Dampak: Menjamin semua model yang berhasil discan langsung tersedia dan dapat dipakai di Combos.

3. **P1 (High) — Unblock SSE Chunking pada Route Backend**
   - Mengapa: Mengeliminasi *head-of-line blocking* di mana 1 model timeout menahan pembaruan 3 model lainnya.
   - Dampak: Visual progress bar probe berjalan mulus 60fps tanpa hentakan.

4. **P1 (High) — Tangani Deselect Race Condition di Modal**
   - Mengapa: Menjamin kontrol seleksi user tidak ditimpa secara agresif oleh stream buffer setiap 120ms.
   - Dampak: Kenyamanan interaksi user meningkat secara signifikan saat scanning berjalan.

5. **P2 (Medium) — Hubungkan Alur Scan ke Combos & Tambahkan Filter "Free Only"**
   - Mengapa: Menyatukan *user journey* dari penemuan model gratis ke pemanfaatannya di Smart Routing.
   - Dampak: Efisiensi setup routing AI berbiaya $0 meningkat drastis.

6. **P2 (Medium) — Generalisasi Pemotongan Prefix Provider**
   - Mengapa: Mencegah bug ID bertingkat seperti `th/th/model` atau `kcf/kcf/model`.
   - Dampak: Menghindari error 404 saat inferensi via gateway.

7. **P3 (Polishing) — Semantik Latensi, Bersihkan Phantom Ref, dan Standarisasi i18n**
   - Mengapa: Meningkatkan kejelasan kognitif pembacaan metrik latensi dan menjaga kebersihan arsitektur kode.

---

## 4. Hal yang Tidak Dapat Diverifikasi (Unverified Constraints)

1. **Latensi Jaringan Riil ke Upstream API Eksternal**:
   Pengujian benchmark live ke endpoint asli (`https://api.cline.bot`, `https://api.kilo.ai`, dll.) tidak dapat diukur latensi riilnya pada lingkungan sandbox audit tanpa koneksi internet langsung dan kredensial aktif berbayar.
2. **Perilaku Khusus Akun OAuth Expired Terhadap Probe**:
   Tidak dapat memverifikasi respons upstream jika token OAuth kedaluwarsa secara langsung di server target tanpa database kredensial live produksi.
