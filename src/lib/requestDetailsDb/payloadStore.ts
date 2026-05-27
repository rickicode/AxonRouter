import fs from "node:fs/promises";
import path from "node:path";
import { getDataDir } from "../dataDir";

let _requestDetailsPayloadDir: string | undefined;
function getRequestDetailsPayloadDir() {
  return _requestDetailsPayloadDir ??= path.join(getDataDir(), "request-details");
}
const DEFAULT_REQUEST_PAYLOAD_MAX_BYTES = 16 * 1024;
const DEFAULT_RESPONSE_PAYLOAD_MAX_BYTES = 64 * 1024;

function getDateDir(timestamp: any) {
  const date = new Date(timestamp || Date.now());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildRequestDetailPayloadPaths(id: any, timestamp: any) {
  const dayDir = path.join(getRequestDetailsPayloadDir(), getDateDir(timestamp));
  return {
    dir: dayDir,
    request: path.join(dayDir, `${id}.request.json`),
    providerRequest: path.join(dayDir, `${id}.provider-request.json`),
    providerResponse: path.join(dayDir, `${id}.provider-response.json`),
    response: path.join(dayDir, `${id}.response.json`),
  };
}

export function serializePayloadForStorage(value: any, maxBytes: any) {
  const raw = JSON.stringify(value ?? null);
  const rawBytes = Buffer.byteLength(raw, "utf8");
  if (rawBytes <= maxBytes) {
    return { value: value ?? null, truncated: false, size: rawBytes };
  }

  const preview = typeof value === "string" ? value.slice(0, Math.max(128, Math.floor(maxBytes / 4))) : raw.slice(0, Math.max(128, Math.floor(maxBytes / 4)));
  return {
    value: {
      _truncated: true,
      _originalBytes: rawBytes,
      _preview: preview,
    },
    truncated: true,
    size: rawBytes,
  };
}

async function writeJsonFile(filePath: any, payload: any) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
}

export async function writeRequestDetailPayloadFiles(detail: any) {
  const paths = buildRequestDetailPayloadPaths(detail.id, detail.timestamp);
  const requestPayload = serializePayloadForStorage(detail.request, DEFAULT_REQUEST_PAYLOAD_MAX_BYTES);
  const providerRequestPayload = serializePayloadForStorage(detail.providerRequest, DEFAULT_REQUEST_PAYLOAD_MAX_BYTES);
  const providerResponsePayload = serializePayloadForStorage(detail.providerResponse, DEFAULT_RESPONSE_PAYLOAD_MAX_BYTES);
  const responsePayload = serializePayloadForStorage(detail.response, DEFAULT_RESPONSE_PAYLOAD_MAX_BYTES);

  await Promise.all([
    writeJsonFile(paths.request, requestPayload.value),
    writeJsonFile(paths.providerRequest, providerRequestPayload.value),
    writeJsonFile(paths.providerResponse, providerResponsePayload.value),
    writeJsonFile(paths.response, responsePayload.value),
  ]);

  return {
    paths,
    truncated: requestPayload.truncated || providerRequestPayload.truncated || providerResponsePayload.truncated || responsePayload.truncated,
  };
}

export async function readRequestDetailPayloadFile(filePath: any) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function deleteRequestDetailPayloadFiles(paths: any = {}) {
  const targets = [
    paths.request,
    paths.providerRequest,
    paths.providerResponse,
    paths.response,
  ].filter(Boolean);

  await Promise.all(targets.map(async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch {}
  }));
}
