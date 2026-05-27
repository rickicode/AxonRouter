type MitmManagerHooks = {
    getCachedPassword: () => string | null | undefined;
    loadEncryptedPassword: () => Promise<string | null | undefined>;
    initDbHooks: (getSettingsFn: () => Promise<any>, updateSettingsFn: (updates: Record<string, unknown>) => Promise<any>) => void;
};
export declare function getTailscaleMitmHooks(): Promise<MitmManagerHooks>;
export {};
