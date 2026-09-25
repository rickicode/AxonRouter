import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
    "process.env.NEXT_PUBLIC_BASE_URL": JSON.stringify(process.env.NEXT_PUBLIC_BASE_URL || ""),
    "process.env.NEXT_PUBLIC_CLOUD_URL": JSON.stringify(process.env.NEXT_PUBLIC_CLOUD_URL || ""),
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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          flow: ["@xyflow/react"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
});
