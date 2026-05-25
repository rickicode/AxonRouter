import { getConnectionStatusDetails } from "./connectionStatus";

type ConnectionLike = Record<string, unknown> & {
  isActive?: boolean;
};

export function getProviderConnectionStatusSummary(connections: ConnectionLike[] = []) {
  const summary = {
    connected: 0,
    error: 0,
    unknown: 0,
    total: connections.length,
    allDisabled: connections.length > 0 && connections.every((connection) => connection?.isActive === false),
  };

  for (const connection of connections) {
    const status = getConnectionStatusDetails(connection).status;

    if (status === "eligible") summary.connected += 1;
    else if (status === "blocked" || status === "exhausted") summary.error += 1;
    else summary.unknown += 1;
  }

  return summary;
}
