import { selectMenu } from "./input.js";
import { color, COLORS } from "./display.js";

/**
 * Show a menu with a persistent "back" option and optional refresh.
 * @param {Object} options
 * @param {string} options.title - Menu title
 * @param {Array<{label: string, action: Function}>} options.items - Menu items
 * @param {Function} [options.refresh] - Async function called each loop; return data or null to exit
 * @param {Function} [options.headerContent] - Async function returning header string
 * @param {string} [options.backLabel] - Label for back button (default "← Back")
 */
export async function showMenuWithBack({
  title,
  items = [],
  refresh,
  headerContent,
  backLabel = "← Back",
}) {
  while (true) {
    const data = refresh ? await refresh() : null;
    if (data === null && refresh) {
      // refresh returned null means exit
      return;
    }

    const header = headerContent
      ? await Promise.resolve(headerContent(data))
      : "";

    const menuItems = [
      { label: color(backLabel, COLORS.dim), value: "__back__" },
      ...items.map((item) => ({
        label: typeof item.label === "function" ? item.label(data) : item.label,
        value: item.value || item.label,
      })),
    ];

    const selected = await selectMenu(title, menuItems, { header });

    if (selected <= 0) {
      // Back or cancel
      return;
    }

    const action = items[selected - 1]?.action;
    if (action) {
      const result = await Promise.resolve(action(data));
      // If action returns false, exit this menu
      if (result === false) return;
    }
  }
}

/**
 * Build a breadcrumb string from an array of path segments.
 * @param {string[]} segments
 * @returns {string}
 */
export function breadcrumb(segments = []) {
  return segments.map((s) => color(s, COLORS.cyan)).join(" › ");
}
