export const MANAGEMENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
export const MANAGEMENT_SESSION_TTL_PASETO = "365 days";

export const MANAGEMENT_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MANAGEMENT_SESSION_TTL_SECONDS,
};
