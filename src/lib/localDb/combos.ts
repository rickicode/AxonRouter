import { v4 as uuidv4 } from "uuid";
import { normalizeComboRecord } from "../combos/steps";
import { normalizeRoutingStrategy as normalizeComboStrategyValue } from "../../shared/constants/routingStrategies";
import {
  getDb,
  withLocalDbMutex,
  safeRead,
  persistDbWrite,
} from "./core";

function getComboNameSet(combos = [], extraNames = []) {
  const names = new Set();

  for (const combo of combos) {
    const name = typeof combo?.name === "string" ? combo.name.trim() : "";
    if (name) names.add(name);
  }

  for (const name of extraNames) {
    if (typeof name === "string" && name.trim()) names.add(name.trim());
  }

  return names;
}

function getNextComboSortOrder(combos = []) {
  const maxSortOrder = combos.reduce((max, combo) => {
    const value = Number(combo?.sortOrder);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return maxSortOrder + 1;
}

function normalizeStoredComboRecord(combo, combos = [], extraNames = []) {
  const normalized = normalizeComboRecord(combo, {
    allCombos: getComboNameSet(combos, extraNames),
  });

  return {
    ...normalized,
    strategy: normalizeComboStrategyValue(normalized.strategy),
    config:
      normalized.config && typeof normalized.config === "object" && !Array.isArray(normalized.config)
        ? normalized.config
        : {},
    isHidden: Boolean(normalized.isHidden),
    sortOrder: Number.isFinite(Number(normalized.sortOrder)) ? Number(normalized.sortOrder) : 0,
    priority: Number.isFinite(Number(normalized.priority)) ? Number(normalized.priority) : 0,
  };
}

async function ensureDefaultCombos(db) {
  if (!db?.data) return [];
  if (!Array.isArray(db.data.combos)) db.data.combos = [];
  if (db.data.combos.length === 0) {
    return db.data.combos;
  }

  const comboNames = getComboNameSet(db.data.combos);
  db.data.combos = db.data.combos.map((combo) =>
    normalizeStoredComboRecord(combo, db.data.combos, [...comboNames])
  );
  return db.data.combos;
}

export async function getCombos() {
  const db = await getDb();
  await ensureDefaultCombos(db);
  return (db.data.combos || [])
    .map((combo) => normalizeStoredComboRecord(combo, db.data.combos || []))
    .sort((left, right) => {
      const leftOrder = Number(left.sortOrder) || 0;
      const rightOrder = Number(right.sortOrder) || 0;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
}

export async function getComboById(id) {
  const combos = await getCombos();
  return combos.find((combo) => combo.id === id) || null;
}

export async function getComboByName(name) {
  const combos = await getCombos();
  return combos.find((combo) => combo.name === name) || null;
}

export async function createCombo(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid combo data");
  if (!data.name || typeof data.name !== "string") throw new Error("name is required");
  if (!Array.isArray(data.models) || data.models.length === 0) throw new Error("models array is required");

  const db = await getDb();
  let combo;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.combos)) db.data.combos = [];

    const existingByName = db.data.combos.find((c) => c.name === data.name && c.id !== (typeof data.id === "string" && data.id.trim() ? data.id : ""));
    if (existingByName) {
      throw new Error("Combo name already exists");
    }

    // Check user-supplied ID uniqueness
    const suppliedId = typeof data.id === "string" && data.id.trim() ? data.id.trim() : null;
    if (suppliedId && db.data.combos.some((c) => c.id === suppliedId)) {
      throw new Error("Combo ID already exists");
    }

    const now = new Date().toISOString();
    combo = normalizeStoredComboRecord(
      {
        id: typeof data.id === "string" && data.id.trim() ? data.id : uuidv4(),
        name: data.name,
        models: data.models || [],
        strategy: data.strategy || "priority",
        config: data.config || {},
        allowedProviders: Array.isArray(data.allowedProviders) ? data.allowedProviders : [],
        system_message: typeof data.system_message === "string" ? data.system_message : "",
        tool_filter_regex: typeof data.tool_filter_regex === "string" ? data.tool_filter_regex : "",
        context_cache_protection: Boolean(data.context_cache_protection),
        context_length: Number.isFinite(Number(data.context_length)) ? Number(data.context_length) : undefined,
        isHidden: Boolean(data.isHidden),
        priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0,
        sortOrder: Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : getNextComboSortOrder(db.data.combos),
        createdAt: now,
        updatedAt: now,
      },
      db.data.combos,
      [data.name]
    );

    db.data.combos.push(combo);
    await persistDbWrite(db);
  });
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.combos)) db.data.combos = [];

    const index = db.data.combos.findIndex((combo) => combo.id === id);
    if (index === -1) return;

    const current = db.data.combos[index] || {};
    const nextName = typeof data.name === "string" && data.name.trim() ? data.name.trim() : current.name;

    if (nextName !== current.name) {
      const existingByName = db.data.combos.find((c) => c.name === nextName && c.id !== id);
      if (existingByName) {
        throw new Error("Combo name already exists");
      }
    }

    const merged = {
      ...current,
      ...data,
      name: nextName,
      priority: data.priority !== undefined
        ? (Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0)
        : (Number.isFinite(Number(current.priority)) ? Number(current.priority) : 0),
      sortOrder: data.sortOrder !== undefined
        ? (Number.isFinite(Number(data.sortOrder)) ? Number(data.sortOrder) : getNextComboSortOrder(db.data.combos))
        : current.sortOrder,
      updatedAt: new Date().toISOString(),
    };

    db.data.combos[index] = normalizeStoredComboRecord(merged, db.data.combos, [nextName]);
    await persistDbWrite(db);
    result = db.data.combos[index];
  });
  return result;
}

/**
 * Atomically rename a combo and update all dependent combo-ref steps in a single mutex call.
 * Prevents inconsistent state if any part fails.
 */
export async function renameComboWithDependents(id, updateData, oldName, newName) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.combos)) db.data.combos = [];

    const index = db.data.combos.findIndex((combo) => combo.id === id);
    if (index === -1) return;

    const existingByName = db.data.combos.find((c) => c.name === newName && c.id !== id);
    if (existingByName) {
      throw new Error("Combo name already exists");
    }

    const now = new Date().toISOString();

    // Update all dependent combos' combo-ref steps
    for (let i = 0; i < db.data.combos.length; i++) {
      if (db.data.combos[i].id === id) continue;
      const combo = db.data.combos[i];
      if (!Array.isArray(combo?.models)) continue;
      let changed = false;
      const updatedModels = combo.models.map((step) => {
        if (!step || typeof step !== "object") return step;
        if (step.kind === "combo-ref" && typeof step.comboName === "string" && step.comboName.trim() === oldName) {
          changed = true;
          return { ...step, comboName: newName };
        }
        return step;
      });
      if (changed) {
        db.data.combos[i] = normalizeStoredComboRecord(
          { ...combo, models: updatedModels, updatedAt: now },
          db.data.combos,
          [combo.name]
        );
      }
    }

    // Update the combo itself
    const current = db.data.combos[index] || {};
    const merged = {
      ...current,
      ...updateData,
      name: newName,
      priority: updateData.priority !== undefined
        ? (Number.isFinite(Number(updateData.priority)) ? Number(updateData.priority) : 0)
        : (Number.isFinite(Number(current.priority)) ? Number(current.priority) : 0),
      sortOrder: updateData.sortOrder !== undefined
        ? (Number.isFinite(Number(updateData.sortOrder)) ? Number(updateData.sortOrder) : getNextComboSortOrder(db.data.combos))
        : current.sortOrder,
      updatedAt: now,
    };
    db.data.combos[index] = normalizeStoredComboRecord(merged, db.data.combos, [newName]);

    await persistDbWrite(db);
    result = db.data.combos[index];
  });
  return result;
}

export async function reorderCombos(comboIds = []) {
  const db = await getDb();
  let ordered = [];
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.combos)) db.data.combos = [];

    const byId = new Map(db.data.combos.map((combo) => [combo.id, combo]));
    const seen = new Set();
    const orderedIds = [];

    for (const id of comboIds) {
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id);
      orderedIds.push(id);
    }

    for (const combo of db.data.combos) {
      if (combo?.id && !seen.has(combo.id)) orderedIds.push(combo.id);
    }

    const now = new Date().toISOString();
    db.data.combos = orderedIds.map((id, index) => {
      const combo = byId.get(id);
      return normalizeStoredComboRecord({ ...(combo as any), sortOrder: index + 1, updatedAt: now }, db.data.combos);
    });

    await persistDbWrite(db);
    ordered = [...db.data.combos];
  });
  return ordered;
}

export async function deleteCombo(id) {
  const db = await getDb();
  let success = false;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.combos)) return;

    const index = db.data.combos.findIndex((combo) => combo.id === id);
    if (index === -1) return;

    const deletedCombo = db.data.combos[index];
    const deletedName = typeof deletedCombo?.name === "string" ? deletedCombo.name.trim() : "";

    db.data.combos.splice(index, 1);

    // Clean combo-ref steps in dependent combos that reference the deleted combo
    if (deletedName) {
      for (let i = 0; i < db.data.combos.length; i++) {
        const combo = db.data.combos[i];
        if (!Array.isArray(combo?.models)) continue;
        const filtered = combo.models.filter((step) => {
          if (!step || typeof step !== "object") return true;
          if (step.kind === "combo-ref" && typeof step.comboName === "string" && step.comboName.trim() === deletedName) {
            return false;
          }
          return true;
        });
        if (filtered.length !== combo.models.length) {
          db.data.combos[i] = { ...combo, models: filtered, updatedAt: new Date().toISOString() };
        }
      }
    }

    if (Array.isArray(db.data.modelComboMappings)) {
      db.data.modelComboMappings = db.data.modelComboMappings.filter((mapping) => mapping.comboId !== id);
    }
    await persistDbWrite(db);
    success = true;
  });
  return success;
}

export async function getModelComboMappings() {
  const db = await getDb();
  if (!Array.isArray(db.data.modelComboMappings)) db.data.modelComboMappings = [];
  const combos = await getCombos();
  const comboNamesById = new Map(combos.map((combo) => [combo.id, combo.name]));
  return db.data.modelComboMappings
    .map((mapping) => ({
      ...mapping,
      comboName: comboNamesById.get(mapping.comboId) || mapping.comboName,
      priority: Number.isFinite(Number(mapping.priority)) ? Number(mapping.priority) : 0,
      enabled: mapping.enabled !== false,
      description: typeof mapping.description === "string" ? mapping.description : "",
    }))
    .sort((left, right) => right.priority - left.priority);
}

export async function getModelComboMappingById(id) {
  const mappings = await getModelComboMappings();
  return mappings.find((mapping) => mapping.id === id) || null;
}

function hasMappingPatternConflict(mappings, pattern, priority, excludeId = null) {
  const normalizedPattern = String(pattern || "").trim().toLowerCase();
  const normalizedPriority = Number.isFinite(Number(priority)) ? Number(priority) : 0;
  return (Array.isArray(mappings) ? mappings : []).find((mapping) => {
    if (!mapping || (excludeId && mapping.id === excludeId)) return false;
    const mappingPattern = String(mapping.pattern || "").trim().toLowerCase();
    const mappingPriority = Number.isFinite(Number(mapping.priority)) ? Number(mapping.priority) : 0;
    return mappingPattern === normalizedPattern && mappingPriority === normalizedPriority;
  }) || null;
}

export async function createModelComboMapping(data) {
  const db = await getDb();
  let mapping;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.modelComboMappings)) db.data.modelComboMappings = [];
    const pattern = String(data.pattern || "").trim();
    const priority = Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0;
    const conflict = hasMappingPatternConflict(db.data.modelComboMappings, pattern, priority);
    if (conflict) {
      throw new Error(`Model-combo mapping pattern "${pattern}" already exists at priority ${priority}`);
    }
    const comboExists = (db.data.combos || []).some(c => c.id === data.comboId);
    if (!comboExists) {
      throw new Error(`Combo "${data.comboId}" does not exist`);
    }
    const now = new Date().toISOString();
    mapping = {
      id: uuidv4(),
      pattern,
      comboId: data.comboId,
      priority,
      enabled: data.enabled !== false,
      description: typeof data.description === "string" ? data.description : "",
      createdAt: now,
      updatedAt: now,
    };
    db.data.modelComboMappings.push(mapping);
    await persistDbWrite(db);
  });
  return mapping;
}

export async function updateModelComboMapping(id, data) {
  const db = await getDb();
  let result = null;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.modelComboMappings)) db.data.modelComboMappings = [];
    const index = db.data.modelComboMappings.findIndex((mapping) => mapping.id === id);
    if (index === -1) return;
    const current = db.data.modelComboMappings[index];
    const pattern = data.pattern !== undefined ? String(data.pattern || "").trim() : current.pattern;
    const priority = data.priority !== undefined
      ? (Number.isFinite(Number(data.priority)) ? Number(data.priority) : 0)
      : current.priority;
    const conflict = hasMappingPatternConflict(db.data.modelComboMappings, pattern, priority, id);
    if (conflict) {
      throw new Error(`Model-combo mapping pattern "${pattern}" already exists at priority ${priority}`);
    }
    db.data.modelComboMappings[index] = {
      ...current,
      ...data,
      pattern,
      priority,
      enabled: data.enabled !== undefined ? data.enabled !== false : current.enabled,
      updatedAt: new Date().toISOString(),
    };
    await persistDbWrite(db);
    result = db.data.modelComboMappings[index];
  });
  return result;
}

export async function deleteModelComboMapping(id) {
  const db = await getDb();
  let success = false;
  await withLocalDbMutex(async () => {
    await safeRead(db);
    if (!Array.isArray(db.data.modelComboMappings)) return;
    const next = db.data.modelComboMappings.filter((mapping) => mapping.id !== id);
    if (next.length === db.data.modelComboMappings.length) return;
    db.data.modelComboMappings = next;
    await persistDbWrite(db);
    success = true;
  });
  return success;
}

export function globToRegex(pattern) {
  const normalizedPattern = String(pattern || "").trim();
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function getModelComboMappingCandidates(modelStr) {
  const normalized = String(modelStr || "").trim();
  if (!normalized) return [];
  const candidates = [normalized];
  if (normalized.startsWith("combo/") && normalized.length > "combo/".length) {
    candidates.push(normalized.slice("combo/".length));
  }
  return [...new Set(candidates)];
}

export async function resolveComboForModel(modelStr) {
  const candidates = getModelComboMappingCandidates(modelStr);
  if (candidates.length === 0) return null;

  const mappings = await getModelComboMappings();
  const combos = await getCombos();
  const combosById = new Map(combos.map((combo) => [combo.id, combo]));

  for (const mapping of mappings) {
    if (mapping.enabled === false) continue;
    const regex = globToRegex(mapping.pattern);
    if (candidates.some((candidate) => regex.test(candidate))) {
      return combosById.get(mapping.comboId) || null;
    }
  }

  return null;
}
