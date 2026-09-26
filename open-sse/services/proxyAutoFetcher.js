import { getAdapter } from "../../src/lib/db/driver.js";
import { invalidateProxyGroupCache } from "../../src/lib/db/repos/proxyGroupsRepo.js";
import crypto from "crypto";

export async function runProxyAutoFetcher() {
  const db = await getAdapter();
  const groups = await db.all(
    `SELECT id, fetch_url, fetch_interval_ms FROM proxy_groups 
     WHERE fetch_url IS NOT NULL 
     AND (last_fetched_at IS NULL OR last_fetched_at + (fetch_interval_ms * INTERVAL '1 millisecond') < NOW())`
  );

  for (const group of groups) {
    try {
      const response = await fetch(group.fetch_url);
      if (!response.ok) continue;
      
      const proxies = await response.json(); 
      
      await db.run('DELETE FROM proxy_pools WHERE "group" = $1', [group.id]);
      
      for (const proxy of proxies) {
        const pUrl = typeof proxy === 'string' ? proxy : proxy.url;
        if (!pUrl) continue;
        await db.run(
            `INSERT INTO proxy_pools (id, name, proxy_url, "group", is_active, test_status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [crypto.randomUUID(), `Auto-${group.id}-${Date.now()}`, pUrl, group.id, true, 'unknown']
        );
      }
      
      await db.run('UPDATE proxy_groups SET last_fetched_at = NOW() WHERE id = $1', [group.id]);
      invalidateProxyGroupCache(group.id);
      
    } catch (e) {
      console.error(`Error auto-fetching proxy for group ${group.id}:`, e);
    }
  }
}
