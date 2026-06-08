import readline, { createInterface } from "node:readline";
import { COLORS, color } from "./display.js";

let rawPrimed = false;

function primeRawOnce() {
  if (rawPrimed || !process.stdin.isTTY) return;
  try {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    rawPrimed = true;
  } catch {}
}

function suspendRawFor(fn) {
  const wasPrimed = rawPrimed;
  if (wasPrimed && process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch {}
  }
  return fn().finally(() => {
    if (wasPrimed && process.stdin.isTTY) {
      try { process.stdin.setRawMode(true); } catch {}
      process.stdin.resume();
    }
  });
}

// ── Simple string prompt ────────────────────────────────────────────────────

export async function prompt(question, defaultValue = "") {
  return suspendRawFor(() => new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    rl.question(`${color("?", COLORS.cyan)} ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  }));
}

// ── Basic numeric selection ─────────────────────────────────────────────────

export async function select(question, options) {
  console.log(`\n${color("?", COLORS.cyan)} ${question}:`);
  options.forEach((opt, i) => {
    console.log(`  ${color(`${i + 1}.`, COLORS.cyan)} ${opt}`);
  });
  while (true) {
    const answer = await prompt("\n  Select [1]: ");
    const num = parseInt(answer.trim() || "1", 10);
    if (!isNaN(num) && num >= 1 && num <= options.length) return num - 1;
    console.log(`Invalid selection. Please enter a number between 1 and ${options.length}`);
  }
}

// ── Yes/No confirm ──────────────────────────────────────────────────────────

export async function confirm(question, defaultValue = true) {
  while (true) {
    const hint = defaultValue ? "Y/n" : "y/N";
    const answer = await prompt(`${question} [${hint}]`);
    const a = answer.trim().toLowerCase();
    if (a === "y" || a === "yes") return true;
    if (a === "n" || a === "no") return false;
    if (a === "") return defaultValue;
    console.log("Please answer 'y' or 'n'");
  }
}

// ── Arrow-key interactive menu (Fullscreen like AxonRouter) ────────────────────

export async function selectMenu(title, items, { header } = {}) {
  return new Promise((resolve) => {
    let selectedIndex = 0;
    let isActive = true;

    primeRawOnce();
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY
      console.log(`\n${color(`── ${title} ──`, COLORS.bright)}`);
      if (header) console.log(header);
      items.forEach((item, i) => {
        const label = typeof item === "string" ? item : item.label || item.name || `Item ${i}`;
        console.log(`  ${color(`${i + 1}.`, COLORS.cyan)} ${label}`);
      });
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`\n  ${color("Select:", COLORS.dim)} `, (answer) => {
        rl.close();
        const idx = parseInt(answer.trim(), 10) - 1;
        if (idx >= 0 && idx < items.length) resolve(idx);
        else resolve(-1);
      });
      return;
    }

    let linesPrinted = 0;

    const renderMenu = () => {
      if (!isActive) return;
      
      if (linesPrinted > 0) {
        process.stdout.write(`\x1b[${linesPrinted}A\x1b[J`);
      }
      
      let output = "";
      const width = Math.min(process.stdout.columns || 60, 60);
      
      output += `\n${color("=".repeat(width), COLORS.cyan)}\n`;
      output += `  ${color(title, COLORS.cyan + COLORS.bright)}\n`;
      output += `${color("=".repeat(width), COLORS.cyan)}\n\n`;
      
      if (header) { 
        output += header + "\n\n"; 
      }

      const isWin = process.platform === "win32";
      items.forEach((item, index) => {
        const isSelected = index === selectedIndex;
        const label = typeof item === "string" ? item : item.label || item.name || `Item ${index}`;
        const icon = isSelected ? (isWin ? ">" : "★") : (isWin ? " " : "☆");
        
        if (isSelected) {
          output += ` ${color(`${icon} ${label}`, COLORS.green + COLORS.bright)}\n`;
        } else {
          output += `  ${icon} ${label}\n`;
        }
      });
      
      output += `\n${color("  ↑↓ navigate · ↵ select · q back", COLORS.dim)}\n`;
      
      process.stdout.write(output);
      linesPrinted = output.split('\n').length - 1;
    };

    const cleanup = () => {
      if (!isActive) return;
      isActive = false;
      process.stdout.write("\x1b[?25h"); // Show cursor
      process.stdin.removeListener("keypress", onKeypress);
    };

    const move = (delta) => {
      selectedIndex = (selectedIndex + delta + items.length) % items.length;
      renderMenu();
    };

    const onKeypress = (_str, key) => {
      if (!isActive || !key) return;
      if (key.name === "up" || key.name === "k") return move(-1);
      if (key.name === "down" || key.name === "j") return move(1);
      if (key.name === "return") { cleanup(); resolve(selectedIndex); return; }
      if (key.name === "escape" || key.name === "q") { cleanup(); resolve(-1); return; }
      if (key.ctrl && key.name === "c") { cleanup(); process.exit(0); }
    };

    process.stdout.write("\x1b[?25l"); // Hide cursor
    process.stdin.on("keypress", onKeypress);
    renderMenu();
  });
}

// ── Pause for user to press Enter ───────────────────────────────────────────

export async function pause(message = "Press Enter to continue...") {
  return suspendRawFor(() => new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`  ${color(message, COLORS.dim)}`, () => {
      rl.close();
      resolve();
    });
  }));
}
