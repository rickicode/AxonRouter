#!/usr/bin/env node
/**
 * scripts/generate-registry-ui.mjs
 *
 * Regenerate open-sse/providers/registry/ui.js from open-sse/providers/registry/index.js.
 * Preserves the exact kept-field semantics described in the ui.js header:
 *
 *   dropped: transport, transports, oauth, auth, pricing, forceStream
 *   kept:    id, priority, alias, aliases, uiAlias, category, hidden, display,
 *            authType, hasOAuth, authModes, noAuth, authHint, hasProviderSpecificData,
 *            passthroughModels, hasFree, features, thinkingConfig, regions,
 *            defaultRegion, media, serviceKinds, ttsConfig, sttConfig, embeddingConfig,
 *            imageConfig, imageToTextConfig, videoConfig, musicConfig, searchViaChat,
 *            searchConfig, fetchConfig, credentialFallback, modelsFetcher,
 *            mediaPriority, hiddenKinds, jevConfig, models
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REGISTRY_INDEX = path.join(ROOT, "open-sse/providers/registry/index.js");
const UI_OUTPUT = path.join(ROOT, "open-sse/providers/registry/ui.js");

const KEPT_FIELDS = [
  "id", "priority", "alias", "aliases", "uiAlias", "category", "hidden",
  "display", "authType", "hasOAuth", "authModes", "noAuth", "authHint",
  "hasProviderSpecificData", "passthroughModels", "hasFree", "features",
  "thinkingConfig", "regions", "defaultRegion", "media", "serviceKinds",
  "ttsConfig", "sttConfig", "embeddingConfig", "imageConfig", "imageToTextConfig",
  "videoConfig", "musicConfig", "searchViaChat", "searchConfig", "fetchConfig",
  "credentialFallback", "modelsFetcher", "mediaPriority", "hiddenKinds",
  "jevConfig", "trialKey", "models",
];

const DROPPED_FIELDS = new Set(["transport", "transports", "oauth", "auth", "pricing", "forceStream"]);

const { default: REGISTRY } = await import(REGISTRY_INDEX);

function pick(entry) {
  const out = {};
  for (const k of KEPT_FIELDS) {
    if (entry[k] !== undefined && !DROPPED_FIELDS.has(k)) {
      out[k] = entry[k];
    }
  }
  return out;
}

const projected = REGISTRY.map(pick);

const header = `// AUTO-GENERATED — UI projection of the provider registry for the client bundle.
//
// \`src/shared/constants/{providers,providersDisplay}.js\` import this file instead of
// \`./index.js\` so the browser never ships server-only data (transport runtime, OAuth
// client secrets/token endpoints, internal retry + credit-pricing flags). Every entry
// in \`index.js\` is present here; only server-side keys are stripped.
//
//   dropped: transport, transports, oauth, auth, pricing, forceStream
//   kept:    id, priority, alias, aliases, uiAlias, category, hidden, display, authType, hasOAuth, authModes, noAuth, authHint, hasProviderSpecificData, passthroughModels, hasFree, features, thinkingConfig, regions, defaultRegion, media, serviceKinds, ttsConfig, sttConfig, embeddingConfig, imageConfig, imageToTextConfig, videoConfig, musicConfig, searchViaChat, searchConfig, fetchConfig, credentialFallback, modelsFetcher, mediaPriority, hiddenKinds, models
//
// This is a snapshot, NOT a live view: it is \`REGISTRY.map(r => pick(r, kept fields))\`
// where REGISTRY is the default export of ./index.js. Regenerate it whenever anything
// under open-sse/providers/registry/ changes — a new provider file, a renamed field, an
// edited display/icon or models array. A new top-level registry field must be classified
// as kept or dropped, then projected here. Never hand-edit the entries below.

export const REGISTRY_UI = ${JSON.stringify(projected, null, 2)};

export default REGISTRY_UI;
`;

fs.writeFileSync(UI_OUTPUT, header, "utf8");
console.log(`Generated ${projected.length} provider UI projections → ${UI_OUTPUT}`);
