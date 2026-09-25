// Run: node --test tests/docker-build.test.mjs
// Static cache/runtime contract; actual image checks still require Docker.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const runtime = dockerfile.split('AS runtime-deps\n')[1]?.split('FROM runtime-deps AS runner')[0];
const runner = dockerfile.split('FROM runtime-deps AS runner')[1];

test('runtime deps stay independent of app source and build output', () => {
  assert.ok(runtime, 'runtime-deps stage exists');
  assert.doesNotMatch(runtime, /^COPY|--from=builder/m);
  assert.equal((runtime.match(/^RUN /gm) || []).length, 1, 'single utility layer');
  assert.match(runtime, /gosu curl tar ca-certificates iptables/);
  assert.doesNotMatch(runtime, /devin|tailscale|cloudflared/i);
});

test('runner entrypoint, health check, traced dependencies and npm cache remain', () => {
  for (const path of ['dist', 'public', 'src', 'open-sse', 'gateway', 'server.js', 'node_modules/node-machine-id']) {
    assert.ok(runner.includes(`COPY --from=builder /app/${path} `), path);
  }
  assert.doesNotMatch(runner, /src\/mitm|node-forge/);
  assert.match(runner, /ENTRYPOINT \["\/entrypoint\.sh"\]/);
  assert.match(runner, /EXPOSE 3777/);
  assert.match(runner, /127\.0\.0\.1:3777\/api\/health/);
  assert.match(runner, /CMD \["node", "--max-old-space-size=1024", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "src\/server\/webServer\.mjs"\]/);
  assert.match(dockerfile, /--mount=type=cache,target=\/root\/\.npm/);
});
