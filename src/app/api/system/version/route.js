import { NextResponse } from "@/lib/http/response.js";
import { getAppVersion } from "@/lib/db/version.js";

// Cache check result in memory for 6 hours so we don't spam GitHub API
let cache = {
  data: null,
  expiresAt: 0,
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const GITHUB_REPO = "rickicode/AxonRouter";

function parseSemver(v) {
  if (!v || typeof v !== "string") return [0, 0, 0];
  const cleaned = v.replace(/^v/, "").trim();
  const parts = cleaned.split(".").map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts;
}

function isNewer(latest, current) {
  const [lMaj, lMin, lPat] = parseSemver(latest);
  const [cMaj, cMin, cPat] = parseSemver(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export async function GET() {
  const currentVersion = getAppVersion();
  const now = Date.now();

  if (cache.data && cache.expiresAt > now) {
    return NextResponse.json(cache.data);
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        "User-Agent": `AxonRouter/${currentVersion}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 43200 },
    });

    if (!res.ok) {
      // Fallback: check tags if no formal release published yet
      const tagsRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`, {
        headers: { "User-Agent": `AxonRouter/${currentVersion}` },
      });
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        const latestTag = tags[0]?.name || currentVersion;
        const result = {
          currentVersion,
          latestVersion: latestTag,
          hasUpdate: isNewer(latestTag, currentVersion),
          releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
        };
        cache = { data: result, expiresAt: now + CACHE_TTL_MS };
        return NextResponse.json(result);
      }
      return NextResponse.json({ currentVersion, hasUpdate: false });
    }

    const release = await res.json();
    const latestVersion = release.tag_name || release.name || currentVersion;
    const result = {
      currentVersion,
      latestVersion,
      hasUpdate: isNewer(latestVersion, currentVersion),
      releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: release.published_at || null,
    };

    cache = { data: result, expiresAt: now + CACHE_TTL_MS };
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      currentVersion,
      hasUpdate: false,
      error: err.message,
    });
  }
}
