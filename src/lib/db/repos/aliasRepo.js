import { getAdapter } from "../driver.js";
import { parseJson } from "../helpers/jsonCol.js";
import { getCatalog, invalidateCatalog } from "@/lib/cache/client.js";

const MODEL_ALIASES_SCOPE = "modelAliases";
const CUSTOM_MODELS_SCOPE = "customModels";
const ALIAS_CACHE_KEY = "axon:catalog:aliases";

async function getAll(scope) {
  const db = await getAdapter();
  const rows = await db.all("SELECT key, value FROM kv WHERE scope = $1", [scope]);
  const result = {};
  for (const row of rows) result[row.key] = parseJson(row.value, row.value);
  return result;
}

async function getValue(scope, key, fallback = null) {
  const db = await getAdapter();
  const row = await db.get("SELECT value FROM kv WHERE scope = $1 AND key = $2", [scope, key]);
  return row ? parseJson(row.value, fallback) : fallback;
}

async function setValue(scope, key, value) {
  const db = await getAdapter();
  const rawValue = typeof value === "string" && (value.startsWith("{") || value.startsWith("["))
    ? parseJson(value, value)
    : (value ?? null);
  await db.run(
    `INSERT INTO kv(scope, key, value)
     VALUES($1, $2, $3)
     ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
    [scope, key, rawValue],
  );
}

async function removeValue(scope, key) {
  const db = await getAdapter();
  await db.run("DELETE FROM kv WHERE scope = $1 AND key = $2", [scope, key]);
}

export async function getModelAliases() {
  return getCatalog(ALIAS_CACHE_KEY, 300, () => getAll(MODEL_ALIASES_SCOPE));
}

export async function setModelAlias(alias, model) {
  await setValue(MODEL_ALIASES_SCOPE, alias, model);
  invalidateCatalog(ALIAS_CACHE_KEY).catch(() => {});
}

export async function deleteModelAlias(alias) {
  await removeValue(MODEL_ALIASES_SCOPE, alias);
  invalidateCatalog(ALIAS_CACHE_KEY).catch(() => {});
}

function customKey(providerAlias, id, type) {
  return `${providerAlias}|${id}|${type}`;
}

export async function getCustomModels() {
  const all = await getAll(CUSTOM_MODELS_SCOPE);
  return Object.values(all);
}

export async function addCustomModel({ providerAlias, id, type = "llm", name, caps }) {
  const key = customKey(providerAlias, id, type);
  const db = await getAdapter();
  let added = false;

  await db.transaction(async (tx) => {
    const row = await tx.get(
      "SELECT value FROM kv WHERE scope = $1 AND key = $2",
      [CUSTOM_MODELS_SCOPE, key],
    );

    if (row) {
      const previous = parseJson(row.value, {}) || {};
      const next = {
        ...previous,
        ...(name ? { name } : {}),
        ...(caps ? { caps } : {}),
      };
      await tx.run(
        "UPDATE kv SET value = $1 WHERE scope = $2 AND key = $3",
        [next, CUSTOM_MODELS_SCOPE, key],
      );
      return;
    }

    const value = {
      providerAlias,
      id,
      type,
      name: name || id,
      ...(caps ? { caps } : {}),
    };
    await tx.run(
      "INSERT INTO kv(scope, key, value) VALUES($1, $2, $3)",
      [CUSTOM_MODELS_SCOPE, key, value],
    );
    added = true;
  });

  return added;
}

export async function deleteCustomModel({ providerAlias, id, type = "llm" }) {
  await removeValue(CUSTOM_MODELS_SCOPE, customKey(providerAlias, id, type));
}
