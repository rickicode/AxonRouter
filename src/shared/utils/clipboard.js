/**
 * Robust, universal clipboard copy utility.
 * Works seamlessly in both Secure Contexts (HTTPS/localhost) and Non-Secure Contexts
 * (plain HTTP, LAN IPs like http://100.118.16.10:3777).
 *
 * @param {string} text - Text to copy to clipboard
 * @returns {Promise<boolean>} - Resolves to true if copy succeeded, false otherwise
 */
export async function copyToClipboard(text) {
  if (typeof window === "undefined") return false;
  const str = typeof text === "string" ? text : String(text ?? "");

  // 1. Try modern Async Clipboard API first (available in Secure Contexts)
  if (navigator?.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch {
      // Fallback to legacy execCommand below if permission denied or error
    }
  }

  // 2. Legacy fallback for non-HTTPS (e.g. http://100.118.16.10:3777) and older browsers
  try {
    const textArea = document.createElement("textarea");
    textArea.value = str;

    // Prevent scrolling to bottom of page in iOS/Safari
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.width = "2em";
    textArea.style.height = "2em";
    textArea.style.padding = "0";
    textArea.style.border = "none";
    textArea.style.outline = "none";
    textArea.style.boxShadow = "none";
    textArea.style.background = "transparent";
    // Using opacity 0.01 instead of 0 or display:none so iOS/Chrome doesn't ignore selection
    textArea.style.opacity = "0.01";
    textArea.setAttribute("readonly", "");

    document.body.appendChild(textArea);

    // iOS Safari selection range compatibility
    if (navigator.userAgent.match(/ipad|ipod|iphone/i)) {
      const range = document.createRange();
      range.selectNodeContents(textArea);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      textArea.setSelectionRange(0, 999999);
    } else {
      textArea.focus();
      textArea.select();
    }

    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.warn("[clipboard] fallback copy failed:", err);
    return false;
  }
}
