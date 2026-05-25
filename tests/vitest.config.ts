import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

const remapJsSource = (id: string) => {
  if (!id.endsWith(".js")) {
    return null;
  }

  const normalized = id.startsWith("/src/")
    ? resolve(projectRoot, `.${id}`)
    : id;
  const base = normalized.slice(0, -3);
  for (const ext of [".ts", ".tsx"]) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

export default defineConfig({
  plugins: [
    {
      name: "axonrouter-ts-source-resolver",
      enforce: "pre",
      resolveId(id) {
        if (id.startsWith("/") || id.startsWith(projectRoot)) {
          return remapJsSource(id);
        }

        return null;
      },
    },
  ],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "../.claude/worktrees/**",
      "../.worktrees/**",
      ".claude/worktrees/**",
      ".worktrees/**",
      "**/.claude/worktrees/**",
      "**/.worktrees/**",
    ],
    silent: false,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "../src"),
      "open-sse": resolve(__dirname, "../open-sse"),
    },
  },
});
