import { NextResponse } from "@/lib/http/response.js";
import { cookies } from "@/lib/http/headers.js";
import { clearDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { CSRF_COOKIE_NAME } from "@/lib/security/ingressSecurity.js";

const EXPIRE_COOKIE_OPTS = "Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0";

export async function POST() {
  const cookieStore = await cookies();
  clearDashboardAuthCookie(cookieStore);
  cookieStore.delete("oidc_state");
  cookieStore.delete("oidc_nonce");
  cookieStore.delete("oidc_code_verifier");
  cookieStore.delete("saml_state");
  cookieStore.delete(CSRF_COOKIE_NAME);

  const res = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  res.headers.append("set-cookie", `auth_token=; ${EXPIRE_COOKIE_OPTS}`);
  res.headers.append("set-cookie", `oidc_state=; ${EXPIRE_COOKIE_OPTS}`);
  res.headers.append("set-cookie", `oidc_nonce=; ${EXPIRE_COOKIE_OPTS}`);
  res.headers.append("set-cookie", `oidc_code_verifier=; ${EXPIRE_COOKIE_OPTS}`);
  res.headers.append("set-cookie", `saml_state=; ${EXPIRE_COOKIE_OPTS}`);
  res.headers.append("set-cookie", `${CSRF_COOKIE_NAME}=; ${EXPIRE_COOKIE_OPTS}`);
  return res;
}
