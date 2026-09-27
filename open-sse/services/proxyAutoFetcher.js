import { getAdapter } from "../../src/lib/db/driver.js";
import { invalidateProxyGroupCache } from "../../src/lib/db/repos/proxyGroupsRepo.js";
import { invalidateProxyPoolCache } from "../../src/lib/db/repos/proxyPoolsRepo.js";
import crypto from "crypto";

/**
 * Parse an individual proxy line into a canonical URL string or null.
 *
 * Supported formats:
 * - http://user:pass@host:port, https://..., socks5://..., socks4://...
 * - user:pass@host:port -> http://user:pass@host:port
 * - host:port:user:pass -> http://user:pass@host:port
 * - host:port -> http://host:port
 */
export function parseProxyLine(raw) {
  if (!raw || typeof raw !== "string") return null;
  let line = raw.trim();
  if (!line || line.startsWith("#") || line.startsWith("//")) return null;

  // Strip trailing comments if preceded by whitespace
  const commentIdx = line.search(/\s+[#\/]/);
  if (commentIdx !== -1) {
    line = line.slice(0, commentIdx).trim();
  }

  // 1. Has protocol scheme (http://, https://, socks5://, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(line)) {
    try {
      const u = new URL(line);
      if (u.protocol && u.hostname) {
        return u.href.replace(/\/$/, "");
      }
    } catch {
      return null;
    }
  }

  // 2. user:pass@host:port
  if (line.includes("@")) {
    try {
      const u = new URL("http://" + line);
      if (u.hostname && u.port) {
        return u.href.replace(/\/$/, "");
      }
    } catch {}

    const atIdx = line.lastIndexOf("@");
    const creds = line.slice(0, atIdx);
    const hostPort = line.slice(atIdx + 1);
    const colonIdx = creds.indexOf(":");
    if (colonIdx !== -1) {
      const user = creds.slice(0, colonIdx);
      const pass = creds.slice(colonIdx + 1);
      try {
        const u = new URL(`http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hostPort}`);
        return u.href.replace(/\/$/, "");
      } catch {}
    }
  }

  // 3. host:port:user:pass
  const parts = line.split(":");
  if (parts.length >= 4 && /^\d+$/.test(parts[1])) {
    const host = parts[0];
    const port = parts[1];
    const user = parts[2];
    const pass = parts.slice(3).join(":");
    try {
      const u = new URL(`http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`);
      return u.href.replace(/\/$/, "");
    } catch {}
  }

  // 4. host:port
  if (parts.length === 2 && /^\d+$/.test(parts[1])) {
    const host = parts[0];
    const port = parts[1];
    try {
      const u = new URL(`http://${host}:${port}`);
      return u.href.replace(/\/$/, "");
    } catch {}
  }

  return null;
}

/**
 * Multi-format proxy list parser.
 * Supports plaintext lines and JSON arrays (array of strings or objects).
 * Deduplicates resulting URLs.
 */
export function parseProxyList(content) {
  if (!content) return [];
  const results = [];
  const seen = new Set();

  function addProxy(candidate) {
    if (!candidate) return;
    const raw = typeof candidate === "string"
      ? candidate
      : (candidate.url || candidate.proxy || candidate.proxyUrl || candidate.proxy_url);
    const parsed = parseProxyLine(raw);
    if (parsed && !seen.has(parsed)) {
      seen.add(parsed);
      results.push(parsed);
    }
  }

  if (Array.isArray(content)) {
    for (const item of content) addProxy(item);
    return results;
  }

  if (typeof content === "object" && content !== null) {
    const list = Array.isArray(content.proxies)
      ? content.proxies
      : (Array.isArray(content.data) ? content.data : []);
    for (const item of list) addProxy(item);
    return results;
  }

  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) addProxy(item);
          return results;
        } else if (parsed && typeof parsed === "object") {
          const list = Array.isArray(parsed.proxies)
            ? parsed.proxies
            : (Array.isArray(parsed.data) ? parsed.data : []);
          if (list.length > 0) {
            for (const item of list) addProxy(item);
            return results;
          }
        }
      } catch {
        // Fall back to line by line
      }
    }

    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      addProxy(line);
    }
  }

  return results;
}

/**
 * Smart reconciler for proxy groups.
 * Retains unchanged pools, inserts new ones, and deletes obsolete pools.
 */
export async function reconcileProxyGroup(group, fetchedUrls, db) {
  if (!db) db = await getAdapter();

  const rawPoolIds = group.pool_ids || group.poolIds;
  const poolIds = Array.isArray(rawPoolIds)
    ? rawPoolIds
    : (typeof rawPoolIds === "string"
        ? (() => { try { return JSON.parse(rawPoolIds); } catch { return []; } })()
        : []);

  // 1. Query existing pools where group = group.id or id IN group.pool_ids
  let existingPools = [];
  if (poolIds.length > 0) {
    existingPools = await db.all(
      `SELECT id, name, proxy_url, type, "group", is_active, strict_proxy, test_status, last_tested_at, last_error, data, created_at, updated_at
       FROM proxy_pools
       WHERE "group" = $1 OR id = ANY($2::text[])`,
      [group.id, poolIds]
    );
  } else {
    existingPools = await db.all(
      `SELECT id, name, proxy_url, type, "group", is_active, strict_proxy, test_status, last_tested_at, last_error, data, created_at, updated_at
       FROM proxy_pools
       WHERE "group" = $1`,
      [group.id]
    );
  }

  // Deduplicate incoming URLs
  const uniqueFetchedUrls = [...new Set(fetchedUrls)];
  const fetchedSet = new Set(uniqueFetchedUrls);

  // Map existing pools by proxy_url
  const existingByUrl = new Map();
  const duplicateExistingToDelete = [];
  for (const pool of existingPools) {
    const url = pool.proxy_url;
    if (url && !existingByUrl.has(url)) {
      existingByUrl.set(url, pool);
    } else {
      duplicateExistingToDelete.push(pool);
    }
  }

  const retainedPools = [];
  const obsoletePools = [...duplicateExistingToDelete];

  for (const [url, pool] of existingByUrl.entries()) {
    if (fetchedSet.has(url)) {
      retainedPools.push(pool);
    } else {
      obsoletePools.push(pool);
    }
  }

  // Find newly added URLs
  const newUrls = uniqueFetchedUrls.filter((url) => !existingByUrl.has(url));
  const newPools = [];

  for (let i = 0; i < newUrls.length; i++) {
    const newUrl = newUrls[i];
    let hostLabel = "proxy";
    let type = "http";
    try {
      const u = new URL(newUrl);
      hostLabel = u.port ? `${u.hostname}:${u.port}` : u.hostname;
      if (u.protocol.startsWith("socks")) {
        type = "http";
      }
    } catch {}

    const id = crypto.randomUUID();
    const name = `Auto-${group.name || group.id}-${hostLabel}`;
    newPools.push({
      id,
      name,
      proxyUrl: newUrl,
      group: group.id,
      type,
      isActive: true,
      testStatus: "unknown",
    });
  }

  // Execute in transaction
  await db.transaction(async (tx) => {
    // Insert new pools
    for (const p of newPools) {
      await tx.run(
        `INSERT INTO proxy_pools (id, name, proxy_url, "group", type, is_active, test_status, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, NOW(), NOW())`,
        [p.id, p.name, p.proxyUrl, p.group, p.type, p.isActive, p.testStatus]
      );
    }

    // Delete obsolete pools
    if (obsoletePools.length > 0) {
      const obsoleteIds = obsoletePools.map((p) => p.id);
      await tx.run(
        `DELETE FROM proxy_pools WHERE id = ANY($1::text[])`,
        [obsoleteIds]
      );
    }

    // Update proxy_groups setting pool_ids, last_fetched_at, updated_at
    const finalPoolIds = [...retainedPools.map((p) => p.id), ...newPools.map((p) => p.id)];
    await tx.run(
      `UPDATE proxy_groups
       SET pool_ids = $2::jsonb,
           last_fetched_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [group.id, finalPoolIds]
    );
  });

  invalidateProxyGroupCache(group.id);
  invalidateProxyPoolCache();

  const updatedGroupRow = await db.get(
    `SELECT id, name, description, is_sticky, sticky_limit, pool_ids, fetch_url, fetch_interval_ms, last_fetched_at, data, created_at, updated_at
     FROM proxy_groups
     WHERE id = $1`,
    [group.id]
  );

  const updatedGroup = updatedGroupRow ? {
    id: updatedGroupRow.id,
    name: updatedGroupRow.name,
    description: updatedGroupRow.description || "",
    isSticky: updatedGroupRow.is_sticky === true,
    stickyLimit: updatedGroupRow.sticky_limit || 3,
    poolIds: Array.isArray(updatedGroupRow.pool_ids)
      ? updatedGroupRow.pool_ids
      : (typeof updatedGroupRow.pool_ids === "string" ? JSON.parse(updatedGroupRow.pool_ids) : []),
    fetchUrl: updatedGroupRow.fetch_url,
    fetchIntervalMs: Number(updatedGroupRow.fetch_interval_ms) || 600000,
    lastFetchedAt: updatedGroupRow.last_fetched_at,
    createdAt: updatedGroupRow.created_at,
    updatedAt: updatedGroupRow.updated_at,
  } : null;

  const currentValidPoolIds = [...retainedPools.map((p) => p.id), ...newPools.map((p) => p.id)];
  return {
    count: currentValidPoolIds.length,
    poolIds: currentValidPoolIds,
    retainedCount: retainedPools.length,
    addedCount: newPools.length,
    removedCount: obsoletePools.length,
    group: updatedGroup,
  };
}

/**
 * Manual single-group sync that forces immediate fetch regardless of interval.
 */
export async function syncProxyGroupFromUrl(groupIdOrGroup, db = null) {
  if (!db) db = await getAdapter();
  let group = null;
  if (typeof groupIdOrGroup === "object" && groupIdOrGroup?.id) {
    group = groupIdOrGroup;
  } else {
    group = await db.get(
      `SELECT id, name, description, is_sticky, sticky_limit, pool_ids, fetch_url, fetch_interval_ms, last_fetched_at 
       FROM proxy_groups 
       WHERE id = $1`,
      [groupIdOrGroup]
    );
  }

  if (!group) {
    throw new Error(`Proxy group not found: ${groupIdOrGroup}`);
  }
  const fetchUrl = group.fetch_url || group.fetchUrl;
  if (!fetchUrl) {
    throw new Error(`Proxy group "${group.name}" has no fetch_url configured`);
  }

  const response = await fetch(fetchUrl, {
    headers: {
      "User-Agent": "AxonRouter-ProxyAutoFetcher/1.0",
      "Accept": "text/plain, application/json, */*",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch proxies from ${fetchUrl}: HTTP ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const fetchedUrls = parseProxyList(content);
  const MAX_POOLS_PER_GROUP = 5000;
  if (fetchedUrls.length > MAX_POOLS_PER_GROUP) {
    console.warn(
      `[proxyAutoFetcher] Group "${group.name}" returned ${fetchedUrls.length} proxies; ` +
      `capping to ${MAX_POOLS_PER_GROUP}. Reduce the list size on the subscription endpoint.`,
    );
    fetchedUrls.length = MAX_POOLS_PER_GROUP;
  }

  const result = await reconcileProxyGroup(group, fetchedUrls, db);
  return {
    success: true,
    count: result.count,
    poolIds: result.poolIds,
    retainedCount: result.retainedCount,
    addedCount: result.addedCount,
    removedCount: result.removedCount,
    group: result.group,
  };
}

/**
 * Checks all groups with fetch_url IS NOT NULL where last_fetched_at IS NULL
 * or last_fetched_at + fetch_interval_ms < NOW() and syncs them.
 */
export async function runProxyAutoFetcher(db = null) {
  if (!db) db = await getAdapter();
  const groups = await db.all(
    `SELECT id, name, fetch_url, fetch_interval_ms, last_fetched_at, pool_ids
     FROM proxy_groups 
     WHERE fetch_url IS NOT NULL 
       AND fetch_url != ''
       AND (last_fetched_at IS NULL OR last_fetched_at + (COALESCE(fetch_interval_ms, 600000) * INTERVAL '1 millisecond') < NOW())`
  );

  const results = [];
  for (const group of groups) {
    try {
      const res = await syncProxyGroupFromUrl(group, db);
      results.push({ id: group.id, name: group.name, success: true, count: res.count });
    } catch (e) {
      console.error(`[proxyAutoFetcher] Error fetching group ${group.name} (${group.id}):`, e.message);
      results.push({ id: group.id, name: group.name, success: false, error: e.message });
    }
  }
  return results;
}
