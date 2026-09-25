import { defineConfig, loadEnv, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

export default defineConfig(({ mode }) => {
  // Load .env with an empty prefix so BASE_URL / CLOUD_URL (canonical names,
  // no Next.js legacy) are inlined into the client bundle at build time.
  const env = loadEnv(mode, root, "");
  const baseUrl = env.BASE_URL || "";
  const cloudUrl = env.CLOUD_URL || "";

  return {
    plugins: [
      {
        name: "treat-js-files-as-jsx",
        async transform(code, id) {
          if (!id.match(/src\/.*\.js$/)) return null;
          return transformWithEsbuild(code, id, {
            loader: "jsx",
            jsx: "automatic",
          });
        },
      },
      react(),
    ],
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          ".js": "jsx",
        },
      },
    },
    resolve: {
      alias: {
        "@": path.join(root, "src"),
        "open-sse": path.join(root, "open-sse"),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version || "0.1.2"),
      "process.env.BASE_URL": JSON.stringify(baseUrl),
      "process.env.CLOUD_URL": JSON.stringify(cloudUrl),
    },
    server: {
      port: 5173,
      proxy: {
        "/api": "http://127.0.0.1:3777",
        "/v1": "http://127.0.0.1:3777",
        "/v1beta": "http://127.0.0.1:3777",
      },
    },
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-flow": ["@xyflow/react"],
            "vendor-dnd": ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
            "vendor-icons": ["lucide-react"],
            "vendor-markdown": ["marked"],
          },
        },
      },
    },
  };
});
