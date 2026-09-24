/**
 * Overview sub-tab definitions and resolver for /dashboard/usage
 * Only breakdown is a separate tab; everything else is unified under "overview" (topology + trends + live activity).
 */

export const OVERVIEW_SUBTABS = [
  { value: "overview", label: "Overview", icon: "dashboard" },
  { value: "breakdown", label: "Breakdown", icon: "table_chart" },
];

export const VALID_OVERVIEW_SUBTABS = OVERVIEW_SUBTABS.map((t) => t.value);

/**
 * Validates and resolves the active sub-tab for Usage Overview.
 * Falls back to 'overview' (utama) if invalid or undefined.
 *
 * @param {string|null|undefined} subtab
 * @param {string} [fallback="overview"]
 * @returns {string}
 */
export function resolveActiveSubTab(subtab, fallback = "overview") {
  if (typeof subtab === "string" && VALID_OVERVIEW_SUBTABS.includes(subtab.trim())) {
    return subtab.trim();
  }
  return fallback;
}
