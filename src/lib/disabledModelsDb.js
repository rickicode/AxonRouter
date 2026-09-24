// Shim → re-export from PostgreSQL DB layer (src/lib/db/)
export {
  getDisabledModels, getDisabledByProvider, disableModels, enableModels,
} from "@/lib/db/index.js";
