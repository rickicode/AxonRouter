# MIBP selective port + CodeBuddy Intl scope (2026-09-10)

## Orientation
Target /workspaces/axonrouter-X: Next.js JS, PostgreSQL SSOT, registry-driven providers. Read CLAUDE.md and open-sse/AGENTS.md. Basic Memory and OpenLore unavailable; this file records orientation. Reference /workspaces/axonrouter-mibp-version at 8b34cfaa. Do NOT wholesale merge: target already includes newer decolua and custom Freebuff executor, DB/cache changes.
Existing dirty mobile analytics/Card/.serena changes are unrelated and must remain untouched.

## Scope
Selectively adapt MIBP 9cd61d58 and 9c17c5f9 Freebuff catalog/offer/Freebucks/quota improvements, preserve target retry/proxy/token/PG safeguards. Assess 06c66d8d and a2c6187a Docker reproducibility fixes against target before applying equivalent change; do not downgrade dependencies or copy lock wholesale. Skip fork version bumps.
Add CodeBuddy Intl glm-5.3, kimi-k3, hy3 (live upstream generated OK). Preserve current entries unless verified obsolete. No invented capabilities. Claude candidates require direct live checks; do not register rejected IDs.

## Acceptance
Runnable focused tests cover imported Freebuff behavior and CodeBuddy registry/capability parity, relevant unit suite and npm build pass or preexisting failures documented. Diff excludes unrelated existing changes. Report imported/skipped commits with reasons. No secrets in logs/files/reports. No deploy or push without orchestrator review. No permanent deletion outside /tmp. Prefer ast-grep then comby then structural patch. No Claude runner per user's explicit instruction.
