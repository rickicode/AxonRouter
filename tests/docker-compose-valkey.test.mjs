// Run: node --test tests/docker-compose-valkey.test.mjs
// Contract test for the built-in Valkey compose overlay and installer wiring.
// These are the checks that catch the "Valkey silently never enabled in
// Docker" failure mode: the client defaults to 127.0.0.1:6379, which inside a
// container is that container's own loopback, so without an explicit URL and a
// reachable peer every worker fails open to private memory.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = new URL("..", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

const overlay = read("docker-compose.valkey.yml");
const prod = read("docker-compose.yml");
const build = read("docker-compose.build.yml");
const envExample = read(".env.example");
const installSh = read("scripts/install.sh");
const installPs1 = read("scripts/install.ps1");
const client = read("src/lib/cache/valkeyClient.js");

function dockerAvailable() {
  try {
    execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function repoRoot() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

function resolveCompose(files, { quiet = false } = {}) {
  const args = ["compose"];
  for (const f of files) args.push("-f", f);
  args.push("config");
  if (quiet) args.push("--quiet");
  return execFileSync("docker", args, {
    cwd: repoRoot(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

test("valkey overlay defines a persisted-free, unpublished Valkey 8 service", () => {
  assert.match(overlay, /^  valkey:$/m, "valkey service block present");
  assert.match(overlay, /image: valkey\/valkey:8-alpine/);
  assert.match(overlay, /container_name: axonrouter-valkey/);
  // Realtime state is reconstructible, so persistence is deliberately disabled.
  assert.match(overlay, /--save/);
  assert.match(overlay, /--appendonly/);
  assert.match(overlay, /--maxmemory-policy/);
  assert.match(overlay, /allkeys-lru/);
  assert.match(overlay, /healthcheck:/);
  assert.match(overlay, /valkey-cli/);
});

test("valkey overlay injects the sibling DNS URL into both app services", () => {
  // The 127.0.0.1 client default resolves to each container's own loopback,
  // so the compose network DNS name must be injected explicitly.
  assert.match(overlay, /VALKEY_URL: \$\{VALKEY_URL:-redis:\/\/valkey:6379\}/);
  for (const svc of ["axonrouter-api", "axonrouter-web"]) {
    assert.ok(overlay.includes(`  ${svc}:`), `${svc} present in overlay`);
  }
  // Two service-level declarations only; the ${VALKEY_URL:-...} interpolation on
  // the same line must not be counted as a second one.
  assert.equal((overlay.match(/^\s+VALKEY_URL: /gm) || []).length, 2);
});

test("valkey dependency is ordered but never blocks app boot (fail-open)", () => {
  // condition: service_healthy without required:false would refuse to start the
  // dashboard when Valkey is sick, contradicting the fail-open contract in
  // src/lib/cache/valkeyClient.js.
  const blocks = overlay.split("depends_on:").slice(1);
  assert.equal(blocks.length, 2, "both app services depend on valkey");
  for (const b of blocks) {
    assert.match(b, /^\s+valkey:/m);
    assert.match(b, /required: false/);
  }
});

test("base compose files stay Valkey-free so memory-only remains the safe default", () => {
  assert.doesNotMatch(prod, /valkey/i);
  assert.doesNotMatch(build, /valkey/i);
});

test("env example documents the VALKEY_* contract", () => {
  for (const key of ["VALKEY_URL", "VALKEY_HOST", "VALKEY_PORT", "VALKEY_PASSWORD", "VALKEY_DB"]) {
    assert.ok(envExample.includes(key), `.env.example mentions ${key}`);
  }
  assert.match(envExample, /redis:\/\/valkey:6379/);
});

test("installers download, select, and wire the valkey overlay", () => {
  assert.match(installSh, /docker-compose\.valkey\.yml/);
  assert.match(installPs1, /docker-compose\.valkey\.yml/);

  // COMPOSE_FILE is assembled from a growing list so the postgres and valkey
  // overlays can both be enabled; a hard-coded string would silently drop one.
  assert.match(installSh, /COMPOSE_OVERLAYS="docker-compose\.yml"/);
  assert.match(installSh, /COMPOSE_OVERLAYS="docker-compose\.yml:docker-compose\.postgres\.yml"/);
  assert.match(installSh, /set_env COMPOSE_FILE "\$COMPOSE_OVERLAYS"/);
  assert.match(installPs1, /\$ComposeOverlays = "docker-compose\.yml"/);
  assert.match(installPs1, /\$ComposeOverlays = "docker-compose\.yml:docker-compose\.postgres\.yml"/);
  assert.match(installPs1, /Set-EnvKey "COMPOSE_FILE" \$ComposeOverlays/);

  // Unattended entry point plus the three-way interactive choice.
  for (const src of [installSh, installPs1]) {
    assert.match(src, /EXTERNAL_VALKEY_URL/, "installer honours EXTERNAL_VALKEY_URL");
    assert.match(src, /VALKEY_URL/, "installer writes VALKEY_URL");
    assert.match(src, /memory-only/, "installer can opt out of Valkey");
  }
});

test("port probe defaults a redis URL to 6379, not 5432", () => {
  assert.match(installSh, /_port="\$\{_port:-6379\}"/);
  assert.match(installPs1, /6379/);
});

test("valkey:// scheme is refused or normalised, never silently mis-parsed", () => {
  // ioredis has no valkey:// scheme: it parses "valkey://host:6380" as
  // host "valkey", port 6379 and reports no error at all.
  assert.match(client, /\^valkeys\?:/, "client detects the valkey scheme");
  assert.match(client, /"rediss:"/, "client normalises valkeys:// to rediss://");
  assert.match(client, /"redis:"/, "client normalises valkey:// to redis://");
  assert.match(installSh, /valkey:\/\/\*\) die/);
  assert.match(installPs1, /valkeys\?:/);
});

test("docker compose resolves every overlay combination", (t) => {
  if (!dockerAvailable()) {
    t.skip("docker compose unavailable");
    return;
  }
  const combos = [
    ["docker-compose.yml"],
    ["docker-compose.yml", "docker-compose.postgres.yml"],
    ["docker-compose.yml", "docker-compose.valkey.yml"],
    ["docker-compose.yml", "docker-compose.postgres.yml", "docker-compose.valkey.yml"],
    ["docker-compose.build.yml", "docker-compose.valkey.yml"],
  ];
  for (const files of combos) {
    resolveCompose(files, { quiet: true });
  }
});

test("resolved compose config wires Valkey into both app containers and exposes no host port", (t) => {
  if (!dockerAvailable()) {
    t.skip("docker compose unavailable");
    return;
  }
  const resolved = resolveCompose(["docker-compose.yml", "docker-compose.valkey.yml"]);
  assert.match(resolved, /^  valkey:$/m, "valkey service present in resolved config");
  assert.match(resolved, /image: valkey\/valkey:8-alpine/);
  assert.equal(
    (resolved.match(/VALKEY_URL: redis:\/\/valkey:6379/g) || []).length,
    2,
    "both app containers receive the sibling DNS URL"
  );

  // The valkey block is last in alphabetical service order; assert nothing
  // published inside it.
  const valkeyResolved = resolved.split(/^  valkey:$/m)[1];
  assert.ok(valkeyResolved, "resolved valkey block");
  assert.doesNotMatch(valkeyResolved, /published:/, "valkey publishes no host port");

  // Baseline without the overlay must create no valkey container at all.
  const baseline = resolveCompose(["docker-compose.yml"]);
  assert.doesNotMatch(baseline, /valkey:6379/);
});
