import fs from "node:fs/promises";
import { prepareRequestDetailsStatement } from "./core";
import { deleteRequestDetailPayloadFiles } from "./payloadStore";

function safeParseJson(content: string) {
  try { return JSON.parse(content); } catch { return {}; }
}

export async function clearRequestDetailsByFilter({ onlyReplayable = false, onlyTraced = false } = {}) {
  const rows = prepareRequestDetailsStatement(`
    SELECT id, request_payload_path, provider_request_payload_path, provider_response_payload_path, response_payload_path
    FROM request_details_index
    ORDER BY timestamp DESC
  `).all();

  const deleteStmt = prepareRequestDetailsStatement(`DELETE FROM request_details_index WHERE id = ?`);
  let deleted = 0;

  for (const row of rows) {
    const request = row.request_payload_path ? safeParseJson(await fs.readFile(row.request_payload_path, "utf8").catch(() => "{}")) : {};
    const providerResponse = row.provider_response_payload_path ? safeParseJson(await fs.readFile(row.provider_response_payload_path, "utf8").catch(() => "{}")) : {};
    const hasTrace = !!providerResponse?.trace;
    const replayable = !!request?.correlation_id || hasTrace;

    if (onlyReplayable && !replayable) continue;
    if (onlyTraced && !hasTrace) continue;

    deleteStmt.run(row.id);
    await deleteRequestDetailPayloadFiles({
      request: row.request_payload_path,
      providerRequest: row.provider_request_payload_path,
      providerResponse: row.provider_response_payload_path,
      response: row.response_payload_path,
    });
    deleted += 1;
  }

  return { deleted };
}
