import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
	// --- Output ---
	output: "standalone",

	// --- Standalone file tracing ---
	outputFileTracingRoot: projectRoot,
	outputFileTracingIncludes: {
		"/*": [
			// MITM runs server.ts as a separate child process
			"./src/mitm/server.cjs",
			// Runtime defaults & SQLite migrations read via fs at startup
			"./src/shared/constants/runtimeDefaults.json",
			"./src/lib/migrations/**/*",
		],
	},
	outputFileTracingExcludes: {
		"/*": [
			"./.git/**/*",
			"./coverage/**/*",
			"./tests/**/*",
			"./docker/**/*",
			"./logs/**/*",
		],
	},

	// --- External packages ---
	serverExternalPackages: [
		// Native addons
		"better-sqlite3",
		"node-forge",

		// Dynamic require / native bindings
		"@ngrok/ngrok",
		"paseto",

		// Third-party deps with dynamic require()
		"browserslist",

		// Node built-ins (safety net)
		"child_process",
		"fs",
		"path",
		"os",
		"crypto",
		"net",
		"tls",
		"http",
		"https",
		"stream",
		"buffer",
		"util",
		"process",
	],

	// --- Turbopack ---
	turbopack: {
		root: projectRoot,
		resolveAlias: {},
	},

	// --- Server Actions ---
	experimental: {
		serverActions: {
			bodySizeLimit: process.env.AXONROUTER_SERVER_ACTIONS_BODY_LIMIT || "50mb",
		},
	},

	// --- Transpile packages ---
	transpilePackages: ["open-sse"],

	// --- Images ---
	images: {
		unoptimized: true,
	},

	// --- Dev origins ---
	allowedDevOrigins: ["127.0.0.1", "localhost", "agent-x"],

	// --- TypeScript ---
	typescript: {
		ignoreBuildErrors: true,
	},

	// --- Webpack ---
	webpack(config, { webpack }) {
		// Suppress known non-actionable build warnings (mirrors OmniRoute's approach)
		const isIgnorableWarning = (warning) => {
			const message = typeof warning === "string" ? warning : warning?.message || "";
			const resource = warning?.module?.resource || warning?.file || "";

			if (message.includes("@opentelemetry/exporter-jaeger")) return true;
			if (resource.includes("browserslist/node.js")) return true;
			if (resource.includes("init/route.ts")) return true;

			return false;
		};

		config.ignoreWarnings = [
			...(config.ignoreWarnings || []),
			isIgnorableWarning,
		];

		// Split large vendor bundles
		config.optimization = config.optimization || {};
		config.optimization.splitChunks = {
			...config.optimization.splitChunks,
			cacheGroups: {
				...(config.optimization.splitChunks?.cacheGroups || {}),
				monaco: {
					test: /[\\/]node_modules[\\/]monaco-editor[\\/]/,
					name: "vendor-monaco",
					chunks: "all",
					priority: 20,
				},
				xyflow: {
					test: /[\\/]node_modules[\\/]@xyflow[\\/]/,
					name: "vendor-xyflow",
					chunks: "all",
					priority: 20,
				},
				recharts: {
					test: /[\\/]node_modules[\\/]recharts[\\/]/,
					name: "vendor-recharts",
					chunks: "all",
					priority: 20,
				},
			},
		};

		return config;
	},

	// --- Security headers (global — mirrors OmniRoute) ---
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{
						key: "Content-Security-Policy",
						value: [
							"default-src 'self'",
							"base-uri 'self'",
							"object-src 'none'",
							"frame-ancestors 'none'",
							"form-action 'self'",
							"script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
							"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
							"font-src 'self' https://fonts.gstatic.com data:",
							"img-src 'self' data: blob: https:",
							"media-src 'self' data: blob:",
							"connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https: wss:",
							"worker-src 'self' blob:",
							"manifest-src 'self'",
						].join("; "),
					},
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
					},
					{
						key: "Strict-Transport-Security",
						value: "max-age=63072000; includeSubDomains; preload",
					},
				],
			},
			// V1 API routes get Cache-Control: no-store
			{
				source: "/v1/:path*",
				headers: [
					{ key: "Cache-Control", value: "no-cache, no-store" },
				],
			},
		];
	},

	// --- Redirects ---
	async redirects() {
		return [
			{
				source: "/api/v1/:path*",
				destination: "/v1/:path*",
				permanent: false,
			},
			{
				source: "/api/v1",
				destination: "/v1",
				permanent: false,
			},
			{
				source: "/dashboard/:path*",
				destination: "/app/:path*",
				permanent: false,
			},
			{
				source: "/dashboard",
				destination: "/app",
				permanent: false,
			},
		];
	},

	// --- Rewrites (mirrors OmniRoute — add common API aliases) ---
	async rewrites() {
		return [
			{
				source: "/chat/completions",
				destination: "/api/v1/chat/completions",
			},
			{
				source: "/responses",
				destination: "/api/v1/responses",
			},
			{
				source: "/responses/:path*",
				destination: "/api/v1/responses/:path*",
			},
			{
				source: "/models",
				destination: "/api/v1/models",
			},
			{
				source: "/v1beta/:path*",
				destination: "/api/v1beta/:path*",
			},
			{
				source: "/v1beta",
				destination: "/api/v1beta",
			},
			{
				source: "/v1/v1/:path*",
				destination: "/api/v1/:path*",
			},
			{
				source: "/v1/v1",
				destination: "/api/v1",
			},
			{
				source: "/codex/:path*",
				destination: "/v1/responses",
			},
			{
				source: "/v1/:path*",
				destination: "/api/v1/:path*",
			},
			{
				source: "/v1",
				destination: "/api/v1",
			},
		];
	},
};

export default nextConfig;
