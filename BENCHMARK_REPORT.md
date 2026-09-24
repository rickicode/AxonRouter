# LAPORAN HASIL BENCHMARK LENGKAP SEMUA MODEL AKTIF AXONROUTER
Tanggal: 2026-09-20 12:15:10
Total Model Diuji: 8 | Model Aktif & Berhasil: 5 | Model Offline/Limit: 3

## 1. Peringkat Kecepatan (Latency Tercepat - Ping)
| No | Model ID | Latensi | Status | Cuplikan Respons |
|---|---|---|---|---|
| 1 | `oc/nemotron-3.5-lightning-free` | **2.17s** | OK 200 | Here's a thinking process:  1.  **Analyz |
| 2 | `oc/big-pickle` | **3.32s** | OK 200 | PONG |
| 3 | `oc/muse-spark-1.3-contributor-free` | **3.36s** | OK 200 | PONG |
| 4 | `oc/muse-spark-1.2-contributor-free` | **3.96s** | OK 200 | PONG |
| 5 | `oc/nemotron-3-ultra-free` | **5.41s** | OK 200 | The user wants a single word response: " |

## 2. Peringkat Coding Semi-Berat (TokenBucketRateLimiter Thread-Safe)
| No | Model ID | Skor | Latensi | Tokens | Evaluasi Kualitas Arsitektur |
|---|---|---|---|---|---|
| 1 | `oc/big-pickle` | **100/100** | 8.76s | 1469 | class defined, consume method, wait time method, threading.Lock used, lazy refill timestamp, valid python AST |
| 2 | `oc/muse-spark-1.3-contributor-free` | **100/100** | 9.92s | 1266 | class defined, consume method, wait time method, threading.Lock used, lazy refill timestamp, valid python AST |
| 3 | `oc/muse-spark-1.2-contributor-free` | **95/100** | 9.69s | 1328 | class defined, consume method, wait time method, threading.Lock used, valid python AST |
| 4 | `oc/nemotron-3-ultra-free` | **85/100** | 10.54s | 550 | class defined, consume method, wait time method, threading.Lock used |
| 5 | `oc/nemotron-3.5-lightning-free` | **75/100** | 15.02s | 550 | class defined, wait time method, threading.Lock used, lazy refill timestamp |

## 3. Peringkat Penulisan Kreatif & Diksi Horor (Bahasa Indonesia)
| No | Model ID | Skor | Latensi | Tokens | Analisis Diksi & Atmosfer |
|---|---|---|---|---|---|
| 1 | `oc/big-pickle` | **100/100** | 15.51s | 1444 | 9 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 2 | `oc/nemotron-3-ultra-free` | **90/100** | 10.11s | 500 | 8 atmosphere keywords, 6 structured paragraphs |
| 3 | `oc/muse-spark-1.3-contributor-free` | **90/100** | 11.85s | 1051 | 8 atmosphere keywords, 4 structured paragraphs |
| 4 | `oc/muse-spark-1.2-contributor-free` | **90/100** | 15.10s | 1325 | 9 atmosphere keywords, 4 structured paragraphs |
| 5 | `oc/nemotron-3.5-lightning-free` | **54/100** | 15.83s | 500 | 1 atmosphere keywords |

## 4. Peringkat Complex Logic & Deductive Reasoning
| No | Model ID | Skor | Latensi | Tokens | Analisis Deduksi |
|---|---|---|---|---|---|
| 1 | `oc/muse-spark-1.2-contributor-free` | **100/100** | 10.58s | 1434 | correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 2 | `oc/big-pickle` | **100/100** | 12.80s | 1797 | correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 3 | `oc/nemotron-3-ultra-free` | **100/100** | 15.65s | 400 | correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 4 | `oc/muse-spark-1.3-contributor-free` | **100/100** | 21.74s | 2280 | correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |

## 5. Ringkasan Model Offline / Kena Quota Limit Upstream
| Model ID | Error Code | Pesan Error |
|---|---|---|
| `oc/jev-1.13-free` | 500 | [500 · opencode/jev-1.13-free]: Internal server error |
| `oc/ling-3.0-flash-fin-free` | 500 | empty response content |
| `oc/mimo-v2.5-free` | 500 | empty response content |

---

# LAPORAN HASIL BENCHMARK LENGKAP: CLINE-FREE
Tanggal: 2026-09-20 14:35:00
Total Model Terdaftar: 31 | Model Aktif Teruji: 12 | Model Offline / Limit Upstream: 19

## 1. Peringkat Kecepatan (Latency Tercepat - Ping)
| No | Model ID | Latensi | Status | Cuplikan Respons |
|---|---|---|---|---|
| 1 | `cline-free/~deepseek/deepseek-v4-flash-latest` | **0.70s** | OK 200 | PONG |
| 2 | `cline-free/google/gemma-4-31b-it:free` | **0.96s** | OK 200 | PONG |
| 3 | `cline-free/nvidia/nemotron-3-ultra-550b-a55b:free` | **1.00s** | OK 200 | PONG |
| 4 | `cline-free/google/gemma-4-26b-a4b-it:free` | **1.20s** | OK 200 | PONG |
| 5 | `cline-free/minimax/minimax-m3` | **1.22s** | OK 200 | PONG |
| 6 | `cline-free/nex-agi/nex-n2.5-pro:free` | **1.56s** | OK 200 | PONG |
| 7 | `cline-free/z-ai/glm-5.3-flash` | **1.84s** | OK 200 | PONG |
| 8 | `cline-free/nvidia/nemotron-3-super-120b-a12b:free` | **2.04s** | OK 200 | User says: "Jawab singkat satu kata saja: 'PONG' |
| 9 | `cline-free/z-ai/glm-4.7-flash` | **2.57s** | OK 200 | RETRO |
| 10 | `cline-free/openrouter/free` | **3.19s** | OK 200 | PONG |
| 11 | `cline-free/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | **4.20s** | OK 200 | PONG |
| 12 | `cline-free/z-ai/glm-4.5` | **6.24s** | OK 200 | PING |

## 2. Peringkat Coding & Tool Calling (TokenBucketRateLimiter Thread-Safe)
| No | Model ID | Skor | Latensi | Tokens | Tool Call Fidelity | Evaluasi Kualitas Arsitektur |
|---|---|---|---|---|---|---|
| 1 | `cline-free/minimax/minimax-m3` | **100/100** | 3.72s | 550 | NATIVE_OK (Bocor: 0) | Tool call native OK (+30), Class TokenBucket (+20), Method consume (+20), Method time_until (+10), threading.Lock (+10), Lazy refill timestamp (+10) |
| 2 | `cline-free/poolside/laguna-xs-2.1:free` | **90/100** | 5.15s | 549 | NATIVE_OK (Bocor: 0) | Tool call native OK (+30), Class TokenBucket (+20), Method consume (+20), threading.Lock (+10), Lazy refill timestamp (+10) |
| 3 | `cline-free/~deepseek/deepseek-v4-flash-latest` | **70/100** | 3.45s | 550 | NATIVE_OK (Bocor: 0) | Tool call native OK (+30), Class TokenBucket (+20), threading.Lock (+10), Lazy refill timestamp (+10) |
| 4 | `cline-free/nvidia/nemotron-3-super-120b-a12b:free` | **65/100** | 10.36s | 550 | IGNORED_TOOL (Bocor: 0) | Mengabaikan tool call (+15), Class TokenBucket (+20), Method time_until (+10), threading.Lock (+10), Lazy refill timestamp (+10) |

## 3. Peringkat Penulisan Kreatif & Diksi Horor (Bahasa Indonesia)
| No | Model ID | Skor | Latensi | Tokens | Analisis Diksi & Atmosfer Sastra |
|---|---|---|---|---|---|
| 1 | `cline-free/poolside/laguna-s-2.1:free` | **100/100** | 10.14s | 500 | 10 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 2 | `cline-free/google/gemma-4-26b-a4b-it:free` | **100/100** | 12.42s | 496 | 10 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 3 | `cline-free/google/gemma-4-31b-it:free` | **100/100** | 15.08s | 494 | 7 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 4 | `cline-free/minimax/minimax-m3` | **100/100** | 31.34s | 500 | 7 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 5 | `cline-free/z-ai/glm-4.7-flash` | **100/100** | 32.87s | 500 | 7 atmosphere keywords, 3 structured paragraphs, natural Indonesian flow |
| 6 | `cline-free/openrouter/free` | **100/100** | 38.26s | 496 | 8 atmosphere keywords, 4 structured paragraphs, natural Indonesian flow |
| 7 | `cline-free/nvidia/nemotron-3-super-120b-a12b:free` | **85/100** | 5.04s | 500 | 8 atmosphere keywords, natural Indonesian flow |
| 8 | `cline-free/nvidia/nemotron-3-ultra-550b-a55b:free` | **84/100** | 14.42s | 500 | 6 atmosphere keywords, natural Indonesian flow |

## 4. Peringkat Complex Logic & Deductive Reasoning
| No | Model ID | Skor | Latensi | Tokens | Analisis Deduksi Logis |
|---|---|---|---|---|---|
| 1 | `cline-free/poolside/laguna-xs-2.1:free` | **100/100** | 4.98s | 400 | Correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 2 | `cline-free/nvidia/nemotron-3-super-120b-a12b:free` | **100/100** | 5.46s | 400 | Correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 3 | `cline-free/google/gemma-4-26b-a4b-it:free` | **100/100** | 9.32s | 396 | Correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 4 | `cline-free/minimax/minimax-m3` | **100/100** | 27.24s | 400 | Correct deduction (Pengacara = Putih), Budi = Biru, Doni = Guru/Hitam, structured steps |
| 5 | `cline-free/google/gemma-4-31b-it:free` | **50/100** | 12.48s | 396 | Parsial: Budi = Biru, Doni = Guru/Hitam |
| 6 | `cline-free/z-ai/glm-4.7-flash` | **50/100** | 27.94s | 400 | Parsial: Budi = Biru, Doni = Guru/Hitam |

## 5. Ringkasan Model Offline / Kena Kuota Limit Upstream
| Model ID | Error Code | Pesan Error Upstream |
|---|---|---|
| `cline-free/cohere/north-mini-code:free` | 500 | empty response content |
| `cline-free/deepseek/deepseek-v4-flash` | 500 | empty response content |
| `cline-free/deepseek/deepseek-v4-flash-0731` | 503 | Failed to create stream (inference quota limit) |
| `cline-free/deepseek/deepseek-v4-flash-0731:free` | 503 | Failed to create stream (inference quota limit) |
| `cline-free/dots-studio/dots-3-note-preview:free` | 500 | empty response content |
| `cline-free/inclusionai/ling-3.0-flash-fin:free` | 500 | empty response content |
| `cline-free/inclusionai/ling-3.0-flash-sante:free` | 500 | empty response content |
| `cline-free/inclusionai/ling-3.0-flash-vl:free` | 500 | empty response content |
| `cline-free/liquid/lfm-2.5-2.6b:free` | 500 | empty response content |
| `cline-free/meta/muse-spark-1.2-contributor` | 500 | empty response content |
| `cline-free/meta/muse-spark-1.3-contributor` | 500 | empty response content |
| `cline-free/moonshotai/kimi-k3` | 500 | empty response content |
| `cline-free/nvidia/nemotron-3.5-content-safety:free` | 500 | empty response content |
| `cline-free/nvidia/nemotron-3.5-lightning:free` | 500 | timed out |
| `cline-free/openrouter/auto-beta` | 500 | empty response content |
| `cline-free/poolside/laguna-s-2.1:free` | 500 | empty response content |
| `cline-free/poolside/laguna-xs-2.1:free` | 503 | Failed to create stream (inference quota limit) |
| `cline-free/z-ai/glm-5.2:free` | 500 | empty response content |
| `cline-free/~deepseek/deepseek-flash-latest` | 500 | empty response content |

---

# LAPORAN HASIL BENCHMARK LENGKAP: TOKENHARBOR (TH)
Tanggal: 2026-09-20 15:10:00
Total Model Terdaftar: 41 | Model Aktif Teruji (Ping): 4 | Model Offline / Saldo $0: 37

## 1. Peringkat Kecepatan (Latency Tercepat - Ping)
| No | Model ID | Latensi | Status | Cuplikan Respons |
|---|---|---|---|---|
| 1 | `th/deepseek/deepseek-v4-flash:free` | **3.73s** | OK 200 | PONG |
| 2 | `th/mimo-v2.5:free` | **5.37s** | OK 200 | PONG |
| 3 | `th/deepseek/deepseek-v4.1-flash:free` | **5.62s** | OK 200 | PONG |
| 4 | `th/xiaomi/mimo-v2.5:free` | **8.08s** | OK 200 | PONG! 🏓 |

## 2. Ringkasan Kuota & Ketersediaan Model TokenHarbor
* **Model Berbayar (Flagship)**: Semua model non-free (`gpt-5.6-sol`, `gpt-6-astra`, `claude-opus-5`, `claude-sonnet-5`, `gemini-3.8-flash`, `qwen3.8-max`, `kimi-k3`) membutuhkan saldo berbayar. Akun TokenHarbor saat ini memiliki saldo $0 sehingga mengembalikan HTTP 402/503 (*"Your Token Harbor balance is at $0"*).
* **Model Free Tier**: Tersedia 3 model free: `deepseek-v4-flash:free`, `deepseek-v4.1-flash:free`, dan `mimo-v2.5:free`. Model ini berjalan lancar di akun dengan jatah free aktif (HTTP 200 OK), namun memiliki batas mingguan (*rolling 7-day free allowance*).