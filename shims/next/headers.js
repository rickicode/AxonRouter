import { AsyncLocalStorage } from "node:async_hooks";

export const requestContextStorage = new AsyncLocalStorage();

class CookieJar {
  constructor(initialCookieHeader = "") {
    this._parsed = new Map();
    this._setCookies = [];

    if (initialCookieHeader) {
      const parts = initialCookieHeader.split(";");
      for (const part of parts) {
        const idx = part.indexOf("=");
        if (idx !== -1) {
          const key = part.slice(0, idx).trim();
          const val = part.slice(idx + 1).trim();
          if (key) this._parsed.set(key, val);
        }
      }
    }
  }

  get(name) {
    if (!this._parsed.has(name)) return undefined;
    return { name, value: this._parsed.get(name) };
  }

  getAll(name) {
    if (name) {
      const v = this.get(name);
      return v ? [v] : [];
    }
    return Array.from(this._parsed.entries()).map(([k, v]) => ({ name: k, value: v }));
  }

  has(name) {
    return this._parsed.has(name);
  }

  set(name, value, options = {}) {
    this._parsed.set(name, value);
    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    if (options.path) cookieStr += `; Path=${options.path}`;
    else cookieStr += "; Path=/";

    if (options.maxAge !== undefined) cookieStr += `; Max-Age=${options.maxAge}`;
    if (options.expires) cookieStr += `; Expires=${options.expires.toUTCString ? options.expires.toUTCString() : options.expires}`;
    if (options.domain) cookieStr += `; Domain=${options.domain}`;
    if (options.secure) cookieStr += "; Secure";
    if (options.httpOnly) cookieStr += "; HttpOnly";
    if (options.sameSite) {
      const s = String(options.sameSite).toLowerCase();
      if (s === "lax") cookieStr += "; SameSite=Lax";
      else if (s === "strict") cookieStr += "; SameSite=Strict";
      else if (s === "none") cookieStr += "; SameSite=None";
    }

    this._setCookies.push(cookieStr);
    return this;
  }

  delete(name) {
    this._parsed.delete(name);
    this._setCookies.push(`${encodeURIComponent(name)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`);
    return this;
  }

  getSetCookieHeaders() {
    return [...this._setCookies];
  }
}

export function cookies() {
  const store = requestContextStorage.getStore();
  if (!store || !store.cookieJar) {
    return new CookieJar("");
  }
  return store.cookieJar;
}

export function headers() {
  const store = requestContextStorage.getStore();
  if (!store || !store.request) {
    return new Headers();
  }
  return store.request.headers;
}

export function runWithRequestContext(request, fn) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieJar = new CookieJar(cookieHeader);
  const store = { request, cookieJar };
  return requestContextStorage.run(store, async () => {
    const res = await fn();
    const setCookies = cookieJar.getSetCookieHeaders();
    if (setCookies.length > 0 && res instanceof Response) {
      const newHeaders = new Headers(res.headers);
      for (const c of setCookies) {
        newHeaders.append("set-cookie", c);
      }
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders,
      });
    }
    return res;
  });
}

export default {
  cookies,
  headers,
  runWithRequestContext,
  requestContextStorage,
};
