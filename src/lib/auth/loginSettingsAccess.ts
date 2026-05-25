type LoginSettings = {
  password?: string;
  auditLogEnabled?: boolean;
  tunnelDashboardAccess?: boolean;
  tunnelUrl?: string;
  tailscaleUrl?: string;
};

export async function getLoginSettings(): Promise<LoginSettings> {
  const { getSettings } = await import("@/lib/localDb");
  return (await getSettings()) as LoginSettings;
}
