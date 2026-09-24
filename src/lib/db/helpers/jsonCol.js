export function parseJson(str, fallback = null) {
  if (str == null) return fallback;
  if (typeof str !== "string") return str;
  try {
    let parsed = JSON.parse(str);
    if (typeof parsed === "string") {
      const t = parsed.trimStart();
      if (t.startsWith("{") || t.startsWith("[")) {
        try { parsed = JSON.parse(parsed); } catch {}
      }
    }
    return parsed;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

// Prepare a JS value for a JSONB column. Strings that already contain
// serialized JSON are parsed back to objects/arrays first, so callers
// never write scalar-string JSONB (which breaks jsonb_typeof checks and
// jsonb_set / minus operators downstream).
export function toJsonb(value, fallback = null) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed === undefined ? fallback : parsed;
    } catch {
      return value;
    }
  }
  return value;
}
