export { proxy } from "./dashboardGuard";

export const config = {
	matcher: [
		"/",
		"/app/:path*",
		"/api/shutdown",
		"/api/version/update",
		"/api/settings/:path*",
		"/api/keys",
		"/api/keys/:path*",
		"/api/providers/:path*",
		"/api/provider-nodes/:path*",
		"/api/proxy-pools/:path*",
		"/api/credentials/:path*",
		"/api/combos/:path*",
		"/api/model-combo-mappings/:path*",
		"/api/models/:path*",
		"/api/oauth/:path*",
		"/api/opencode/:path*",
		"/api/tunnel/:path*",
		"/api/usage/:path*",
		"/api/cli-tools/:path*",
		"/api/skills/:path*",
		"/api/translator/:path*",
		"/api/morph/:path*",
		"/morphllm/:path*",
	],
};
