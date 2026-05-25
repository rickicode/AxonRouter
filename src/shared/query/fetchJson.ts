export class FetchJsonError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "FetchJsonError";
    this.status = status;
    this.payload = payload;
  }
}

function hasJsonContent(response: Response) {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

async function parseResponseBody(response: Response) {
  if (response.status === 204) return undefined;

  if (hasJsonContent(response)) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const maybeMessage = (payload as { message?: unknown; error?: unknown }).message ?? (payload as { error?: unknown }).error;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;
  }
  if (typeof payload === "string" && payload.trim()) return payload;
  return fallback;
}

export async function fetchJson<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new FetchJsonError(getErrorMessage(payload, response.statusText || "Request failed"), response.status, payload);
  }

  return payload as T;
}
