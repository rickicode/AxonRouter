type ProxyPoolFilter = {
	active?: boolean;
};

export const queryKeys = {
	settings: () => ["settings"] as const,
	pricing: () => ["pricing"] as const,
	keys: () => ["keys"] as const,
	endpointMainSettings: () => ["endpoint-main-settings"] as const,
	providers: () => ["providers"] as const,
	provider: (id: string) => ["providers", id] as const,
	providerDetail: (id: string) => ["providers", id, "detail"] as const,
	providerNodes: () => ["provider-nodes"] as const,
	kiloFreeModels: () => ["providers", "kilo", "free-models"] as const,
	proxyPools: (filter?: ProxyPoolFilter) =>
		["proxy-pools", filter ?? {}] as const,
	proxyGroups: () => ["proxy-groups"] as const,
	combos: () => ["combos"] as const,
	modelComboMappings: () => ["model-combo-mappings"] as const,
	modelAliases: () => ["models", "alias"] as const,
	disabledModels: () => ["models", "disabled"] as const,
	providerModels: () => ["provider-models"] as const,

	morphUsage: (period: string) => ["morph", "usage", period] as const,
	usageStats: (period: string) => ["usage", "stats", period] as const,
	usageAnalytics: (period: string) => ["usage", "analytics", period] as const,
	mcpRuntime: () => ["mcp", "runtime"] as const,
	cliToolsBootstrap: () => ["cli-tools", "bootstrap"] as const,
	openCodeBootstrap: () => ["opencode", "bootstrap"] as const,
} as const;
