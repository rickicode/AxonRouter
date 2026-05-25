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
- `unit/settings-r2-ui.test.ts`: unified settings page contracts for R2 controls plus Go router dashboard controls
- `unit/go-router-lifecycle-contract.test.ts`: Go router settings, dashboard status API, enable/disable, host/port updates, restart behavior
- `unit/production-hardening-contract.test.ts`: Go router management auth guard and production hardening docs coverage

## Validation Status

- Main validation: `npm run lint`
- Type validation: `npm run typecheck`
- Test suite: `npm run test`
- Production build: `npm run build`
- Go router build/test: `cd go-router && go test ./... && go build -o /tmp/axonrouter-go-router ./cmd/axonrouter-go-router`

## Notes

- Vitest config lives at `tests/vitest.config.ts`
- Root `vitest.config.ts` re-exports the test workspace config for tooling parity
- Unit tests belong under `tests/unit/`
