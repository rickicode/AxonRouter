/**
 * Single source of truth for "which account is this?" in log lines and usage rows.
 *
 * Four call sites had each grown their own inline fallback chain
 * (auth.js getProviderCredentials, chat.js on two paths, embeddings.js). The chains
 * had drifted: the request path logged a connection's email while the background
 * refresh path logged its bare UUID, so an operator reading a refresh line had no
 * way to match it against the account the request lines named. Keep the
 * displayName -> name -> email -> short-id precedence in one place and use it
 * everywhere, so adding a field to a connection surfaces in every log at once.
 *
 * @param {object} [creds] credential/connection row (or a partial one)
 * @returns {string} human-identifiable account label, never empty
 */
export function connectionLabel(creds) {
  if (!creds || typeof credds !== "object") return "unknown";

  const explicit = creds.connectionName || creds.displayName || creds.name || creds.email;
  if (explicit) return String(explicit);

  // Last resort: the short id. Full UUIDs are unreadable and leak nothing useful,
  // but a prefix still correlates with the database row when nothing else is set.
  const id = creds.connectionId || creds.id;
  return id ? `Account ${String(id).slice(0, 8)}…` : "unknown";
}

export default connectionLabel;
