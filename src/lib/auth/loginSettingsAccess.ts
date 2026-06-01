type LoginSettings = {
  password?: string;
  auditLogEnabled?: boolean;
};

export async function getLoginSettings(): Promise<LoginSettings> {
  const { getSettings } = await import("@/lib/localDb");
  return (await getSettings()) as LoginSettings;
}
