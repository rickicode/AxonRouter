import { execSync } from "node:child_process";

export function copyToClipboard(text) {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execSync("pbcopy", { input: text, timeout: 3000 });
    } else if (platform === "win32") {
      execSync("clip", { input: text, timeout: 3000 });
    } else {
      // Linux — try xclip, fall back to xsel
      try {
        execSync("xclip -selection clipboard", { input: text, timeout: 3000 });
      } catch {
        execSync("xsel --clipboard --input", { input: text, timeout: 3000 });
      }
    }
    return true;
  } catch {
    return false;
  }
}
