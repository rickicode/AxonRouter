// ── ANSI Color Palette ──────────────────────────────────────────────────────
export const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgCyan: "\x1b[46m",
  // Semantic aliases
  success: "\x1b[32m",
  error: "\x1b[31m",
  warning: "\x1b[33m",
  info: "\x1b[36m",
};

export function color(text, colorCode) {
  return `${colorCode}${text}${COLORS.reset}`;
}

// ── UI Components ───────────────────────────────────────────────────────────

export function showBox(title, content, width = 60) {
  const line = `┌${"─".repeat(width)}┐`;
  const titleLine = `│ ${color(title.padEnd(width - 1), COLORS.bright)}│`;
  const separator = `├${"─".repeat(width)}┤`;
  const bottom = `└${"─".repeat(width)}┘`;

  const contentLines = (content || "").split("\n").map(
    (line) => `│ ${line.padEnd(width - 1)}│`
  );

  console.log(`\n${line}\n${titleLine}\n${separator}`);
  contentLines.forEach((l) => console.log(l));
  console.log(`${bottom}\n`);
}

export function showMenu(title, items, footer) {
  const line = `─".repeat(50)`;
  console.log(`\n${color(`╔${line}╗`, COLORS.cyan)}`);
  console.log(`${color(`║ ${title.padEnd(48)} ║`, COLORS.bright)}`);
  console.log(`${color(`╚${line}╝`, COLORS.cyan)}\n`);

  items.forEach((item, index) => {
    const num = String(index + 1).padStart(2);
    console.log(`  ${color(`${num}.`, COLORS.cyan)} ${item.label}`);
  });

  if (footer) {
    console.log(`\n  ${color(footer, COLORS.dim)}`);
  }
  console.log("");
}

export function showTable(headers, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ${color("(no data)", COLORS.dim)}`);
    return;
  }

  // Calculate column widths
  const colWidths = headers.map((h, i) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, String(row[i] || "").length),
      String(h).length
    );
    return Math.max(maxData, String(h).length) + 2;
  });

  // Header
  const headerLine = headers
    .map((h, i) => color(h.padEnd(colWidths[i]), COLORS.bright))
    .join("");
  const separator = colWidths.map((w) => "─".repeat(w)).join("");
  console.log(`  ${headerLine}`);
  console.log(`  ${color(separator, COLORS.dim)}`);

  // Rows
  rows.forEach((row) => {
    const line = row
      .map((cell, i) => String(cell || "").padEnd(colWidths[i]))
      .join("");
    console.log(`  ${line}`);
  });
  console.log("");
}

export function showStatus(message, type = "info") {
  const symbols = {
    success: color("✓", COLORS.success),
    error: color("✗", COLORS.error),
    warning: color("⚠", COLORS.warning),
    info: color("ℹ", COLORS.cyan),
  };
  const symbol = symbols[type] || symbols.info;
  console.log(`  ${symbol} ${message}`);
}

export function showHeader(title, subtitle) {
  const line = "=".repeat(60);
  console.log(`\n${color(line, COLORS.cyan)}`);
  console.log(`  ${color(title, COLORS.bright)}`);
  if (subtitle) console.log(`  ${color(subtitle, COLORS.dim)}`);
  console.log(`${color(line, COLORS.cyan)}\n`);
}

export function clearScreen() {
  console.clear();
}
