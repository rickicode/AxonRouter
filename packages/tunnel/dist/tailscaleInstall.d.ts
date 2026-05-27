export declare function resolveTailscaleInstallPassword(sudoPassword?: string): Promise<string>;
export declare function resolveTailscaleInstallShortId(): Promise<any>;
export declare function installTailscaleWithRuntime(sudoPassword: string, onProgress: (message: string) => void): Promise<unknown>;
