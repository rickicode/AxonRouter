import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../..");

function getAllFiles(dir, predicate) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, predicate));
    } else if (!predicate || predicate(fullPath, entry)) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Architectural Boundary Contracts", () => {
  const apiRouteFiles = getAllFiles(
    path.join(ROOT, "src/app/api"),
    (file) => path.basename(file) === "route.js"
  );

  describe("Rule 1: No direct SQL queries in API routes", () => {
    it("ensures no API route imports or directly invokes postgres driver or executes raw SQL queries", () => {
      const violations = [];

      for (const file of apiRouteFiles) {
        const relativePath = path.relative(ROOT, file);
        // OAuth local sqlite token extraction is not an application database query
        if (relativePath.includes("oauth/cursor/auto-import")) {
          continue;
        }

        const content = fs.readFileSync(file, "utf8");

        // Check for postgres driver imports or invocations
        if (/from\s+["']postgres["']/.test(content) || /require\(\s*["']postgres["']\s*\)/.test(content)) {
          violations.push(`${relativePath}: direct postgres import`);
        }
        if (/\bpostgres\s*\(/.test(content)) {
          violations.push(`${relativePath}: direct postgres invocation`);
        }

        // Check for raw SQL query literals (SELECT, INSERT INTO, UPDATE ... SET, DELETE FROM)
        const sqlPattern = /["'`]\s*(SELECT\b[\s\S]+?\bFROM\b|SELECT\s+1|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b)/i;
        const match = sqlPattern.exec(content);
        if (match) {
          violations.push(`${relativePath}: raw SQL literal detected (${match[0].slice(0, 40)})`);
        }
      }

      assert.deepStrictEqual(
        violations,
        [],
        `Direct SQL or postgres driver found in API routes:\n${violations.join("\n")}`
      );
    });
  });

  describe("Rule 2: No Next.js imports in src/ or open-sse/", () => {
    it("ensures no imports from 'next...' or require('next...') exist anywhere in src/ or open-sse/", () => {
      const targetDirs = [path.join(ROOT, "src"), path.join(ROOT, "open-sse")];
      const sourceFiles = targetDirs.flatMap((dir) =>
        getAllFiles(dir, (file) => /\.(js|mjs|cjs|jsx|ts|tsx)$/.test(file))
      );

      const violations = [];
      const nextImportPattern = /(?:from\s+["']next(?:\/[^"']*)?["']|require\(\s*["']next(?:\/[^"']*)?["']\s*\))/;

      for (const file of sourceFiles) {
        const content = fs.readFileSync(file, "utf8");
        const match = nextImportPattern.exec(content);
        if (match) {
          const relativePath = path.relative(ROOT, file);
          violations.push(`${relativePath}: contains ${match[0]}`);
        }
      }

      assert.deepStrictEqual(
        violations,
        [],
        `Next.js imports found in src/ or open-sse/:\n${violations.join("\n")}`
      );
    });
  });

  describe("Rule 3: All active providers in open-sse/providers/registry/ have valid definitions", () => {
    it("ensures all active providers in open-sse/providers/registry/ export an id or name", async () => {
      const registryIndexPath = path.join(ROOT, "open-sse/providers/registry/index.js");
      const registryModule = await import(registryIndexPath);
      const activeProviders = registryModule.default || registryModule;

      assert.ok(
        Array.isArray(activeProviders) && activeProviders.length > 0,
        "Active providers registry index must export an array of providers"
      );

      const invalidProviders = [];
      for (const [index, provider] of activeProviders.entries()) {
        if (!provider || typeof provider !== "object") {
          invalidProviders.push({ index, error: "Provider entry is not an object", provider });
          continue;
        }

        const hasId = typeof provider.id === "string" && provider.id.trim().length > 0;
        const hasName =
          (typeof provider.name === "string" && provider.name.trim().length > 0) ||
          (provider.display && typeof provider.display.name === "string" && provider.display.name.trim().length > 0);

        if (!hasId && !hasName) {
          invalidProviders.push({ index, error: "Missing id or name", provider });
        }
      }

      assert.deepStrictEqual(
        invalidProviders,
        [],
        `Found active providers missing id or name:\n${JSON.stringify(invalidProviders, null, 2)}`
      );

      // Also verify individual provider definition files in registry directory
      const registryDir = path.join(ROOT, "open-sse/providers/registry");
      const providerFiles = fs
        .readdirSync(registryDir)
        .filter((file) => file.endsWith(".js") && file !== "index.js" && file !== "ui.js");

      for (const file of providerFiles) {
        const mod = await import(path.join(registryDir, file));
        const def = mod.default || mod;
        assert.ok(def, `${file} must export a definition`);
        const hasId = typeof def.id === "string" && def.id.trim().length > 0;
        const hasName =
          (typeof def.name === "string" && def.name.trim().length > 0) ||
          (def.display && typeof def.display.name === "string" && def.display.name.trim().length > 0);
        assert.ok(
          hasId || hasName,
          `${file} must have a valid definition exporting an id or name`
        );
      }
    });
  });

  describe("Rule 4: Zero CommonJS require() calls inside src/app/api/**/route.js", () => {
    it("ensures all API routes are pure ESM without require() calls", () => {
      const violations = [];
      const requirePattern = /\brequire\s*\(/;

      for (const file of apiRouteFiles) {
        const content = fs.readFileSync(file, "utf8");
        if (requirePattern.test(content)) {
          const relativePath = path.relative(ROOT, file);
          violations.push(`${relativePath}: contains CommonJS require() call`);
        }
      }

      assert.deepStrictEqual(
        violations,
        [],
        `CommonJS require() calls found in API routes:\n${violations.join("\n")}`
      );
    });
  });
});
