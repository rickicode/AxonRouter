/**
 * Safely parse JSON from a Request body.
 * Returns { data, error } — never throws.
 */
export async function safeJsonParse<T = any>(request: Request): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await request.json() as T;
    return { data, error: null };
  } catch {
    return { data: null, error: "Invalid or missing JSON body" };
  }
}
