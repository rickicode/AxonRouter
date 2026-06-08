# AGENTS.md - AxonRouter Development Rules

## Rule Priority (Repo Scope)

When instructions conflict, use this priority order:
1. Direct user request in current conversation
2. This repository `AGENTS.md`
3. Global `~/.pi/agent/AGENTS.md`
4. General/default agent behavior

## Product Goal

AxonRouter is a fast, local-first AI routing gateway with a lightweight dashboard, production-safe behavior, and TypeScript-first architecture with no application JS files left behind.

Use `docs/ARCHITECTURE.md` for architecture direction and `docs/DOCS.md` for user-facing setup/runtime behavior before large refactors, feature work, rebrand work, production-readiness changes, test organization changes, or build/test behavior changes.

## Worktree Rules

- Do not revert unrelated user changes.

## Product Identity Rules

- Use **AxonRouter** as the product/dashboard/docs name.
- Use `axonrouter` for package and CLI naming.
- Use `~/.axonrouter` for default local runtime data.
- During refactor, actively rename user-facing and internal project identifiers to AxonRouter/`axonrouter` unless a temporary reference is explicitly needed to locate old code for cleanup.
- Do not copy OmniRoute UX, naming, or product scope.

## Architecture Direction

- Prefer small, focused modules over large mixed-responsibility files.
- Keep route handlers thin; move business logic into `src/lib`, `src/server`, or feature modules.
- Avoid heavy shared barrel imports in dashboard layout, sidebar, header, and high-traffic pages.
- Frontend navigation must stay lightweight: no unnecessary global fetches, polling, or provider-data imports in layout/header/sidebar.
- TypeScript migration is required. Refactor incrementally, but the final state must have no application `.js`/`.jsx` files remaining.
- Add schemas/contracts for new or risky API boundaries when practical.
- Keep the JS `/v1/*` endpoint primary/default on the main AxonRouter server.

## Frontend Performance Rules

- Dashboard layout, header, and sidebar are performance-critical.
- Do not add polling, update checks, large provider maps, or expensive filtering to persistent layout components unless clearly justified.
- Prefer lazy/deferred loading for non-critical modals, diagnostics, logs, health panels, update UI, editors, and log viewers.
- Keep page-level data fetching scoped to the page that needs it.
- Memoize derived navigation/search data when it can re-render frequently.

## UI System Rules

- Build UI using shadcn/ui components and Tailwind CSS utilities only by default.
- Use the `shadcn` skill when adding, modifying, debugging, styling, or composing shadcn/ui components, registries, presets, or related configuration.
- Do not introduce custom UI systems, global component classes, or non-shadcn component libraries unless the user explicitly approves.
- Use Tailwind CSS utility classes directly for frontend styling when practical.
- Keep `globals.css` limited to theme tokens, base styles, CSS variables, and truly shared styles that cannot be expressed cleanly with Tailwind utilities.
- Prefer inline `className` Tailwind composition in React components over adding new global CSS selectors.
- Use semantic Tailwind tokens where available; avoid raw color styling inside reusable UI components unless implementing approved AxonRouter theme accents.
- Follow Tailwind style rules: use `gap-*` instead of `space-*`, `size-*` for square dimensions, `truncate` shorthand, `cn()` for conditional classes, and accessible titles for `Dialog`, `Sheet`, and `Drawer`.

## TypeScript Rules

- All source files under `src` must migrate from `.js/.jsx` to `.ts/.tsx`.
- Shipped routing/runtime code under `open-sse` must migrate to TypeScript where practical.
- Tests should migrate to TypeScript and live under the organized test layout.
- Scripts/bin files should migrate where practical; any retained `.mjs/.cjs` runtime entrypoint must be documented with a reason.
- Do not keep duplicate JS and TS implementations for the same module unless a temporary migration step is actively being completed.
- Final validation must inventory any remaining `.js/.jsx/.mjs/.cjs` files and explain why each remains.

## Test Organization Rules

- Keep unit tests in one dedicated unit-test folder so the test tree stays easy to scan.
- Preferred target is `tests/unit/` for all unit tests; consolidate scattered unit tests into that folder during refactor.
- Avoid adding duplicate nested unit-test folders such as `tests/tests/unit/`.
- Keep integration/e2e/fixtures separate only when they are clearly not unit tests.
- Update test scripts/config globs when moving tests so validation still works.

## Standard Validation Commands

Use these commands unless the user explicitly asks for a narrower scope:
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`

If any command is skipped, state why in the final summary.

## Definition of Done (Per Task/Slice)

A task/slice is done when all applicable items are true:
- Implementation scope requested by user is complete.
- Applicable standard validation commands pass, or skips are explicitly justified.
- No duplicate broken JS/TS implementations remain from the change.
- No commented-out dead code is introduced.
- Relevant tests were run for touched areas when practical.
- Any behavioral or architecture-impacting decision is documented in the summary.

## Commit Policy

Do not commit just because a small edit was made.

Commit only when one coherent feature/refactor slice is complete and stable:

- The slice is functionally complete, not half-migrated.
- The app is not left with duplicate broken JS/TS implementations.
- Relevant lint/typecheck/build/tests have been run, or the reason they were not run is documented.
- Known failures are classified as pre-existing, environmental, or introduced.
- The commit contains one coherent topic and no unrelated cleanup.

If a feature is only partially edited, continue working without committing. Prefer fewer stable, reviewable commits over many tiny incomplete commits.

## Code Quality Rules

- Follow the Standard Validation Commands and Definition of Done for implementation work.
- If lint reports warnings or errors in files touched by the current task, fix those lint issues before handing off whenever practical.
- Keep commits atomic and descriptive.
- Do not revert unrelated user changes.

## AxonRouter Memory Notes Rule

When `basic-memory` MCP is available, keep persistent AxonRouter context there:
- Record enduring architecture decisions, migration milestones, and recurring operator preferences as concise notes/observations.
- Before large refactors or multi-step implementation work, query Basic Memory for relevant prior decisions to avoid regressions.
- If memory conflicts with current repo files, user instructions, or live validation results, treat memory as stale and update/supersede it with the current canonical state.
- Prefer project-scoped memory entries that are specific to AxonRouter conventions and commands.
- When `basic-memory-skills` is installed, prefer skill-driven recall/persist flows first, then raw MCP tool calls for precise operations.
- Use memory entries to track: decision rationale, command conventions, known gotchas, and next-step handoff context.
- After significant Semble, WarpGrep, Serena, or codebase-memory findings, persist durable architecture decisions, gotchas, or follow-up context to Basic Memory.

If `mem0` is configured in the environment:
- Use Mem0 for runtime/user-personalization memory that benefits cloud access.
- Keep AxonRouter engineering knowledge canonical in Basic Memory.
- Avoid duplicating the same AxonRouter decision note in both systems unless the user explicitly requests replication.

Never store secrets or credentials in memory notes.

## Tooling Rules

- Default to an orchestrator workflow: use parallel subagents for implementation, analysis, refactor, and review whenever the work can be safely split.
- For substantial work, launch parallel subagents by default without asking first; normally use 2-10 agents depending on task size, file count, and conflict risk.
- For small, single-file, low-risk edits, subagents are optional.
- For code analysis or codebase investigation, use parallel subagents to inspect different files, modules, or concerns concurrently, then consolidate the findings in the parent agent.
- For refactors or edits across multiple files, assign different files or clearly separated scopes to parallel subagents so migration work proceeds faster with low conflict.
- For review work, use parallel subagents to review different files, diffs, or risk areas concurrently, then return an orchestrated summary with findings ordered by severity.
- Do not use worktree-backed subagent execution in a dirty repository unless the user explicitly asks for it or the repository is first made clean.
- Use the global Code Intelligence Tool Routing policy for Semble, WarpGrep, Serena, codebase-memory, and `rg` selection.
- For broad AxonRouter discovery, prefer Semble first for fast semantic discovery, then Morph codebase search when Semble is unavailable or not the better fit; use Serena for semantic refactors and codebase-memory for graph/impact analysis.
- Do not begin local AxonRouter implementation discovery with `rg` when Semble or WarpGrep can answer the question.
- Use `rg` first only for exact literal matching, regex matching, exhaustive occurrence counting, or deterministic final verification.
- If `rg` is used first for exploratory discovery anyway, treat that as a policy miss and correct course on the next search/refinement step.
- Read the target file before editing.
- Use Morph FastApply for large files, scattered edits, whitespace-sensitive edits, or multi-location refactors after preparing marker-wrapped snippets.
- Use precise native edits for small, exact replacements.
- Do not use FastApply with vague feature intent only; provide concrete code snippets with surrounding anchors.

## AGENTS.md Update Rule

If this repository AGENTS file is changed, mention it explicitly in the final summary so collaborators know behavior policy has changed.

## Repository Hygiene

Do not create or commit machine/session artifacts, including:

- `PLAN.md`, `plans/*.md`, `plans/**/*.md`
- `taskplane-tasks/`, `.ralph/`, `.sisyphus/`
- root `*.log`, `.logs/`
- `context*.md`, `context*.json`, `session*.md`, `state.md`
- `playwright*.md`, `playwright*.log`, `playwright*.json`, `.playwright*/`
- `session-log.md`, `project-map.md`
- `tests/tmp/`, `tester/`

When in doubt, ask: "Is this file needed for someone else to build and run this project?" If no, do not commit it.
