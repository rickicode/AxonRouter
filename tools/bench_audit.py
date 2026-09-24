#!/usr/bin/env python3
"""
axonrouter-X Combo Audit + Run Comparison
=====================================
Usage:
  python3 bench_audit.py compare --out /root/bench --r1 1 --r2 2
  python3 bench_audit.py combos  --out /root/bench --run 2

`compare`  : diff two runs (latency delta, liveness delta, flaky/newly-dead).
`combos`   : audit every DB combo against the latest run — dead members,
             redundancy (duplicate members across combos), and suggested
             replacements per purpose (coding / writing / socmed / podcast).
"""
import argparse, json, os, sqlite3, subprocess, sys
from collections import Counter, defaultdict

PSQL = ["docker", "exec", "axonrouter-postgres", "psql", "-U", "axonrouter", "-d", "axonrouter", "-t", "-A", "-c"]


def sh(args):
    return subprocess.check_output(args).decode().strip()


def load_combo_names():
    raw = sh(PSQL + ["SELECT name FROM combos ORDER BY name;"])
    return [l for l in raw.splitlines() if l]


def load_combo_members():
    """name -> list of leaf models (nested combo refs resolved)."""
    raw = sh(PSQL + ["SELECT name||'|'||models::text FROM combos ORDER BY name;"])
    direct = {}
    for line in raw.splitlines():
        if "|" not in line:
            continue
        name, models = line.split("|", 1)
        try:
            direct[name] = json.loads(models)
        except Exception:
            direct[name] = []

    def resolve(name, seen=None):
        seen = seen or set()
        if name in seen:
            return []
        seen.add(name)
        out = []
        for m in direct.get(name, []):
            if m in direct:
                out.extend(resolve(m, seen))
            else:
                out.append(m)
        return out

    return {n: resolve(n) for n in direct}


def latest_run_models(out, run):
    """model -> {alive, liveness, avg_ms, modality} for one run.
    Primary source: per-run p1_summary.json + p2_modality.json (immutable).
    Falls back to benchmark.db only when the JSON files are missing."""
    res = {}
    p1 = os.path.join(out, f"run{run}", "p1_summary.json")
    p2 = os.path.join(out, f"run{run}", "p2_modality.json")
    if os.path.exists(p1):
        d = json.load(open(p1))
        for m in d.get("alive", []):
            res[m["model"]] = {"provider": m["provider"], "alive": True,
                               "liveness": m.get("liveness", 1.0), "avg_ms": m.get("avg_ms", 0),
                               "modality": "?"}
        for m in d.get("dead", []):
            res[m["model"]] = {"provider": m.get("provider", "?"), "alive": False,
                               "liveness": 0.0, "avg_ms": 0, "modality": "dead"}
        if os.path.exists(p2):
            for m in json.load(open(p2)):
                if m["model"] in res:
                    res[m["model"]]["modality"] = m.get("modality", "?")
        return res
    db = sqlite3.connect(os.path.join(out, "benchmark.db"))
    rows = db.execute(
        "SELECT id, provider, alive, liveness, avg_ms, modality FROM models WHERE run=?",
        (run,)).fetchall()
    db.close()
    return {r[0]: {"provider": r[1], "alive": bool(r[2]), "liveness": r[3],
                   "avg_ms": r[4], "modality": r[5]} for r in rows}


def load_session(out, run, session):
    fp = os.path.join(out, f"run{run}", session + ".jsonl")
    if not os.path.exists(fp):
        return {}
    res = {}
    for line in open(fp):
        r = json.loads(line)
        res[r["model"]] = r
    return res


CODING_SESSIONS = ["02_coding_easy", "03_coding_medium", "04_coding_hard"]
LONG_SESSIONS = ["05_story_horror", "06_story_life", "07_podcast"]
COPY_SESSIONS = ["08_copy_socmed", "09_copy_reply"]


def score_for(out, run, model, sessions, min_words=0):
    """Sum of session successes weighted by words; 0 if never ran."""
    s = 0
    for sess in sessions:
        r = load_session(out, run, sess).get(model)
        if r and r["ok"] and r["words"] > min_words:
            s += 1 + min(r["words"], 3000) / 3000.0
    return s


def cmd_compare(a):
    r1 = latest_run_models(a.out, a.r1)
    r2 = latest_run_models(a.out, a.r2)
    print("=" * 90)
    print(f"RUN {a.r1} vs RUN {a.r2} COMPARISON")
    print("=" * 90)
    common = sorted(set(r1) & set(r2))
    print(f"models in run{a.r1}: {len(r1)}  run{a.r2}: {len(r2)}  common: {len(common)}")

    newly_dead, newly_alive, flaky, faster, slower = [], [], [], [], []
    for m in common:
        d1, d2 = r1[m], r2[m]
        if d1["alive"] and not d2["alive"]:
            newly_dead.append(m)
        elif not d1["alive"] and d2["alive"]:
            newly_alive.append(m)
        if d1["alive"] and d2["alive"]:
            if d1["liveness"] < 1.0 or d2["liveness"] < 1.0:
                flaky.append((m, d1["liveness"], d2["liveness"]))
            if d1["avg_ms"] and d2["avg_ms"]:
                delta = d2["avg_ms"] - d1["avg_ms"]
                pct = delta / d1["avg_ms"] * 100
                if pct <= -15:
                    faster.append((m, d1["avg_ms"], d2["avg_ms"], pct))
                elif pct >= 15:
                    slower.append((m, d1["avg_ms"], d2["avg_ms"], pct))

    print(f"\nNEWLY DEAD in run{a.r2} ({len(newly_dead)}):")
    for m in newly_dead[:40]:
        print(f"  - {m:<50} {r2[m]['provider']}")
    print(f"\nNEWLY ALIVE in run{a.r2} ({len(newly_alive)}):")
    for m in newly_alive[:40]:
        print(f"  + {m:<50} {r2[m]['provider']}")
    print(f"\nFLAKY (liveness<100% in either run) ({len(flaky)}):")
    for m, l1, l2 in flaky[:40]:
        print(f"  ~ {m:<50} r1={l1:.2f} r2={l2:.2f}")
    print(f"\nSIGNIFICANTLY FASTER in run{a.r2} ({len(faster)}):")
    for m, a1, a2, pct in sorted(faster, key=lambda x: x[3])[:25]:
        print(f"  ↓ {m:<50} {a1:.0f}→{a2:.0f}ms ({pct:+.0f}%)")
    print(f"\nSIGNIFICANTLY SLOWER in run{a.r2} ({len(slower)}):")
    for m, a1, a2, pct in sorted(slower, key=lambda x: -x[3])[:25]:
        print(f"  ↑ {m:<50} {a1:.0f}→{a2:.0f}ms ({pct:+.0f}%)")


def cmd_combos(a):
    run = a.run
    models = latest_run_models(a.out, run)
    members = load_combo_members()
    print("=" * 92)
    print(f"COMBO AUDIT  (against run {run}: {len(models)} models)")
    print("=" * 92)

    # ---- per-combo dead members ----
    dead_by_combo = {}
    for combo, leaves in sorted(members.items()):
        if combo in leaves or not leaves:
            continue  # self-referential / empty
        dead = [m for m in leaves if m in models and not models[m]["alive"]]
        unknown = [m for m in leaves if m not in models]
        dead_by_combo[combo] = (dead, unknown)
    print("\n1. COMBOS WITH DEAD MEMBERS")
    for combo, (dead, unknown) in sorted(dead_by_combo.items(), key=lambda x: -len(x[1][0])):
        if not dead and not unknown:
            continue
        print(f"\n  [{combo}]  members={len(members[combo])} dead={len(dead)} unknown={len(unknown)}")
        for m in dead[:12]:
            print(f"     DEAD  {m:<48} {models[m]['provider']}")

    # ---- redundancy: members used by many combos ----
    usage = Counter()
    for combo, leaves in members.items():
        for m in set(leaves):
            usage[m] += 1
    print("\n2. MOST REUSED MEMBERS (redundancy candidates)")
    for m, c in usage.most_common(25):
        st = models.get(m)
        status = "dead" if (st and not st["alive"]) else f"{st['avg_ms']:.0f}ms" if st else "not-tested"
        print(f"   {c:>3}x {m:<50} {status}")

    # ---- purpose rankings ----
    def rank(sessions, label, min_words=0):
        scored = []
        for m, st in models.items():
            if not st["alive"]:
                continue
            s = score_for(a.out, run, m, sessions, min_words)
            if s > 0:
                scored.append((m, s, st))
        scored.sort(key=lambda x: -x[1])
        print(f"\n   TOP 12 — {label}")
        for m, s, st in scored[:12]:
            print(f"     {s:5.1f}  {m:<48} {st['provider']:<20} {st['avg_ms']:>6.0f}ms")
        return [m for m, _, _ in scored]

    print("\n3. PURPOSE RANKING (from benchmark sessions)")
    coding = rank(CODING_SESSIONS, "CODING (easy+medium+hard)")
    longform = rank(LONG_SESSIONS, "LONG-FORM (story+podcast)")
    copyw = rank(COPY_SESSIONS, "SOCIAL/COPY")

    dead_models = sorted(m for m, st in models.items() if not st["alive"])
    with open(os.path.join(a.out, "combo_audit.json"), "w") as f:
        json.dump({
            "dead_by_combo": {k: v[0] for k, v in dead_by_combo.items()},
            "usage_counts": dict(usage),
            "coding_rank": coding,
            "longform_rank": longform,
            "copy_rank": copyw,
            "dead_models": dead_models,
        }, f, indent=2)
    print(f"\nwrote {os.path.join(a.out, 'combo_audit.json')}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["compare", "combos"])
    ap.add_argument("--out", default="/root/bench")
    ap.add_argument("--run", type=int, default=2)
    ap.add_argument("--r1", type=int, default=1)
    ap.add_argument("--r2", type=int, default=2)
    a = ap.parse_args()
    (cmd_compare if a.cmd == "compare" else cmd_combos)(a)


if __name__ == "__main__":
    main()