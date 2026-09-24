#!/usr/bin/env python3
"""
axonrouter-X Comprehensive Model Benchmark Suite  (v2)
===================================================
Run: python3 bench_all.py --run 1 --api-key KEY [--limit-models N]

Phases
------
P1  Liveness & Speed      : JSON mode, N reps per model. Classifies alive/dead + latency.
P2  Modality              : stream test + json test -> both | stream_only | json_only | dead
P3  Capability sessions   : coding (easy/medium/hard), story (horror/life, long-form),
                            podcast script, social-media copy, customer-service reply.
P4  Report                : rankings, dead-model error breakdown, combo recommendations.

Storage: SQLite benchmark.db + per-session JSONL + per-session full-text .txt dump.
"""

import argparse
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
from collections import Counter

ALIAS_MAP = {
    "ag": "antigravity", "cf": "cloudflare-ai", "gcli": "grok-cli",
    "mrp": "morphllm", "cbai": "codebuddy-intl", "ocz": "opencode-zen",
    "cline-free": "cline-free", "cx": "codex", "cbcn": "codebuddy-cn",
    "kc": "kilocode", "gh": "github", "qd": "qoder", "uk": "unikey",
    "wb": "workbuddy", "th": "tokenharbor", "bai": "bai",
    "orca": "orcarouter", "oc": "opencode",
    "thegrid": "openai-compatible-chat-thegrid",
    "kiosapi": "openai-compatible-chat-kiosapi",
    "cavoti": "openai-compatible-chat-cavoti",
    "xpiki": "openai-compatible-chat-xpiki",
    "atria": "openai-compatible-chat-atria",
    "openrouter": "openrouter", "tokenrouter": "tokenrouter",
    "gemini": "gemini", "nvidia": "nvidia", "minimax": "minimax",
    "cohere": "cohere",
}

PROMPTS = {
    "speed": "Ping test. Reply with exactly the single word: OK",
    "code_easy": (
        "Write a clean idiomatic Python function that reverses a string, plus 3 assertions. "
        "Return ONLY runnable Python code, no markdown fences, no explanation."
    ),
    "code_medium": (
        "Write a production-grade thread-safe Token Bucket rate limiter in Python using threading.Lock. "
        "Methods: allow_request(tokens=1) and wait_for_token(). Include unittest tests. "
        "Return complete runnable code only."
    ),
    "code_hard": (
        "Design and implement a robust distributed advisory lock client in Python over PostgreSQL using pg_locks principles. "
        "Requirements: auto-refresh heartbeat thread, monotonic fencing token, drift calculation, "
        "atomic acquire/release via Lua, crash-safe error handling, plus comprehensive tests. "
        "Return complete runnable code only."
    ),
    "story_horror": (
        "Tulis cerita pendek horor psikologis yang mencekam dalam Bahasa Indonesia, panjang 1500-2000 kata. "
        "Latar: bangsal rumah sakit terbengkalai di pelosok Jawa Tengah, malam hari. "
        "Bangun ketegangan perlahan lewat detail sensorik, atmosfer, monolog batin. Tulis utuh dari awal sampai akhir."
    ),
    "story_life": (
        "Tulis cerita pendek bertema kehidupan/drama sosial yang menyentuh dalam Bahasa Indonesia, 1500-2000 kata. "
        "Latar: pedagang martabak gerobak tua di pinggiran Jakarta yang berjuang membiayai wisuda putrinya. "
        "Gambarkan perjuangan, dialog natural, pesan moral. Tulis utuh tanpa ringkasan."
    ),
    "podcast": (
        "Buat naskah podcast solo berdurasi 20 menit dalam Bahasa Indonesia, sekitar 2000 kata, "
        "tema: 'Bagaimana AI mengubah cara kita bekerja di 2026'. "
        "Format: opening hook, 3 segmen utama dengan transisi natural, closing CTA. "
        "Gaya bicara conversational, ada jeda script [pause], [musik], dan pertanyaan retoris. Tulis naskah lengkap."
    ),
    "copy_socmed": (
        "Buat 3 variasi copywriting postingan Instagram & X untuk grand opening coffee shop vintage di Bandung. "
        "V1 pendek + FOMO/diskon, V2 storytelling ambience, V3 carousel edukasi kopi dengan CTA kuat. "
        "Sertakan hook 3 detik pertama dan hashtag relevan."
    ),
    "copy_reply": (
        "Sebagai tim Customer Experience senior brand e-commerce, buat 2 draf balasan untuk komplain publik: "
        "'Paket pesanan saya ID-998231 belum sampai padahal sudah lewat 7 hari! Pelayanan sangat buruk!'. "
        "Draf 1: balasan komentar publik (singkat, solutif, ajakan DM). "
        "Draf 2: pesan DM lengkap dengan pelacakan ekspedisi dan kompensasi voucher."
    ),
    "tool_call": (
        "You MUST use the provided tool `get_weather` to answer. Do not answer from memory. "
        "Call get_weather with city='Jakarta' now."
    ),
    "compliance": (
        "STRICT OUTPUT CONTRACT: Reply with exactly three lines, nothing else.\n"
        "Line 1 must be the literal text: FORMAT_OK\n"
        "Line 2 must be the word BANANA repeated exactly 3 times separated by single spaces.\n"
        "Line 3 must be the number 42 written in binary.\n"
        "No preamble, no explanation, no markdown, no extra lines."
    ),
    "antihalluc": (
        "Answer ONLY using the provided document. If the answer is not in the document, reply exactly: NOT_FOUND\n\n"
        "DOCUMENT:\n"
        "PT Nusantara Kopi didirikan tahun 1987 di Surabaya.\n"
        "Pendiri: Hadi Wijaya. Jumlah karyawan 2024: 120 orang.\n"
        "Omzet 2024: 8,4 miliar rupiah. Cabang: 7 gerai.\n"
        "END DOCUMENT\n\n"
        "QUESTION: Berapa jumlah karyawan PT Nusantara Kopi dan siapa direktur utamanya?"
    ),
}

# session, prompt-key, max_tokens, timeout, workers
CAPABILITY_SESSIONS = [
    ("02_coding_easy",   "code_easy",   700,  60,  8),
    ("03_coding_medium", "code_medium", 1800, 90,  8),
    ("04_coding_hard",   "code_hard",   3500, 150, 6),
    ("05_story_horror",  "story_horror", 4000, 180, 6),
    ("06_story_life",    "story_life",   4000, 180, 6),
    ("07_podcast",       "podcast",      4000, 180, 6),
    ("08_copy_socmed",   "copy_socmed",  1200, 60,  8),
    ("09_copy_reply",    "copy_reply",   900,  60,  8),
    ("10_toolcall",      "tool_call",    700,  60,  8),
    ("11_compliance",    "compliance",   400,  60,  8),
    ("12_antihalluc",    "antihalluc",   700,  60,  8),
]


# ─── storage ────────────────────────────────────────────────────────────────
import threading as _threading

_DB_LOCK = _threading.Lock()


class DB:
    def __init__(self, path):
        self.c = sqlite3.connect(path, check_same_thread=False)
        with _DB_LOCK, self.c:
            self.c.execute("""CREATE TABLE IF NOT EXISTS models(
                id TEXT PRIMARY KEY, provider TEXT, owned_by TEXT, run INTEGER,
                alive INTEGER DEFAULT 0, liveness REAL DEFAULT 0,
                avg_ms REAL DEFAULT 0, modality TEXT, error TEXT)""")
            self.c.execute("""CREATE TABLE IF NOT EXISTS speed(
                id INTEGER PRIMARY KEY AUTOINCREMENT, run INTEGER, model TEXT, provider TEXT,
                attempt INTEGER, mode TEXT, ok INTEGER, status INTEGER, ms INTEGER,
                chars INTEGER, error TEXT, body TEXT)""")
            self.c.execute("""CREATE TABLE IF NOT EXISTS capability(
                id INTEGER PRIMARY KEY AUTOINCREMENT, run INTEGER, session TEXT, model TEXT,
                provider TEXT, ok INTEGER, status INTEGER, ms INTEGER, words INTEGER,
                chars INTEGER, content TEXT, error TEXT, body TEXT)""")

    def stream_test(self, run, model, provider, attempt, mode, r):
        with _DB_LOCK, self.c:
            self.c.execute("""INSERT INTO speed(run,model,provider,attempt,mode,ok,status,ms,chars,error,body)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                (run, model, provider, attempt, mode, int(r["ok"]), r["status"], r["ms"],
                 r["chars"], r["error"], r["body"]))

    def cap_test(self, run, sess, model, provider, r):
        with _DB_LOCK, self.c:
            self.c.execute("""INSERT INTO capability(run,session,model,provider,ok,status,ms,words,chars,content,error,body)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
                (run, sess, model, provider, int(r["ok"]), r["status"], r["ms"],
                 r["words"], r["chars"], (r["content"] or "")[:20000], r["error"], r["body"]))

    def upsert_model(self, run, mid, prov, ob, alive, liveness, avg_ms, modality, error):
        with _DB_LOCK, self.c:
            self.c.execute("""INSERT INTO models(id,provider,owned_by,run,alive,liveness,avg_ms,modality,error)
                VALUES(?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET run=excluded.run, alive=excluded.alive,
                liveness=excluded.liveness, avg_ms=excluded.avg_ms,
                modality=excluded.modality, error=excluded.error""",
                (mid, prov, ob, run, int(alive), liveness, avg_ms, modality, error))


# ─── http ───────────────────────────────────────────────────────────────────
def _req(base, key, path, data=None, timeout=60, stream=False):
    url = base.rstrip("/") + path
    payload = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json",
        "User-Agent": "axonrouter-bench/2.0"})
    return urllib.request.urlopen(req, timeout=timeout)


def api(base, key, path, data=None, timeout=60):
    with _req(base, key, path, data, timeout) as r:
        return json.loads(r.read().decode())


def chat_json(base, key, model, prompt, max_tokens, timeout):
    t0 = time.time()
    try:
        res = api(base, key, "/v1/chat/completions", {
            "model": model, "messages": [{"role": "user", "content": prompt}],
            "stream": False, "max_tokens": max_tokens}, timeout)
        ms = int((time.time() - t0) * 1000)
        c = res.get("choices", [{}])[0].get("message", {}).get("content", "") or ""
        return {"ok": True, "status": 200, "ms": ms, "content": c,
                "chars": len(c), "words": len(c.split()), "error": None, "body": None}
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")[:1000]
        except Exception:
            pass
        return {"ok": False, "status": e.code, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": f"HTTP {e.code}: {e.reason}", "body": body}
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"ok": False, "status": 0, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": str(e)[:200], "body": None}


WEATHER_TOOL = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string", "description": "City name"}},
            "required": ["city"],
        },
    },
}]


def _grade_tool_call(content, tool_calls):
    """Compliance grade for the tool-call session."""
    if not tool_calls:
        return False, "no tool_calls emitted", {"tool_calls": 0, "name_ok": False, "args_ok": False}
    tc = tool_calls[0]
    fn = tc.get("function", {}) if isinstance(tc, dict) else {}
    name_ok = fn.get("name") == "get_weather"
    args_ok = False
    try:
        args = json.loads(fn.get("arguments") or "{}")
        args_ok = isinstance(args, dict) and "city" in args
    except Exception:
        args_ok = False
    ok = name_ok and args_ok
    why = "ok" if ok else f"name_ok={name_ok} args_ok={args_ok}"
    return ok, why, {"tool_calls": len(tool_calls), "name_ok": name_ok, "args_ok": args_ok}


def chat_tools(base, key, model, prompt, max_tokens, timeout):
    """Tool-call session: model must call get_weather(city=Jakarta)."""
    t0 = time.time()
    try:
        res = api(base, key, "/v1/chat/completions", {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "tools": WEATHER_TOOL,
            "tool_choice": "auto",
            "stream": False, "max_tokens": max_tokens}, timeout)
        ms = int((time.time() - t0) * 1000)
        msg = res.get("choices", [{}])[0].get("message", {}) or {}
        tc = msg.get("tool_calls") or []
        content = msg.get("content") or ""
        ok, why, detail = _grade_tool_call(content, tc)
        blob = content or ""
        if tc:
            blob = json.dumps(tc)
        return {"ok": ok, "status": 200, "ms": ms, "content": blob,
                "chars": len(blob), "words": len(blob.split()),
                "error": None if ok else why, "body": json.dumps({"tool_calls": tc, "content": content})[:1000],
                "detail": detail}
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")[:1000]
        except Exception:
            pass
        return {"ok": False, "status": e.code, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": f"HTTP {e.code}: {e.reason}", "body": body, "detail": None}
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"ok": False, "status": 0, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": str(e)[:200], "body": None, "detail": None}


_DEPRECATED_RE = __import__("re").compile(
    r"no longer available|not available|has been deprecated|switch to|decommission|sunset", __import__("re").I)


def _grade_compliance(content):
    """3-line contract: FORMAT_OK / BANANA x3 / 101010.
    Distinguishes real non-compliance from upstream model-deprecation notices."""
    if not content:
        return False, "empty", 0
    if _DEPRECATED_RE.search(content) and len(content) < 300:
        return False, "provider_deprecated", 0
    lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
    l1 = lines[0].upper() if lines else ""
    l2 = lines[1].upper() if len(lines) > 1 else ""
    l3 = lines[2] if len(lines) > 2 else ""
    got_fmt = "FORMAT_OK" in l1
    got_banana = l2.split() == ["BANANA"] * 3
    got_bin = l3.replace(" ", "").replace("0b", "") == "101010"
    score = (1 if got_fmt else 0) + (1 if got_banana else 0) + (1 if got_bin else 0)
    return score == 3, f"fmt={got_fmt} banana={got_banana} bin={got_bin} lines={len(lines)}", score


def _grade_antihalluc(content):
    """Doc: employees=120, director NOT named.
    Fabricating a director is the failure signal; a bare NOT_FOUND is a safe refusal."""
    if not content:
        return False, "empty", 0
    if _DEPRECATED_RE.search(content) and len(content) < 300:
        return False, "provider_deprecated", 0
    up = content.upper()
    has_120 = "120" in content
    _re = __import__("re")
    fabricate = (
        _re.search(r"(direktur utama|director)\s*(?:utama)?\s*[:=]?\s*([A-Z][a-zA-Z]{2,})", content)
        or _re.findall(r"direktur utama(?!\s*(?:tidak|belum|tak))", content, _re.I)
    )
    denies = bool("NOT_FOUND" in up or "tidak ditemukan" in content.lower()
                  or "tidak disebut" in content.lower() or "tidak ada" in content.lower()
                  or "tidak tercantum" in content.lower() or "belum" in content.lower())
    if fabricate:
        return False, f"FABRICATED director; emp120={has_120}", 0
    if has_120 and denies:
        return True, "grounded_full (emp + explicit denial)", 2
    if has_120:
        return True, "grounded_partial (emp only, no director claim)", 1
    if denies:
        return True, "safe_refusal (NOT_FOUND, no fabrication)", 1
    return False, f"ungrounded (emp120={has_120} denied={denies} no_fabrication)", 0


def chat_stream(base, key, model, prompt, max_tokens, timeout):
    """Streaming request. Success = at least one SSE delta arrives."""
    t0 = time.time()
    try:
        with _req(base, key, "/v1/chat/completions", {
                "model": model, "messages": [{"role": "user", "content": prompt}],
                "stream": True, "max_tokens": max_tokens}, timeout, stream=True) as r:
            got = 0
            text = []
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if chunk == "[DONE]":
                    break
                try:
                    j = json.loads(chunk)
                except Exception:
                    continue
                d = j.get("choices", [{}])[0].get("delta", {})
                if d.get("content"):
                    got += 1
                    text.append(d["content"])
            ms = int((time.time() - t0) * 1000)
            joined = "".join(text)
            ok = got > 0
            return {"ok": ok, "status": 200, "ms": ms, "content": joined,
                    "chars": len(joined), "words": len(joined.split()),
                    "error": None if ok else "stream produced no content delta", "body": None}
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")[:1000]
        except Exception:
            pass
        return {"ok": False, "status": e.code, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": f"HTTP {e.code}: {e.reason}", "body": body}
    except Exception as e:
        ms = int((time.time() - t0) * 1000)
        return {"ok": False, "status": 0, "ms": ms, "content": None, "chars": 0,
                "words": 0, "error": str(e)[:200], "body": None}


# ─── discovery ──────────────────────────────────────────────────────────────
def active_providers():
    try:
        out = subprocess.check_output([
            "docker", "exec", "axonrouter-postgres", "psql", "-U", "axonrouter",
            "-d", "axonrouter", "-t", "-A", "-c",
            "SELECT DISTINCT provider FROM provider_connections "
            "WHERE is_active = true AND test_status != 'disabled';"]).decode().split()
        return set(out)
    except Exception as e:
        print(f"[warn] PG query failed ({e}); using fallback list")
        return set(ALIAS_MAP.values())


def discover(base, key, providers):
    models = api(base, key, "/v1/models")["data"]
    ok, combs, inact = [], 0, 0
    for m in models:
        ob = m.get("owned_by", "")
        if ob == "combo":
            combs += 1
            continue
        prov = ALIAS_MAP.get(ob, ob)
        if prov in providers:
            ok.append({"id": m["id"], "provider": prov, "owned_by": ob})
        else:
            inact += 1
    return ok, combs, inact


# ─── phases ─────────────────────────────────────────────────────────────────
def p1_liveness(eligible, base, key, db, out, run, reps, workers):
    print(f"\n{'='*84}\n[P1] LIVENESS + SPEED (json mode, {reps} reps, {workers} workers)\n{'='*84}")
    stats = {m["id"]: {"provider": m["provider"], "owned_by": m["owned_by"],
                       "ok": 0, "fail": 0, "ms": [], "err": None, "body": None}
             for m in eligible}
    tasks = [(m, r) for r in range(reps) for m in eligible]
    total = len(tasks)
    done = 0
    t0 = time.time()
    fp = open(os.path.join(out, "p1_liveness.jsonl"), "w")

    def work(t):
        m, rep = t
        return m, rep, chat_json(base, key, m["id"], PROMPTS["speed"], 25, 25)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(work, t) for t in tasks]
        for f in concurrent.futures.as_completed(futs):
            m, rep, r = f.result()
            done += 1
            mid = m["id"]
            db.stream_test(run, mid, m["provider"], rep, "json", r)
            fp.write(json.dumps({"model": mid, "provider": m["provider"], "rep": rep,
                                 "ok": r["ok"], "status": r["status"], "ms": r["ms"],
                                 "error": r["error"], "body": r["body"]}) + "\n")
            fp.flush()
            s = stats[mid]
            if r["ok"]:
                s["ok"] += 1
                s["ms"].append(r["ms"])
            else:
                s["fail"] += 1
                s["err"] = r["error"]
                s["body"] = r["body"]
            if done % 100 == 0 or done == total:
                print(f"  {done}/{total} ({done*100//total}%) {int(time.time()-t0)}s", flush=True)
    fp.close()

    alive, dead = [], []
    for mid, s in stats.items():
        tot = s["ok"] + s["fail"]
        ratio = round(s["ok"] / tot, 2) if tot else 0.0
        avg = round(sum(s["ms"]) / len(s["ms"]), 1) if s["ms"] else 0.0
        e = {"model": mid, "provider": s["provider"], "owned_by": s["owned_by"],
             "liveness": ratio, "avg_ms": avg,
             "min_ms": min(s["ms"]) if s["ms"] else None,
             "max_ms": max(s["ms"]) if s["ms"] else None,
             "error": (f"{s['err']} | {s['body']}" if s["err"] else None)}
        (alive if s["ok"] > 0 else dead).append(e)
    json.dump({"alive": alive, "dead": dead},
              open(os.path.join(out, "p1_summary.json"), "w"), indent=2)
    print(f"\n[P1] alive={len(alive)} dead={len(dead)}")
    return alive, dead


def p2_modality(alive, base, key, db, out, run, workers):
    """One stream call + one json call per alive model -> modality class."""
    print(f"\n{'='*84}\n[P2] MODALITY (stream vs json), {len(alive)} models\n{'='*84}")
    res = {}
    flat = []
    for m in alive:
        flat.append((m, "stream"))
        flat.append((m, "json"))
    done = 0

    def work(t):
        m, mode = t
        if mode == "stream":
            return m, mode, chat_stream(base, key, m["model"], PROMPTS["speed"], 25, 30)
        return m, mode, chat_json(base, key, m["model"], PROMPTS["speed"], 25, 25)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(work, t) for t in flat]
        for f in concurrent.futures.as_completed(futs):
            m, mode, r = f.result()
            done += 1
            db.stream_test(run, m["model"], m["provider"], 0, mode, r)
            d = res.setdefault(m["model"], {"model": m["model"], "provider": m["provider"]})
            d[mode + "_ok"] = r["ok"]
            d[mode + "_err"] = r["error"]
            d[mode + "_ms"] = r["ms"]
            if done % 100 == 0 or done == len(flat):
                print(f"  {done}/{len(flat)}", flush=True)

    for d in res.values():
        s, j = d.get("stream_ok"), d.get("json_ok")
        d["modality"] = "both" if s and j else "stream_only" if s else "json_only" if j else "dead"
    json.dump(list(res.values()), open(os.path.join(out, "p2_modality.json"), "w"), indent=2)
    c = Counter(d["modality"] for d in res.values())
    print(f"[P2] {dict(c)}")
    return res


def capability(session, pkey, models, base, key, db, out, run, max_tokens, timeout, workers):
    print(f"\n{'='*84}\n[P3] {session.upper()}  ({len(models)} models, max_tokens={max_tokens})\n{'='*84}")
    fp = open(os.path.join(out, f"{session}.jsonl"), "w")
    txt_path = os.path.join(out, f"{session}_full")
    os.makedirs(txt_path, exist_ok=True)
    done = 0

    def work(m):
        if session == "10_toolcall":
            return m, chat_tools(base, key, m["model"], PROMPTS[pkey], max_tokens, timeout)
        return m, chat_json(base, key, m["model"], PROMPTS[pkey], max_tokens, timeout)

    def graded(r):
        """Post-process: compliance/antihalluc sessions grade on content, not HTTP."""
        if session == "11_compliance":
            ok, why, score = _grade_compliance(r["content"])
            r["ok"] = bool(r["ok"]) and ok
            r["error"] = None if r["ok"] else why
        elif session == "12_antihalluc":
            ok, why, score = _grade_antihalluc(r["content"])
            r["ok"] = bool(r["ok"]) and ok
            r["error"] = None if r["ok"] else why
        return r

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        for f in concurrent.futures.as_completed([ex.submit(work, m) for m in models]):
            m, r = f.result()
            r = graded(r)
            done += 1
            db.cap_test(run, session, m["model"], m["provider"], r)
            fp.write(json.dumps({"session": session, "model": m["model"], "provider": m["provider"],
                                 "ok": r["ok"], "status": r["status"], "ms": r["ms"],
                                 "words": r["words"], "chars": r["chars"],
                                 "error": r["error"], "body": r["body"]}) + "\n")
            fp.flush()
            if r["ok"] and r["content"]:
                safe = m["model"].replace("/", "_")
                try:
                    with open(os.path.join(txt_path, safe + ".txt"), "w") as tf:
                        tf.write(r["content"])
                except Exception:
                    pass
            st = "OK" if r["ok"] else "FAIL"
            extra = f"{r['words']}w {r['ms']}ms" if r["ok"] else (r["error"] or "")[:45]
            print(f"  [{done}/{len(models)}] {m['model']:<45} {st} {extra}", flush=True)
    fp.close()


# ─── report ─────────────────────────────────────────────────────────────────
def score_alive(e):
    """Composite: faster + more reliable = higher."""
    return (e["liveness"] * 1000) / max(1, e["avg_ms"])


def report(out, run, alive, dead, modality, sessions_done):
    L = []
    def p(s=""):
        L.append(s)
        print(s)

    p("\n" + "#" * 92)
    p(f"   AXONROUTER-X BENCHMARK REPORT — RUN {run}")
    p("#" * 92)

    # dead breakdown
    p(f"\n1. DEAD / UNUSABLE MODELS  ({len(dead)})")
    buckets = Counter()
    for d in dead:
        e = (d["error"] or "").lower()
        if "429" in e or "quota" in e or "exhaust" in e or "rate" in e:
            buckets["429 quota/rate-limit exhausted"] += 1
        elif "402" in e or "credit" in e or "payment" in e or "balance" in e:
            buckets["402 credits depleted"] += 1
        elif "401" in e or "unauth" in e or "invalid" in e or "token" in e:
            buckets["401 auth/token invalid"] += 1
        elif "404" in e or "not found" in e:
            buckets["404 model not found upstream"] += 1
        elif "400" in e or "bad request" in e or "cannot be used" in e:
            buckets["400 wrong endpoint / bad params"] += 1
        elif any(x in e for x in ("500", "502", "503", "504", "524", "internal")):
            buckets["5xx upstream/gateway"] += 1
        else:
            buckets["other"] += 1
    for k, v in buckets.most_common():
        p(f"   - {k:<38}: {v}")
    p("\n   sample (model → error):")
    for d in dead[:15]:
        p(f"   * {d['model']:<46} {(d['error'] or '')[:70]}")

    # modality
    p(f"\n2. MODALITY SUPPORT")
    mc = Counter(v["modality"] for v in modality.values())
    for k in ("both", "stream_only", "json_only", "dead"):
        p(f"   - {k:<14}: {mc.get(k, 0)}")
    so = [v["model"] for v in modality.values() if v["modality"] == "stream_only"]
    if so:
        p("   stream-only (JSON endpoint would fail):")
        for m in so[:20]:
            p(f"     ! {m}")
    jo = [v["model"] for v in modality.values() if v["modality"] == "json_only"]
    if jo:
        p("   json-only (streaming endpoint would fail):")
        for m in jo[:20]:
            p(f"     ! {m}")

    # speed
    ranked = sorted(alive, key=lambda x: -score_alive(x))
    p(f"\n3. SPEED RANKING — TOP 20 (score = liveness×1000/latency)")
    p(f"   {'#':<3} {'model':<46} {'provider':<20} {'avg ms':>8} {'live':>5} {'modality'}")
    for i, m in enumerate(ranked[:20], 1):
        mod = modality.get(m["model"], {}).get("modality", "?")
        p(f"   {i:<3} {m['model']:<46} {m['provider']:<20} {m['avg_ms']:>8.0f} {m['liveness']:>5} {mod}")
    p("\n   SLOWEST 10 (avoid for interactive):")
    for m in ranked[-10:]:
        p(f"   - {m['model']:<46} {m['avg_ms']:>8.0f}ms")

    # capability
    def load(s):
        fp = os.path.join(out, s + ".jsonl")
        if not os.path.exists(fp):
            return []
        return [json.loads(l) for l in open(fp)]

    p("\n4. CODING CAPABILITY (completed = ok && words>80)")
    for s, label in (("02_coding_easy", "easy"), ("03_coding_medium", "medium"), ("04_coding_hard", "hard")):
        rows = [r for r in load(s) if r["ok"] and r["words"] > 80]
        rows.sort(key=lambda x: -x["words"])
        p(f"   [{label}] {len(rows)} models produced code")
        for r in rows[:8]:
            p(f"     {r['model']:<46} {r['words']:>5}w {r['ms']:>6}ms")

    p("\n5. LONG-FORM (target 1500-2000 words)")
    for s, label in (("05_story_horror", "horror"), ("06_story_life", "life"), ("07_podcast", "podcast")):
        rows = [r for r in load(s) if r["ok"]]
        good = [r for r in rows if r["words"] >= 1200]
        good.sort(key=lambda x: -x["words"])
        p(f"   [{label}] ok={len(rows)} reached-1200w={len(good)}")
        for r in good[:8]:
            p(f"     {r['model']:<46} {r['words']:>5}w {r['ms']:>6}ms")

    p("\n6. COPYWRITING")
    for s, label in (("08_copy_socmed", "social-post"), ("09_copy_reply", "cs-reply")):
        rows = [r for r in load(s) if r["ok"] and r["words"] > 40]
        rows.sort(key=lambda x: -x["words"])
        p(f"   [{label}] {len(rows)} models ok")
        for r in rows[:8]:
            p(f"     {r['model']:<46} {r['words']:>5}w {r['ms']:>6}ms")
    p("\n7. TOOL-CALL, COMPLIANCE & ANTI-HALLUCINATION")
    tc = [r for r in load("10_toolcall") if r["ok"]]
    tc_fail = [r for r in load("10_toolcall") if not r["ok"]]
    p(f"   [tool-call] obeyed={len(tc)} refused/malformed={len(tc_fail)}")
    for r in tc[:12]:
        p(f"     OK   {r['model']:<46} {r['ms']:>6}ms")
    for r in tc_fail[:12]:
        p(f"     FAIL {r['model']:<46} {(r['error'] or '')[:44]}")

    comp = [r for r in load("11_compliance") if r["ok"]]
    comp_fail = [r for r in load("11_compliance") if not r["ok"]]
    p(f"   [compliance 3-line contract] passed={len(comp)} failed={len(comp_fail)}")
    for r in comp_fail[:12]:
        p(f"     FAIL {r['model']:<46} {(r['error'] or '')[:44]}")

    ah = [r for r in load("12_antihalluc") if r["ok"]]
    ah_fail = [r for r in load("12_antihalluc") if not r["ok"]]
    p(f"   [anti-hallucination] grounded={len(ah)} hallucinated/ignored={len(ah_fail)}")
    for r in ah_fail[:12]:
        p(f"     FAIL {r['model']:<46} {(r['error'] or '')[:44]}")

    path = os.path.join(out, "final_report.txt")
    open(path, "w").write("\n".join(L))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-key", default="sk-1913e25d85487647-bkjq1z-e0b63207")
    ap.add_argument("--base", default="http://localhost:3777")
    ap.add_argument("--out", default="/root/bench")
    ap.add_argument("--run", type=int, default=1)
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--task-workers", type=int, default=6)
    ap.add_argument("--limit-models", type=int, default=0)
    ap.add_argument("--skip-capability", action="store_true")
    ap.add_argument("--only-sessions", default="",
                    help="comma-separated session names to (re)run; P1/P2 reused from disk when present")
    ap.add_argument("--cap-top", type=int, default=60,
                    help="run capability sessions only on top-N fastest/most-reliable alive models (0=all)")
    ap.add_argument("--report-only", action="store_true",
                    help="regenerate final_report.txt from existing JSONL files without calling any model")
    a = ap.parse_args()

    run_dir = os.path.join(a.out, f"run{a.run}")
    os.makedirs(run_dir, exist_ok=True)
    db = DB(os.path.join(a.out, "benchmark.db"))

    print("#" * 84)
    print(f"   AXONROUTER-X BENCHMARK  —  RUN {a.run}")
    print("#" * 84)
    print(f"base={a.base}  out={run_dir}")

    provs = active_providers()
    eligible, combs, inact = discover(a.base, a.api_key, provs)
    print(f"active providers={len(provs)}  eligible models={len(eligible)}  "
          f"combos skipped={combs}  inactive skipped={inact}")
    if a.limit_models:
        eligible = eligible[:a.limit_models]
        print(f"[limit] {len(eligible)} models")
    json.dump(eligible, open(os.path.join(run_dir, "eligible_models.json"), "w"), indent=2)

    p1_path = os.path.join(run_dir, "p1_summary.json")
    p2_path = os.path.join(run_dir, "p2_modality.json")
    if os.path.exists(p1_path) and os.path.exists(p2_path):
        p1 = json.load(open(p1_path))
        alive, dead = p1["alive"], p1["dead"]
        modality = {d["model"]: d for d in json.load(open(p2_path))}
        print(f"[resume] reusing P1 (alive={len(alive)} dead={len(dead)}) and P2 ({len(modality)}) from disk")
    else:
        alive, dead = p1_liveness(eligible, a.base, a.api_key, db, run_dir, a.run, a.reps, a.workers)
        modality = p2_modality(alive, a.base, a.api_key, db, run_dir, a.run, a.workers)

    # modality gates capability: json_only and both can run json sessions
    cap_models = [m for m in alive
                  if modality.get(m["model"], {}).get("modality") in ("both", "json_only")]
    if a.cap_top > 0:
        cap_models = sorted(cap_models, key=lambda m: -((m["liveness"] * 1000) / max(1, m["avg_ms"])))[:a.cap_top]
    print(f"\ncapability-eligible models (json-capable, top {a.cap_top or 'all'}): {len(cap_models)}")

    sessions_done = []
    wanted = set(a.only_sessions.split(",")) if a.only_sessions else None
    if not a.skip_capability and cap_models:
        # Sessions run CONCURRENTLY: each session has its own worker pool, so
        # the 60-model sweep of a slow long-form session no longer blocks the
        # fast json sessions. SQLite writes go through one connection guarded
        # by check_same_thread=False + implicit locking per INSERT.
        import threading
        lock = threading.Lock()
        def run_session(sess, pkey, mt, to, w):
            capability(sess, pkey, cap_models, a.base, a.api_key, db, run_dir, a.run, mt, to, w)
            with lock:
                sessions_done.append(sess)
        todo_sess = [s for s in CAPABILITY_SESSIONS if not wanted or s[0] in wanted]
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(todo_sess) or 1) as sex:
            futs = [sex.submit(run_session, s, pk, mt, to, w) for s, pk, mt, to, w in todo_sess]
            for f in concurrent.futures.as_completed(futs):
                f.result()

    if a.report_only:
        sess_done = [s[0] for s in CAPABILITY_SESSIONS
                     if os.path.exists(os.path.join(run_dir, s[0] + ".jsonl"))]
        rp = report(run_dir, a.run, alive, dead, modality, sess_done)
        print(f"\nreport: {rp}")
        print(f"db    : {os.path.join(a.out, 'benchmark.db')}")
        return

    # persist model summary
    for m in alive:
        d = modality.get(m["model"], {})
        db.upsert_model(a.run, m["model"], m["provider"], m["owned_by"], 1,
                        m["liveness"], m["avg_ms"], d.get("modality", "?"), None)
    for m in dead:
        db.upsert_model(a.run, m["model"], m["provider"], m["owned_by"], 0, 0, 0, "dead", m["error"])

    rp = report(run_dir, a.run, alive, dead, modality, sessions_done)
    print(f"\nreport: {rp}")
    print(f"db    : {os.path.join(a.out, 'benchmark.db')}")


if __name__ == "__main__":
    main()