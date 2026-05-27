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
    setupFiles: [resolve(__dirname, "setup.ts")],
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
    alias: [
      { find: "@/lib/tunnel/state", replacement: resolve(__dirname, "../packages/tunnel/src/state.ts") },
      { find: "@/lib/tunnel/cloudflared", replacement: resolve(__dirname, "../packages/tunnel/src/cloudflared.ts") },
      { find: "@/lib/tunnel/deps", replacement: resolve(__dirname, "../packages/tunnel/src/deps.ts") },
      { find: "@axonrouter/data-dir", replacement: resolve(__dirname, "../packages/data-dir/src/index.js") },
      { find: "@", replacement: resolve(__dirname, "../src") },
      { find: "open-sse", replacement: resolve(__dirname, "../open-sse") },
    ],
  },
});
