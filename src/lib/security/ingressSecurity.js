// Double-submit CSRF protection & JSON Depth Guard for AxonRouter.
// - CSRF: Uses a readable `csrf_token` cookie + required `x-csrf-token` header on state-changing dashboard mutations (POST, PUT, DELETE, PATCH).
// - JSON Depth Guard: Recursively checks JSON payload depth to block nested JSON DoS attacks.

import crypto from "node:crypto";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
export const MAX_JSON_DEPTH = 32;

/**
 * Generate a cryptographically secure CSRF token.
 * @returns {string}
 */
export function generateCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Validates double-submit CSRF tokens in constant time.
 * @param {string} cookieToken - Token from client cookie
 * @param {string} headerToken - Token from x-csrf-token header
 * @returns {boolean}
 */
export function validateCsrfToken(cookieToken, headerToken) {
  if (!cookieToken || !headerToken || typeof cookieToken !== "string" || typeof headerToken !== "string") {
    return false;
  }
  const bufA = Buffer.from(cookieToken);
  const bufB = Buffer.from(headerToken);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates that an object's nested depth does not exceed maxDepth.
 * Prevents deeply nested JSON recursion DoS attacks.
 * @param {unknown} value
 * @param {number} [depth=0]
 * @param {number} [maxDepth=MAX_JSON_DEPTH]
 * @throws {Error} If depth exceeds maxDepth
 */
export function assertBoundedJsonDepth(value, depth = 0, maxDepth = MAX_JSON_DEPTH) {
  if (depth > maxDepth) {
    throw new Error(`JSON depth limit exceeded: depth > ${maxDepth}`);
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertBoundedJsonDepth(value[i], depth + 1, maxDepth);
    }
  } else {
    for (const key of Object.keys(value)) {
      assertBoundedJsonDepth(value[key], depth + 1, maxDepth);
    }
  }
}
