import { register } from "node:module";
import { Hono } from "hono";
import assert from "node:assert";
import { loadApiRoutes } from "../src/server/routeLoader.mjs";
import { getAdapter } from "../src/lib/db/driver.js";

// The mandated launch command (`node --import ./gateway/alias-resolver.mjs ...`)
// only *loads* the hooks module; it never installs it. Register the same module
// here so `@/*` and `open-sse/*` specifiers inside src/app/api/**/route.js
// resolve when loadApiRoutes() dynamically imports them (webServer.mjs and
// gateway/server.js do the same). Runs before run() -> loadApiRoutes().
register("../gateway/alias-resolver.mjs", import.meta.url);

async function run() {
  console.log("[E2E] Starting live Hono + Postgres combo verification...");
  const db = await getAdapter();

  const app = new Hono();

  // Add CSRF & Session simulation middleware
  app.use("/api/*", async (c, next) => {
    const authCookie = c.req.header("cookie");
    if (authCookie && authCookie.includes("simulate_session=true")) {
      const method = c.req.method;
      if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
        const csrfCookieMatch = authCookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
        const csrfCookie = csrfCookieMatch ? decodeURIComponent(csrfCookieMatch[1]) : null;
        const csrfHeader = c.req.header("x-csrf-token");
        if (csrfCookie) {
          if (!csrfHeader || csrfHeader !== csrfCookie) {
            return c.json({ error: "CSRF validation failed" }, 403);
          }
        }
      }
    }
    return next();
  });

  // Load all actual API routes dynamically via routeLoader
  await loadApiRoutes(app);
  console.log("[E2E] All API routes loaded onto test Hono app.");

  // Test 1: GET /api/combos (List)
  console.log("[E2E] 1. GET /api/combos");
  const listRes = await app.fetch(new Request("http://localhost/api/combos"));
  assert.strictEqual(listRes.status, 200);
  const initialData = await listRes.json();
  assert(Array.isArray(initialData.combos), "Combos list should be an array");

  // Test 2: POST /api/combos (Create new combo)
  const testComboName = "e2e-val-" + Date.now();
  console.log(`[E2E] 2. POST /api/combos (name: ${testComboName})`);
  const createPayload = {
    name: testComboName,
    models: ["oc/mimo-v2.6-flash-free", "oc/muse-spark-1.3-contributor-free"],
    contextWindow: 128000,
    maxTokens: 16384,
  };
  const createRes = await app.fetch(new Request("http://localhost/api/combos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createPayload),
  }));
  assert.strictEqual(createRes.status, 201);
  const created = await createRes.json();
  assert(created.id, "Created combo must have UUID id");
  assert.strictEqual(created.name, testComboName);
  const testUuid = created.id;

  // Test 3: GET /api/combos/{uuid}
  console.log(`[E2E] 3. GET /api/combos/${testUuid}`);
  const getUuidRes = await app.fetch(new Request(`http://localhost/api/combos/${testUuid}`));
  assert.strictEqual(getUuidRes.status, 200);
  const fetchedByUuid = await getUuidRes.json();
  assert.strictEqual(fetchedByUuid.id, testUuid);

  // Test 4: PUT /api/combos/{uuid} with CSRF simulation: Mismatched token -> 403
  console.log("[E2E] 4a. PUT with mismatched CSRF token -> Expect 403");
  const csrfFailRes = await app.fetch(new Request(`http://localhost/api/combos/${testUuid}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Cookie": "simulate_session=true; csrf_token=secret_token_123",
      "x-csrf-token": "wrong_token_456",
    },
    body: JSON.stringify({
      models: ["oc/mimo-v2.6-flash-free"],
    }),
  }));
  assert.strictEqual(csrfFailRes.status, 403, "Should fail with 403 CSRF error");

  // Test 5: PUT /api/combos/{uuid} with valid CSRF token -> Expect 200 (The exact bug scenario)
  console.log("[E2E] 4b. PUT /api/combos/{uuid} with valid CSRF token -> Expect 200");
  const updatePayload = {
    name: testComboName,
    models: ["oc/mimo-v2.6-flash-free", "gcli/grok-4.7-xhigh"],
    contextWindow: 200000,
    maxTokens: 32000,
  };
  const putRes = await app.fetch(new Request(`http://localhost/api/combos/${testUuid}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Cookie": "simulate_session=true; csrf_token=secret_token_123",
      "x-csrf-token": "secret_token_123",
    },
    body: JSON.stringify(updatePayload),
  }));
  assert.strictEqual(putRes.status, 200, "PUT /api/combos/{uuid} must return 200");
  const updated = await putRes.json();
  assert.deepStrictEqual(updated.models, ["oc/mimo-v2.6-flash-free", "gcli/grok-4.7-xhigh"]);
  assert.strictEqual(updated.contextWindow, 200000);

  // Test 6: GET /api/combos/{name}
  console.log(`[E2E] 5. GET /api/combos/${testComboName}`);
  const getNameRes = await app.fetch(new Request(`http://localhost/api/combos/${testComboName}`));
  assert.strictEqual(getNameRes.status, 200);
  const fetchedByName = await getNameRes.json();
  assert.strictEqual(fetchedByName.id, testUuid);

  // Test 7: PUT /api/combos/{name} (Update using name instead of UUID)
  console.log(`[E2E] 6. PUT /api/combos/${testComboName}`);
  const putNameRes = await app.fetch(new Request(`http://localhost/api/combos/${testComboName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextWindow: 256000,
    }),
  }));
  assert.strictEqual(putNameRes.status, 200);
  const updatedByName = await putNameRes.json();
  assert.strictEqual(updatedByName.contextWindow, 256000);

  // Test 8: PUT upsert combo with slashed name like "team-a/custom-combo"
  const slashName = "test-e2e/" + Date.now();
  console.log(`[E2E] 7. PUT /api/combos/${slashName} (upsert with slash)`);
  const putSlashRes = await app.fetch(new Request(`http://localhost/api/combos/${slashName}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: slashName,
      models: ["auto/coding"],
    }),
  }));
  assert.strictEqual(putSlashRes.status, 201, "Should upsert with 201");
  const slashCombo = await putSlashRes.json();
  assert.strictEqual(slashCombo.name, slashName);

  // Clean up slash combo
  await app.fetch(new Request(`http://localhost/api/combos/${slashCombo.id}`, { method: "DELETE" }));

  // Test 9: DELETE /api/combos/{uuid}
  console.log(`[E2E] 8. DELETE /api/combos/${testUuid}`);
  const delRes = await app.fetch(new Request(`http://localhost/api/combos/${testUuid}`, {
    method: "DELETE",
    headers: {
      "Cookie": "simulate_session=true; csrf_token=secret_token_123",
      "x-csrf-token": "secret_token_123",
    },
  }));
  assert.strictEqual(delRes.status, 200);
  const delBody = await delRes.json();
  assert.strictEqual(delBody.success, true);

  // Test 10: GET /api/combos/{uuid} -> 404
  console.log(`[E2E] 9. Verify 404 for deleted combo`);
  const verifyRes = await app.fetch(new Request(`http://localhost/api/combos/${testUuid}`));
  assert.strictEqual(verifyRes.status, 404);

  console.log("[E2E] ALL COMBO CRUD + CSRF CHECKS PASSED SUCCESSFULLY!");
  process.exit(0);
}

run().catch((err) => {
  console.error("[E2E] Verification failed:", err);
  process.exit(1);
});
