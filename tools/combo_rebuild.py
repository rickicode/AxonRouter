#!/usr/bin/env python3
"""
axonrouter-X Combo Rebuilder
=========================
Reads benchmark output (benchmark.db + session jsonl) and produces:
  1. New built-in auto/* combos (difficulty strategy, tiered by measured capability).
  2. Redundancy report for existing combos (duplicate/dominated members).
  3. Apply mode (--apply) that writes combos + comboStrategies to PostgreSQL.

Usage:
  python3 combo_rebuild.py plan  --out /root/bench --run 2
  python3 combo_rebuild.py apply --out /root/bench --run 2 --dry-run
  python3 combo_rebuild.py apply --out /root/bench --run 2
"""
import argparse, json, os, sqlite3, subprocess

PSQL = ["docker", "exec", "axonrouter-postgres", "psql", "-U", "axonrouter", "-d", "axonrouter", "-t", "-A", "-c"]

# ── model families used as fallback aliases inside tier lists ────────────────
DEEPSEEK_FAMILY = ["deepseek-flash-latest", "deepseek-v4.1-flash"]
GLM_FAMILY = ["glm-latest", "glm-5.3-flash"]
GEMINI_FAMILY = ["gemini-flash-latest", "gemini-3.8-flash"]
CLAUDE_FAMILY = ["claude-latest", "claude-haiku-4-5"]
MIMO_FAMILY = ["mimo-v2.5", "mimo"]
FREE_FAMILY = ["free-model", "muse-spark"]


def sh(args):
    return subprocess.check_output(args).decode().strip()


def load_models(out, run):
    db = sqlite3.connect(os.path.join(out, "benchmark.db"))
    rows = db.execute(
        "SELECT id, provider, alive, liveness, avg_ms, modality, error FROM models WHERE run=?",
        (run,)).fetchall()
    db.close()
    return {r[0]: {"provider": r[1], "alive": bool(r[2]), "liveness": r[3],
                   "avg_ms": r[4], "modality": r[5], "error": r[6]} for r in rows}


def load_session(out, run, session):
    fp = os.path.join(out, f"run{run}", session + ".jsonl")
    if not os.path.exists(fp):
        return {}
    return {json.loads(l)["model"]: json.loads(l) for l in open(fp)}


def pick(models, sessions, out, run, top, min_words=0, prefer_fast=True):
    """Rank alive models by capability score in `sessions`, tie-break on speed."""
    scored = []
    for sess in sessions:
        for m, r in load_session(out, run, sess).items():
            st = models.get(m)
            if not st or not st["alive"]:
                continue
            if not r["ok"] or r["words"] <= min_words:
                continue
            scored.append((m, r["words"], st["avg_ms"], st["liveness"]))
    agg = {}
    for m, w, ms, live in scored:
        d = agg.setdefault(m, {"hits": 0, "words": 0, "ms": ms, "live": live})
        d["hits"] += 1
        d["words"] += w
    rank = sorted(agg.items(),
                  key=lambda kv: (-kv[1]["hits"], -kv[1]["words"], kv[1]["ms"] if prefer_fast else 0))
    return [m for m, _ in rank[:top]]


def build_plan(out, run):
    models = load_models(out, run)
    audit_path = os.path.join(out, "combo_audit.json")
    audit = json.load(open(audit_path)) if os.path.exists(audit_path) else {}

    coding = pick(models, ["02_coding_easy", "03_coding_medium", "04_coding_hard"],
                  out, run, 24, min_words=60)
    writing = pick(models, ["05_story_horror", "06_story_life", "07_podcast"],
                   out, run, 24, min_words=900)
    socmed = pick(models, ["08_copy_socmed", "09_copy_reply"],
                  out, run, 20, min_words=40)

    print("=" * 92)
    print(f"MEASURED TOP MODELS (run {run})")
    print("=" * 92)
    for label, lst in (("CODING", coding), ("WRITING/LONG-FORM", writing), ("SOCIAL/COPY", socmed)):
        print(f"\n{label}:")
        for m in lst:
            st = models[m]
            print(f"  {m:<50} {st['provider']:<20} {st['avg_ms']:>6.0f}ms live={st['liveness']}")

    # Difficulty tiers use measured models where available, family aliases as fallback.
    plan = {
        "auto/coding": {
            "kind": "llm",
            "models": (coding[:12] or FREE_FAMILY) + DEEPSEEK_FAMILY + GLM_FAMILY,
            "strategy": {
                "fallbackStrategy": "difficulty",
                "difficultyPolicy": "balanced",
                "judgeModel": "judge-router",
                "easyModels": (coding[-8:] or FREE_FAMILY) + FREE_FAMILY,
                "mediumModels": (coding[6:16] or GLM_FAMILY) + GLM_FAMILY + DEEPSEEK_FAMILY,
                "hardModels": (coding[:8] or CLAUDE_FAMILY) + CLAUDE_FAMILY + GEMINI_FAMILY,
            },
        },
        "auto/writing": {
            "kind": "llm",
            "models": (writing[:12] or CLAUDE_FAMILY) + CLAUDE_FAMILY + GEMINI_FAMILY,
            "strategy": {
                "fallbackStrategy": "difficulty",
                "difficultyPolicy": "capability_heavy",
                "judgeModel": "judge-router",
                "easyModels": (writing[-8:] or FREE_FAMILY) + FREE_FAMILY,
                "mediumModels": (writing[6:16] or GLM_FAMILY) + GLM_FAMILY,
                "hardModels": (writing[:8] or CLAUDE_FAMILY) + CLAUDE_FAMILY,
            },
        },
        "auto/podcast": {
            "kind": "llm",
            "models": (writing[:10] or CLAUDE_FAMILY) + CLAUDE_FAMILY + GEMINI_FAMILY,
            "strategy": {
                "fallbackStrategy": "difficulty",
                "difficultyPolicy": "capability_heavy",
                "judgeModel": "judge-router",
                "easyModels": (writing[-6:] or GLM_FAMILY) + GLM_FAMILY,
                "mediumModels": (writing[5:14] or GEMINI_FAMILY) + GEMINI_FAMILY,
                "hardModels": (writing[:6] or CLAUDE_FAMILY) + CLAUDE_FAMILY,
            },
        },
        "auto/socmed": {
            "kind": "llm",
            "models": (socmed[:12] or FREE_FAMILY) + FREE_FAMILY,
            "strategy": {
                "fallbackStrategy": "difficulty",
                "difficultyPolicy": "cost_efficient",
                "judgeModel": "judge-router",
                "easyModels": (socmed or FREE_FAMILY)[:10],
                "mediumModels": (socmed or GLM_FAMILY)[:10],
                "hardModels": (socmed or CLAUDE_FAMILY)[:6],
            },
        },
    }
    # also create hyphen aliases (e.g. auto-coding)
    for base in ["auto/coding", "auto/writing", "auto/podcast", "auto/socmed"]:
        alias = base.replace("/", "-")
        plan[alias] = {
            "kind": plan[base]["kind"],
            "models": list(plan[base]["models"]),
            "strategy": dict(plan[base]["strategy"]),
        }
    # de-dup members preserving order
    for name, p in plan.items():
        seen, uniq = set(), []
        for m in p["models"]:
            if m not in seen:
                seen.add(m)
                uniq.append(m)
        p["models"] = uniq
        for k in ("easyModels", "mediumModels", "hardModels"):
            seen, uniq = set(), []
            for m in p["strategy"][k]:
                if m not in seen:
                    seen.add(m)
                    uniq.append(m)
            p["strategy"][k] = uniq

    plan_path = os.path.join(out, "combo_plan.json")
    json.dump(plan, open(plan_path, "w"), indent=2)

    print("\n" + "=" * 92)
    print("PROPOSED auto/* COMBOS")
    print("=" * 92)
    for name, p in plan.items():
        print(f"\n[{name}] members={len(p['models'])} policy={p['strategy']['difficultyPolicy']}")
        print(f"  members: {', '.join(p['models'][:8])}{' …' if len(p['models']) > 8 else ''}")
        for k in ("easyModels", "mediumModels", "hardModels"):
            print(f"  {k:<14}: {', '.join(p['strategy'][k][:6])}")

    # ---- redundancy report ----
    print("\n" + "=" * 92)
    print("REDUNDANCY REPORT (existing combos)")
    print("=" * 92)
    raw = sh(PSQL + ["SELECT name||'|'||models::text FROM combos ORDER BY name;"])
    members = {}
    for line in raw.splitlines():
        if "|" in line:
            n, js = line.split("|", 1)
            try:
                members[n] = json.loads(js)
            except Exception:
                members[n] = []
    # identical member sets
    sig = {}
    for n, ms in members.items():
        sig.setdefault(tuple(sorted(ms)), []).append(n)
    for ms, names in sig.items():
        if len(names) > 1:
            print(f"\n  DUPLICATE MEMBERS ({len(names)} combos): {', '.join(names)}")
            print(f"     → {', '.join(ms[:6])}")
    # dead members
    print("\n  COMBOS CONTAINING DEAD MEMBERS:")
    for n, ms in sorted(members.items()):
        dead = [m for m in ms if m in models and not models[m]["alive"]]
        if dead:
            print(f"   [{n}] dead={len(dead)}/{len(ms)}: {', '.join(dead[:5])}")

    print(f"\nplan: {plan_path}")
    return plan


def apply_plan(out, plan, dry):
    sql_combos = []
    for name, p in plan.items():
        js = json.dumps(p["models"])
        sql_combos.append(
            f"INSERT INTO combos (id, name, kind, models) VALUES ('{name}', '{name}', '{p['kind']}', '{js}'::jsonb) "
            f"ON CONFLICT (name) DO UPDATE SET models = EXCLUDED.models, kind = EXCLUDED.kind, updated_at = NOW();")

    strat = sh(PSQL + ["SELECT data->'comboStrategies' FROM settings LIMIT 1;"])
    try:
        cs = json.loads(strat) if strat else {}
    except Exception:
        cs = {}
    for name, p in plan.items():
        cs[name] = {k: v for k, v in p["strategy"].items() if v}
    sql_strategy = ("UPDATE settings SET data = jsonb_set(data, '{comboStrategies}', "
                    f"'{json.dumps(cs)}'::jsonb) WHERE id = 1;")

    print("\n" + "=" * 92)
    print("SQL TO APPLY")
    print("=" * 92)
    for s in sql_combos:
        print(s)
    print(sql_strategy)

    if dry:
        print("\n[dry-run] nothing applied")
        return

    for s in sql_combos:
        subprocess.check_call(PSQL + [s])
    subprocess.check_call(PSQL + [sql_strategy])
    print("\n[applied] combos + comboStrategies written")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["plan", "apply"])
    ap.add_argument("--out", default="/root/bench")
    ap.add_argument("--run", type=int, default=2)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    plan = build_plan(a.out, a.run) if a.cmd == "plan" else json.load(open(os.path.join(a.out, "combo_plan.json")))
    if a.cmd == "apply":
        apply_plan(a.out, plan, a.dry_run)


if __name__ == "__main__":
    main()