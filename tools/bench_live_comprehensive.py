#!/usr/bin/env python3
"""
axonrouter-X Production Benchmark: Professional & Advanced
Filters models with active accounts in production, tests speed & liveness (>=50%),
runs professional coding + reasoning + tool-calling benchmarks.
"""
import concurrent.futures
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://192.168.90.101:3777")
GATEWAY_KEY = os.environ.get("GATEWAY_KEY", "sk-1913e25d85487647-bkjq1z-e0b63207")
DB_PATH = os.environ.get("DB_PATH", "benchmark_active.db")

ALIAS_MAP = {
    "ag": "antigravity", "cf": "cloudflare-ai", "gcli": "grok-cli",
    "mrp": "morphllm", "cbai": "codebuddy-intl", "ocz": "opencode-zen",
    "cline-free": "cline-free", "cx": "codex", "cbcn": "codebuddy-cn",
    "kc": "kilocode", "kcf": "kilocode-free", "gh": "github", "qd": "qoder", "uk": "unikey",
    "wb": "workbuddy", "th": "tokenharbor", "bai": "bai",
    "orca": "orcarouter", "oc": "opencode", "openrouter": "openrouter",
    "tokenrouter": "tokenrouter", "gemini": "gemini", "nvidia": "nvidia",
    "minimax": "minimax", "cohere": "cohere", "freebuff": "freebuff",
    "thegrid": "openai-compatible-chat-thegrid", "kiosapi": "openai-compatible-chat-kiosapi",
    "cavoti": "openai-compatible-chat-cavoti", "xpiki": "openai-compatible-chat-xpiki",
    "atria": "openai-compatible-chat-atria",
}

FREE_PROVIDERS = {"kilocode-free", "cline-free", "opencode", "openrouter"}

PROMPT_SPEED = "Jawab singkat satu kata saja: 'PONG'"

PROMPT_CODING = """Implementasikan sistem TokenBucketRateLimiter di Python yang thread-safe menggunakan threading.Lock.
Spesifikasi:
1. Class `TokenBucketRateLimiter(capacity: int, refill_rate: float)` (refill_rate = token per detik).
2. Method `consume(tokens: int = 1) -> bool` yang mengembalikan True jika token cukup dan mengurangi token, False jika tidak.
3. Method `time_until_next_available(tokens: int = 1) -> float` menghitung waktu tunggu dalam detik.
4. Sertakan penanganan refill berbasis timestamp (lazy refill) tanpa background thread terpisah.
5. Tuliskan kode lengkap yang siap pakai dengan typing dan contoh pemanggilan."""

PROMPT_LOGIC = """Empat orang (Andi, Budi, Citra, Doni) memiliki profesi berbeda (Dokter, Guru, Insinyur, Pengacara) dan mobil berwarna berbeda (Merah, Biru, Hitam, Putih).
Petunjuk:
1. Dokter memiliki mobil berwarna Merah.
2. Guru bukan Andi dan bukan Citra.
3. Mobil Budi bukan Hitam dan bukan Putih, dan Budi adalah Insinyur.
4. Doni tidak memiliki mobil Putih.
Pertanyaan: Siapa yang memiliki mobil Putih dan apa profesinya? Berikan langkah eliminasi deduksi logis secara singkat."""

WEATHER_TOOL = [{
    "type": "function",
    "function": {
        "name": "get_current_weather",
        "description": "Get the current weather for a given city location",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name, e.g. Jakarta, Tokyo"},
                "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
            },
            "required": ["city"]
        }
    }
}]

def get_active_providers_from_prod():
    """Query production DB to get providers with active, healthy accounts."""
    try:
        cmd = [
            "docker", "exec", "axonrouter-postgres", "psql", "-U", "axonrouter", "-d", "axonrouter", "-t", "-A", "-c",
            "SELECT provider FROM provider_connections WHERE is_active = true AND test_status = 'active' GROUP BY provider;"
        ]
        out = subprocess.check_output(cmd, timeout=15).decode().split()
        active = set(out) | FREE_PROVIDERS
        print(f"[DB] Found {len(active)} active/free providers in production.")
        return active
    except Exception as e:
        print(f"[DB] Error fetching active providers ({e}), falling back to known set.")
        return {
            "unikey", "cloudflare-ai", "grok-cli", "openrouter", "opencode-zen",
            "tokenrouter", "cline-free", "antigravity", "codebuddy-cn", "gemini",
            "codex", "kilocode", "codebuddy-intl", "minimax", "freebuff", "cohere",
            "nvidia", "qoder", "kilocode-free", "opencode"
        }

def fetch_all_models(active_providers):
    """Fetch all models from gateway and filter to active providers."""
    req = urllib.request.Request(
        f"{GATEWAY_URL}/v1/models",
        headers={"Authorization": f"Bearer {GATEWAY_KEY}"}
    )
    res = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
    data = res.get("data", [])
    
    eligible = []
    for m in data:
        mid = m.get("id", "")
        ob = m.get("owned_by", "")
        if ob == "combo" or not mid:
            continue
        pre = mid.split("/")[0] if "/" in mid else ob
        prov = ALIAS_MAP.get(pre, pre)
        if prov in active_providers or pre in active_providers or ob in active_providers:
            eligible.append({
                "id": mid,
                "provider": prov,
                "owned_by": ob,
                "context_length": m.get("context_length", 0),
                "max_output_tokens": m.get("max_output_tokens", 0)
            })
    print(f"[Gateway] Discovered {len(data)} total models -> {len(eligible)} eligible on active providers.")
    return eligible

def query_chat(model, prompt, tools=None, max_tokens=1000, timeout=40):
    t0 = time.time()
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.2
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
        
    req = urllib.request.Request(
        f"{GATEWAY_URL}/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {GATEWAY_KEY}",
            "Content-Type": "application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            dur = time.time() - t0
            raw = json.loads(resp.read().decode())
            choice = raw.get("choices", [{}])[0]
            msg = choice.get("message", {})
            content = msg.get("content") or ""
            tool_calls = msg.get("tool_calls") or []
            usage = raw.get("usage", {})
            completion_tokens = usage.get("completion_tokens", len(content.split()))
            tps = round(completion_tokens / max(dur, 0.001), 2)
            return {
                "ok": True,
                "status": resp.status,
                "dur": round(dur, 3),
                "content": content,
                "tool_calls": tool_calls,
                "tokens": completion_tokens,
                "tps": tps,
                "error": None
            }
    except urllib.error.HTTPError as e:
        dur = time.time() - t0
        err_body = ""
        try:
            err_body = e.read().decode("utf-8", "replace")[:300]
        except:
            pass
        is_429 = (e.code == 429) or ("rate" in err_body.lower() and "limit" in err_body.lower())
        tag = " [RATE_LIMITED_429_SKIP]" if is_429 else ""
        return {"ok": False, "status": e.code, "is_429": is_429, "dur": round(dur, 3), "content": "", "tool_calls": [], "tokens": 0, "tps": 0, "error": f"HTTP {e.code}{tag}: {err_body}"}
    except Exception as e:
        dur = time.time() - t0
        return {"ok": False, "status": 0, "is_429": False, "dur": round(dur, 3), "content": "", "tool_calls": [], "tokens": 0, "tps": 0, "error": str(e)[:200]}
def init_db(path):
    conn = sqlite3.connect(path)
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS live_benchmarks (
        model_id TEXT PRIMARY KEY,
        provider TEXT,
        reps_ok INTEGER,
        reps_total INTEGER,
        liveness REAL,
        speed_avg_ms REAL,
        speed_min_ms REAL,
        speed_tps REAL,
        coding_ok INTEGER,
        coding_score INTEGER,
        coding_tokens INTEGER,
        coding_ms REAL,
        logic_ok INTEGER,
        logic_score INTEGER,
        logic_tokens INTEGER,
        logic_ms REAL,
        tool_call_ok INTEGER,
        total_score INTEGER,
        tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    conn.commit()
    return conn

def evaluate_coding(content):
    if not content or len(content) < 50:
        return 0, "Output too short"
    score = 0
    checks = []
    if "TokenBucketRateLimiter" in content:
        score += 25
        checks.append("Class found (+25)")
    if "consume" in content:
        score += 25
        checks.append("consume method (+25)")
    if "time_until" in content or "time_until_next_available" in content:
        score += 20
        checks.append("time_until method (+20)")
    if "Lock" in content or "threading" in content:
        score += 15
        checks.append("Lock thread-safety (+15)")
    if "time.monotonic" in content or "time.time" in content:
        score += 15
        checks.append("Lazy timestamp refill (+15)")
    return score, ", ".join(checks)

def evaluate_logic(content):
    if not content or len(content) < 20:
        return 0, "Output too short"
    score = 0
    c_lower = content.lower()
    # Correct answer: Pengacara = Putih (Budi=Biru/Insinyur, Doni=Hitam/Guru, Dokter=Merah)
    if "pengacara" in c_lower and "putih" in c_lower:
        score += 50
    if "budi" in c_lower and "biru" in c_lower:
        score += 20
    if "doni" in c_lower and ("hitam" in c_lower or "guru" in c_lower):
        score += 20
    if "dokter" in c_lower and "merah" in c_lower:
        score += 10
    return score, f"Logic score: {score}/100"

def main():
    active_providers = get_active_providers_from_prod()
    eligible = fetch_all_models(active_providers)
    
    conn = init_db(DB_PATH)
    cursor = conn.cursor()
    
    print(f"\n{'='*90}")
    print(f"PHASE 1: LIVENESS & SPEED SCREENING (2 REPS, MIN 50% LIVENESS)")
    print(f"{'='*90}")
    
    alive_models = []
    reps = 2
    
    def test_single_model(m):
        mid = m["id"]
        speeds = []
        oks = 0
        tpss = []
        for r in range(reps):
            res = query_chat(mid, PROMPT_SPEED, max_tokens=15, timeout=12)
            if res["ok"]:
                oks += 1
                speeds.append(res["dur"] * 1000)
                tpss.append(res["tps"])
        liveness = oks / reps
        avg_ms = round(sum(speeds) / len(speeds), 1) if speeds else 0
        min_ms = round(min(speeds), 1) if speeds else 0
        avg_tps = round(sum(tpss) / len(tpss), 1) if tpss else 0
        return {**m, "liveness": liveness, "avg_ms": avg_ms, "min_ms": min_ms, "tps": avg_tps, "oks": oks}

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(test_single_model, m): m for m in eligible}
        done_count = 0
        for future in concurrent.futures.as_completed(futures):
            done_count += 1
            res = future.result()
            mid = res["id"]
            liveness = res["liveness"]
            status_tag = "ALIVE" if liveness >= 0.5 else "DEAD/SLOW"
            if liveness >= 0.5:
                alive_models.append(res)
                print(f"[{done_count:3d}/{len(eligible)}] {status_tag} ({liveness*100:3.0f}%) | {res['avg_ms']:6.1f}ms | {res['tps']:5.1f} tok/s | {mid}", flush=True)
            else:
                print(f"[{done_count:3d}/{len(eligible)}] {status_tag} ({liveness*100:3.0f}%) | FAIL            | {mid}", flush=True)

    print(f"\n[Phase 1 Selesai] {len(alive_models)}/{len(eligible)} models memenuhi syarat liveness >= 50%!", flush=True)

    print(f"\n{'='*90}")
    print(f"PHASE 2: DEEP CAPABILITY (CODING, REASONING, TOOL-CALLING)")
    print(f"{'='*90}")
    
    results = []
    for idx, m in enumerate(alive_models, 1):
        mid = m["id"]
        print(f"\n[{idx:2d}/{len(alive_models)}] Testing: {mid}")
        
        # 1. Professional Coding test
        c_res = query_chat(mid, PROMPT_CODING, max_tokens=900, timeout=45)
        c_score, c_eval = evaluate_coding(c_res["content"])
        c_ms = round(c_res["dur"] * 1000, 1)
        c_toks = c_res["tokens"]
        print(f"  - Coding   : {c_score:3d}/100 ({c_ms:5.1f}ms, {c_toks:4d} tok) | {c_eval}")
        
        # 2. Advanced Logic Reasoning
        l_res = query_chat(mid, PROMPT_LOGIC, max_tokens=700, timeout=35)
        l_score, l_eval = evaluate_logic(l_res["content"])
        l_ms = round(l_res["dur"] * 1000, 1)
        l_toks = l_res["tokens"]
        print(f"  - Logic    : {l_score:3d}/100 ({l_ms:5.1f}ms, {l_toks:4d} tok) | {l_eval}")
        
        # 3. Tool Calling
        t_res = query_chat(mid, "Berapa suhu cuaca di Jakarta sekarang?", tools=WEATHER_TOOL, max_tokens=300, timeout=25)
        t_ok = 1 if len(t_res.get("tool_calls", [])) > 0 else 0
        t_status = "NATIVE_OK" if t_ok else "NO_TOOL"
        print(f"  - Tool Call: {t_status} (calls={len(t_res.get('tool_calls', []))})")
        
        total_score = c_score + l_score + (30 if t_ok else 0)
        
        cursor.execute("""
        INSERT OR REPLACE INTO live_benchmarks (
            model_id, provider, reps_ok, reps_total, liveness, speed_avg_ms, speed_min_ms, speed_tps,
            coding_ok, coding_score, coding_tokens, coding_ms,
            logic_ok, logic_score, logic_tokens, logic_ms,
            tool_call_ok, total_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            mid, m["provider"], m["oks"], 2, m["liveness"], m["avg_ms"], m["min_ms"], m["tps"],
            1 if c_score >= 50 else 0, c_score, c_toks, c_ms,
            1 if l_score >= 50 else 0, l_score, l_toks, l_ms,
            t_ok, total_score
        ))
        conn.commit()
        
        results.append({
            "id": mid, "provider": m["provider"], "total": total_score,
            "coding": c_score, "logic": l_score, "tool": t_ok,
            "speed_ms": m["avg_ms"], "tps": m["tps"]
        })
        
    results.sort(key=lambda x: (-x["total"], x["speed_ms"]))
    print(f"\n{'='*90}")
    print(f"TOP LEADERBOARD (PROFESSIONAL & ADVANCED BENCHMARK)")
    print(f"{'='*90}")
    for rank, r in enumerate(results[:25], 1):
        print(f"#{rank:2d} | Score: {r['total']:3d} | Code: {r['coding']:3d} | Logic: {r['logic']:3d} | Latency: {r['speed_ms']:6.1f}ms | {r['id']}")

if __name__ == "__main__":
    main()
