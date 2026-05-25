export const VISIBLE_MEDIA_KINDS = [
  "embedding",
  "image",
  "imageToText",
  "tts",
  "stt",
  "webSearch",
  "webFetch",
  "video",
];

export function matchesHeaderSearch(query: string, ...values: unknown[]) {
  const needle = (query || "").trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}
