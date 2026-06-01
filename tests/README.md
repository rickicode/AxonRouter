# AxonRouter Tests

Unit and contract tests for AxonRouter.

## Running Tests

From the repository root:

```bash
npm test
```

From the `tests/` directory:

```bash
npm test
```

Run the full deterministic suite directly:

```bash
cd tests
npm exec -- vitest run --reporter=verbose
```

Run a targeted contract slice:

```bash
cd tests
npm exec -- vitest run --reporter=verbose unit/modernization-inventory.test.ts unit/dashboard-shell-lightweight.test.ts
```

## Coverage Focus

- `unit/modernization-inventory.test.ts`: no tracked JS-family source files, no nested `tests/tests/unit`, no default legacy product identity strings
- `unit/dashboard-shell-lightweight.test.ts`: persistent dashboard shell stays free of global fetch/polling and legacy runtime prop validation
- `unit/api-routing-efficiency.test.ts`: `/v1` routing latency, translator single-flight init, and no blocking usage-db flushes on the hot path
- `unit/production-hardening-contract.test.ts`: production hardening docs coverage

## Validation Status

- Main validation: `npm run lint`
- Type validation: `npm run typecheck`
- Test suite: `npm run test`
- Production build: `npm run build`

## Notes

- Vitest config lives at `tests/vitest.config.ts`
- Root `vitest.config.ts` re-exports the test workspace config for tooling parity
- Unit tests belong under `tests/unit/`
