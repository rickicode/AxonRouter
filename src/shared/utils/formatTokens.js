/**
 * Canonical token/count formatting for the dashboard.
 *
 * Values are normalised to the largest sensible unit with up to two decimals:
 * 1000 -> `1K`, 1200 -> `1,2K`, 1542000 -> `1,54M`. Integer part is grouped
 * with `.` and decimals with `,` (Indonesian style).
 */

const UNITS = [
  { suffix: "B", divisor: 1_000_000_000 },
  { suffix: "M", divisor: 1_000_000 },
  { suffix: "K", divisor: 1_000 },
];

function formatInt(num) {
  return Number(num || 0).toLocaleString("id-ID");
}

/**
 * Format a token count, shrinking to K/M/B with up to two decimals,
 * trailing zeros trimmed: 1000 -> `1K`, 1200 -> `1,2K`, 1542000 -> `1,54M`.
 * Below 1,000 the exact integer is returned with grouping.
 */
export function formatTokens(value) {
  const num = Number(value) || 0;
  if (isNaN(num)) return "0";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);

  if (abs < 1000) return `${sign}${formatInt(Math.round(abs))}`;

  for (const { suffix, divisor } of UNITS) {
    if (abs < divisor) continue;
    const scaled = abs / divisor;
    const [whole, frac] = scaled.toFixed(2).split(".");
    if (Number(whole) >= 1000 && suffix !== "B") continue;
    const formattedWhole = formatInt(whole);
    const cleanFrac = frac ? frac.replace(/0+$/, "") : "";
    return `${sign}${formattedWhole}${cleanFrac ? `,${cleanFrac}` : ""}${suffix}`;
  }

  const [whole, frac] = (abs / 1_000_000).toFixed(2).split(".");
  const formattedWhole = formatInt(whole);
  const cleanFrac = frac ? frac.replace(/0+$/, "") : "";
  return `${sign}${formattedWhole}${cleanFrac ? `,${cleanFrac}` : ""}M`;
}

/**
 * Format an exact token count with grouping and no unit shrinking. Use where
 * the precise number matters more than the magnitude (tables, exports).
 */
export function formatTokensExact(value) {
  const num = Number(value) || 0;
  if (isNaN(num)) return "0";
  return formatInt(Math.round(num));
}

export default formatTokens;
