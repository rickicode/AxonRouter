const DAY = 86400000;
const BUCKETS = {
  "1 minute": 60000,
  "5 minutes": 300000,
  "1 hour": 3600000,
  "1 day": DAY,
};

export function validateFilterDimension(value, max, name) {
  if (value === undefined || value === null || value === "") return { valid: true };
  if (typeof value !== "string") {
    return { valid: false, error: `Invalid ${name}: must be a string` };
  }
  if (value.trim() !== value) {
    return { valid: false, error: `Invalid ${name}: must not contain leading or trailing whitespace` };
  }
  if (value.length === 0) {
    return { valid: false, error: `Invalid ${name}: cannot be empty` };
  }
  if (value.length > max) {
    return { valid: false, error: `Invalid ${name}: maximum ${max} characters exceeded` };
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    return { valid: false, error: `Invalid ${name}: contains illegal control characters` };
  }
  return { valid: true };
}

export function validateProviderFilter(value) {
  return validateFilterDimension(value, 64, "provider");
}

export function validateModelFilter(value) {
  return validateFilterDimension(value, 256, "model");
}

export function validateAnalyticsFilters(raw = {}, now = Date.now()) {
  const allowed = new Set([
    "timeFrom",
    "timeTo",
    "provider",
    "model",
    "timeBucket",
    "errorCategory",
  ]);
  if (Object.keys(raw).some((key) => !allowed.has(key)))
    throw new Error("Unknown analytics filter");
  const date = (value, fallback) => {
    if (value === undefined) return fallback;
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) ||
      !Number.isFinite(Date.parse(value))
    ) {
      throw new Error("Time filters must be ISO 8601 timestamps with timezone");
    }
    return Date.parse(value);
  };
  const end = date(raw.timeTo, now);
  const start = date(raw.timeFrom, end - 7 * DAY);
  if (start >= end || end - start > 90 * DAY || end > now + 60000)
    throw new Error("Invalid time range (maximum 90 days)");
  const timeBucket = raw.timeBucket ?? "1 hour";
  if (
    !Object.hasOwn(BUCKETS, timeBucket) ||
    Math.ceil((end - start) / BUCKETS[timeBucket]) > 2200
  )
    throw new Error(
      "Invalid or overly granular timeBucket (maximum 2200 buckets)",
    );
  const dimension = (value, max, name) => {
    if (value === undefined) return undefined;
    const res = validateFilterDimension(value, max, name);
    if (!res.valid) throw new Error(res.error);
    return value;
  };
  const validCategories = new Set([
    "upstream",
    "rate_limit",
    "auth",
    "timeout",
    "cancelled",
    "stream",
    "internal",
    "unknown",
  ]);
  const errorCategory = raw.errorCategory;
  if (errorCategory !== undefined && !validCategories.has(errorCategory)) {
    throw new Error("Invalid errorCategory");
  }

  return {
    timeFrom: new Date(start).toISOString(),
    timeTo: new Date(end).toISOString(),
    timeBucket,
    provider: dimension(raw.provider, 64, "provider"),
    model: dimension(raw.model, 256, "model"),
    errorCategory,
  };
}
