/**
 * Canonical token/count formatting for the dashboard.
 *
 * Values are normalised to the largest sensible unit and rendered WITHOUT
 * decimals so a token count never sprawls across a metric card:
 * 1200 -> `1K`, 12345 -> `12K`, 999999 -> `1M`, 1542000 -> `2M`.
 * Thousands are grouped with `.` (Indonesian style); exact values live in
 * formatTokensExact tooltips, so these are read for magnitude, not digits.
 */

const UNITS = [
  { suffix: "B", divisor: 1_000_000_000 },
  { suffix: "M", divisor: 1_000_000 },
  { suffix: "K", divisor: 1_000 },
];

function group(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Format a token count, shrinking to K/M/B with no decimals.
 * Below 1,000 the exact integer is returned with grouping.
 */
export function formatTokens(value) {
  const num = Number(value) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);

  if (abs < 1000) return `${sign}${group(String(Math.round(abs)))}`;

  for (const { suffix, divisor } of UNITS) {
    if (abs < divisor) continue;
    const scaled = Math.round(abs / divisor);
    // Rounding must not promote the value past its own unit: 999,999 rounds
    // to 1000K, which would read as a unit error - hand it to M instead.
    if (scaled >= 1000 && suffix !== "B") continue;
    return `${sign}${group(String(scaled))}${suffix}`;
  }

  // Only reachable when rounding pushes K into M (999,500 - 999,999).
  return `${sign}${group(String(Math.round(abs / 1_000_000)))}M`;
}

/**
 * Format an exact token count with grouping and no unit shrinking. Use where
 * the precise number matters more than the magnitude (tables, exports).
 */
export function formatTokensExact(value) {
  const num = Number(value) || 0;
  return group(String(Math.round(num)));
}

export default formatTokens;