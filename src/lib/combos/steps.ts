const COMBO_SCHEMA_VERSION = 2;

type ComboNormalizeOptions = {
  comboName?: unknown;
  index?: unknown;
  allCombos?: unknown;
};

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toWeight(value) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : 0;

  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function collectComboNames(allCombos) {
  const names = new Set();
  if (!allCombos) return names;

  if (
    !Array.isArray(allCombos) &&
    typeof allCombos?.[Symbol.iterator] === "function" &&
    !(isRecord(allCombos) && Array.isArray(allCombos.combos))
  ) {
    for (const value of allCombos) {
      const name = toTrimmedString(value);
      if (name) names.add(name);
    }
    return names;
  }

  const combosFromRecord = isRecord(allCombos) && Array.isArray(allCombos.combos) ? allCombos.combos : [];
  const combos = Array.isArray(allCombos) ? allCombos : combosFromRecord;

  for (const combo of combos) {
    const name = typeof combo === "string" ? toTrimmedString(combo) : toTrimmedString(combo?.name);
    if (name) names.add(name);
  }

  return names;
}

function parseProviderId(model) {
  const trimmed = model.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0) return null;
  const providerId = trimmed.slice(0, slashIndex).trim();
  return providerId.length > 0 ? providerId : null;
}

function toFullModelString(model, providerId) {
  const trimmedModel = model.trim();
  if (trimmedModel.includes("/")) return trimmedModel;
  const normalizedProviderId = toTrimmedString(providerId);
  return normalizedProviderId ? `${normalizedProviderId}/${trimmedModel}` : trimmedModel;
}

function slugify(value) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "step";
}

function buildStepId(kind, comboName, index, seed) {
  return [
    slugify(comboName || "combo"),
    kind === "combo-ref" ? "ref" : "model",
    String(index + 1),
    slugify(seed),
  ].join("-").slice(0, 200);
}

function shouldTreatAsComboRef(target, providerId, options) {
  if (providerId) return false;
  const comboNames = collectComboNames(options?.allCombos);
  return comboNames.has(target) || target === toTrimmedString(options?.comboName);
}

export function isComboRefStep(value) {
  return isRecord(value) && value.kind === "combo-ref" && !!toTrimmedString(value.comboName);
}

export function isComboModelStep(value) {
  return isRecord(value) && value.kind === "model" && !!toTrimmedString(value.model);
}

export function getComboStepWeight(value) {
  if (typeof value === "string") return 0;
  if (!isRecord(value)) return 0;
  return toWeight(value.weight);
}

export function getComboModelString(value) {
  if (typeof value === "string") return toTrimmedString(value);
  if (!isRecord(value) || value.kind === "combo-ref") return null;

  const rawModel = toTrimmedString(value.model);
  if (!rawModel) return null;

  const providerId =
    toTrimmedString(value.providerId) ||
    toTrimmedString(value.provider) ||
    parseProviderId(rawModel);

  return toFullModelString(rawModel, providerId);
}

export function getComboModelProvider(value) {
  if (typeof value === "string") return parseProviderId(value);
  if (!isRecord(value) || value.kind === "combo-ref") return null;

  return (
    toTrimmedString(value.providerId) ||
    toTrimmedString(value.provider) ||
    parseProviderId(toTrimmedString(value.model) || "")
  );
}

export function getComboStepTarget(value, options = {}) {
  if (typeof value === "string") {
    const target = toTrimmedString(value);
    if (!target) return null;
    return target;
  }

  if (!isRecord(value)) return null;
  if (value.kind === "combo-ref") return toTrimmedString(value.comboName);

  const rawModel = toTrimmedString(value.model);
  if (!rawModel) return null;
  const isExplicitModel = value.kind === "model";
  const providerId =
    toTrimmedString(value.providerId) ||
    toTrimmedString(value.provider) ||
    parseProviderId(rawModel);

  if (!isExplicitModel && shouldTreatAsComboRef(rawModel, providerId, options)) {
    return rawModel;
  }

  return toFullModelString(rawModel, providerId);
}

export function normalizeComboStep(value, options: ComboNormalizeOptions = {}) {
  const comboName = toTrimmedString(options.comboName);
  const index = typeof options.index === "number" ? options.index : 0;

  if (typeof value === "string") {
    const target = toTrimmedString(value);
    if (!target) return null;

    if (shouldTreatAsComboRef(target, null, options)) {
      return {
        id: buildStepId("combo-ref", comboName, index, target),
        kind: "combo-ref",
        comboName: target,
        weight: 0,
      };
    }

    const providerId = parseProviderId(target);
    return {
      id: buildStepId("model", comboName, index, target),
      kind: "model",
      model: target,
      ...(providerId ? { providerId } : {}),
      weight: 0,
    };
  }

  if (!isRecord(value)) return null;

  const explicitId = toTrimmedString(value.id);
  const weight = toWeight(value.weight);
  const label = toTrimmedString(value.label);

  if (value.kind === "combo-ref") {
    const comboRefName = toTrimmedString(value.comboName);
    if (!comboRefName) return null;
    return {
      id: explicitId || buildStepId("combo-ref", comboName, index, comboRefName),
      kind: "combo-ref",
      comboName: comboRefName,
      weight,
      ...(label ? { label } : {}),
    };
  }

  const rawModel = toTrimmedString(value.model);
  if (!rawModel) return null;
  const isExplicitModel = value.kind === "model";

  const providerId =
    toTrimmedString(value.providerId) ||
    toTrimmedString(value.provider) ||
    parseProviderId(rawModel);

  if (!isExplicitModel && shouldTreatAsComboRef(rawModel, providerId, options)) {
    return {
      id: explicitId || buildStepId("combo-ref", comboName, index, rawModel),
      kind: "combo-ref",
      comboName: rawModel,
      weight,
      ...(label ? { label } : {}),
    };
  }

  const model = toFullModelString(rawModel, providerId);
  const connectionId = value.connectionId === null ? null : toTrimmedString(value.connectionId) || undefined;
  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => toTrimmedString(tag)).filter(Boolean)
    : undefined;

  return {
    id: explicitId || buildStepId("model", comboName, index, connectionId ? `${model}:${connectionId}` : model),
    kind: "model",
    model,
    ...(providerId ? { providerId } : {}),
    ...(connectionId !== undefined ? { connectionId } : {}),
    weight,
    ...(label ? { label } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
  };
}

export function normalizeComboModels(models, options: ComboNormalizeOptions = {}) {
  const list = Array.isArray(models) ? models : [];
  return list
    .map((value, index) => normalizeComboStep(value, { ...options, index }))
    .filter(Boolean);
}

export function normalizeComboRecord(combo, options: ComboNormalizeOptions = {}) {
  const comboName = toTrimmedString(combo?.name);
  return {
    ...(isRecord(combo) ? combo : {}),
    version: COMBO_SCHEMA_VERSION,
    models: normalizeComboModels(combo?.models, {
      comboName,
      allCombos: options.allCombos,
    }),
  };
}

export { COMBO_SCHEMA_VERSION };
