/**
 * Validate provider base URL to prevent SSRF attacks.
 * Blocks private/internal IPs and non-HTTP protocols.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

const BLOCKED_HOSTNAMES = [
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
];

export function validateProviderBaseUrl(urlString: string): { valid: boolean; error?: string; url?: string } {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, error: "Base URL is required" };
  }

  const trimmed = urlString.trim();
  if (!trimmed) {
    return { valid: false, error: "Base URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: "URL must use HTTP or HTTPS protocol" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: "This hostname is not allowed" };
  }

  if (PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    // Allow localhost for local development
    if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") {
      return { valid: true, url: trimmed };
    }
    return { valid: false, error: "Private/internal IP addresses are not allowed" };
  }

  // Block common internal hostnames
  if (hostname.endsWith(".internal") || hostname.endsWith(".local") || hostname === "kubernetes.default") {
    // Allow .local for mDNS in home networks (common for self-hosted LLMs)
    if (!hostname.endsWith(".internal") && !hostname.includes("metadata")) {
      return { valid: true, url: trimmed };
    }
    return { valid: false, error: "Internal hostnames are not allowed" };
  }

  return { valid: true, url: trimmed };
}
