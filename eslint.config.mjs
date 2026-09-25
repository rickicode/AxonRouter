import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    "dist/**",
    "out/**",
    "build/**",
    "node_modules/**",
    ".next/**",
  ]),
]);

export default eslintConfig;
