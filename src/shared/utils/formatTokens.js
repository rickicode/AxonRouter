/**
 * Canonical token/count formatting for the dashboard.
 *
 * Values are normalised to the largest sensible unit so a token count never
 * sprawls across a metric card: 1,018,967,596 reads as `1,018.97M`. Grouping
 * separators are always applied, including to the mantissa, because operators
 * scan these columns for magnitude, not for exact digits.
 */

const UNITS = [
  { suffix: "B", divisor: 1_000_000_000, decimals: 3 },
  { suffix: "M", divisor: 1_000_000, decimals: 2 },
  { suffix: "K", divisor: 1_000, decimals: 2 },
];

function group(intPart) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function trimZeros(fixed) {
  if (!fixed.includes(".")) return fixed;
  const trimmed = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed || "0";
}

/**
 * Format a token count, shrinking to K/M/B when the value warrants it.
 * Below 1,000 the exact integer is returned with grouping.
 */
export function formatTokens(value) {
  const num = Number(value) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);

  if (abs < 1000) return `${sign}${group(String(Math.round(abs)))}`;

  for (const { suffix, divisor, decimals } of UNITS) {
    if (abs < divisor) continue;
    const scaled = abs / divisor;
    // Rounding must not promote the value past its own unit: 999,999 scaling
    // to 1,000.0K would read as a unit error, so keep the smaller unit until
    // the scaled value genuinely reaches the next one.
    const fixed = trimZeros(scaled.toFixed(decimals));
    const [whole, frac] = fixed.split(".");
    const wholeNum = Number(whole);
    if (wholeNum >= 1000 && suffix !== "B") {
      const next = UNITS[UNITS.indexOf(UNITS.find((u) => u.suffix === suffix)) - 1];
      const nextScaled = abs / next.divisor;
      const nextFixed = trimZeros(nextScaled.toFixed(next.decimals));
      const [nextWhole, nextFrac] = nextFixed.split(".");
      return `${sign}${group(nextWhole)}${nextFrac ? `.${nextFrac}` : ""}${next.suffix}`;
    }
    return `${sign}${group(whole)}${frac ? `.${frac}` : ""}${suffix}`;
  }

  return `${sign}${group(String(abs))}`;
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