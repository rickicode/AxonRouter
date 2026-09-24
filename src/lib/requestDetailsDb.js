// Shim → re-export from PostgreSQL DB layer (src/lib/db/)
export {
  saveRequestDetail, getRequestDetails, getRequestDetailById, getDistinctProviders, getFailureAnalytics, getComboAnalytics,
} from "@/lib/db/index.js";
