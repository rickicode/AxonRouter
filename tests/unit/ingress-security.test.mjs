import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateCsrfToken,
  validateCsrfToken,
  assertBoundedJsonDepth,
  MAX_JSON_DEPTH,
} from "../../src/lib/security/ingressSecurity.js";

describe("Ingress Security Primitives", () => {
  describe("CSRF Double-Submit Protection", () => {
    it("validates identical tokens in constant time", () => {
      const token = generateCsrfToken();
      assert.equal(typeof token, "string");
      assert.equal(token.length > 30, true);
      assert.equal(validateCsrfToken(token, token), true);
    });

    it("rejects mismatched tokens", () => {
      const tokenA = generateCsrfToken();
      const tokenB = generateCsrfToken();
      assert.equal(validateCsrfToken(tokenA, tokenB), false);
    });

    it("rejects null or missing tokens", () => {
      assert.equal(validateCsrfToken(null, "some-token"), false);
      assert.equal(validateCsrfToken("some-token", undefined), false);
      assert.equal(validateCsrfToken("", ""), false);
    });
  });

  describe("JSON Depth Guard", () => {
    it("allows flat and reasonably nested objects", () => {
      const obj = { a: 1, b: { c: [1, 2, { d: "hello" }] } };
      assert.doesNotThrow(() => assertBoundedJsonDepth(obj, 0, 10));
    });

    it("throws when nesting exceeds max depth", () => {
      let current = {};
      for (let i = 0; i < 35; i++) {
        current = { child: current };
      }
      assert.throws(
        () => assertBoundedJsonDepth(current, 0, MAX_JSON_DEPTH),
        /JSON depth limit exceeded/
      );
    });
  });
});
