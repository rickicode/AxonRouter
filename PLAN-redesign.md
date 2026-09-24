# Dashboard redesign

Source of truth for the console. Landing (`src/app/landing`, `#f97815`) stays separate.

## Look

Dark-only. No light mode.

| Token | Value |
|---|---|
| primary (brand) | `#06B6D4` |
| accent | `#22D3EE` |
| bg | `#000000` |
| surface | `#121212` |
| sidebar | `#0A0A0A` |
| border | `#2A2A2A` |
| radius | 4px (`rounded-sm`) |

No coral, no cream, no traffic lights. Dark-only; no light mode.

## Scope

1. `src/app/globals.css` tokens. Every page using `bg-surface`, `border-border`, `text-text-main`, `bg-primary` follows.
2. Shell: `Sidebar.js`, `Header.js`, `DashboardLayout.js`.
3. Controls: `Button`, `Card`, `Input`, `Select`, `Combobox`, `Modal`, `Drawer`, `SegmentedControl`. Radius `rounded-sm` only.
4. Then each dashboard `page.js`. Strip leftover `bg-white`, raw hex, and `rounded-[Npx]`.
5. Copy stays English source keys through `translate()`. `id.json` gets real Indonesian. Other locales keep the English key until a real translation exists.

## Pages to check

`dashboard`, `endpoint`, `providers`, `providers/new`, `providers/[id]`, `combos`, `usage`, `benchmark`, `quota`, `token-saver`, `proxy-fitness`, `cli-tools`, `cli-tools/[toolId]`, `console-log`, `translator`, `proxy-pools`, `skills`, `profile`, `mitm`, `pxpipe`, `media-providers` kind, id, web, combo, `basic-chat`.

## Out

No API, route, or logic changes. No landing restyle. No commit until asked.

## Done when

- No coral, cream, or traffic lights anywhere in the console.
- benchmark cleaned (no coral/cream/traffic-light leftovers).
- a11y tests pass (`tests/unit/keyboard-a11y-p1.test.mjs`, `tests/unit/usage-harden-p2.test.mjs`, `tests/unit/endpoint-a11y.test.mjs`).
- `globals.css` has no `#E56A4A` or `#FDFAF6`.
- Sidebar has no `#FF5F56`.
- Dashboard and shared UI have no `rounded-[10px]`, `rounded-[14px]`, or `bg-[#FF5F56]`.
- Logger test `tests/unit/usage-sse-backoff-logger-json.test.mjs` still passes.
