/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Allow HMR/dev assets when the app is opened via localhost or 127.0.0.1 on alternate local ports.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    ignoreIssue: [
      { path: '**/next.config*', title: /unexpected file in NFT/ },
      { path: '**/src/lib/tunnel/**', title: /unexpected file in NFT/ },
      { path: '**/src/lib/dataDir*', title: /unexpected file in NFT/ },
      { path: '**/src/lib/sqlite*', title: /unexpected file in NFT/ },
      { path: '**/src/lib/localDbStorage*', title: /unexpected file in NFT/ },
      { path: '**/src/lib/morph/**', title: /unexpected file in NFT/ },
      { path: '**/src/lib/security/**', title: /unexpected file in NFT/ },
      { path: '**/src/mitm/**', title: /unexpected file in NFT/ },
      { path: '**/src/shared/services/initializeApp*', title: /unexpected file in NFT/ },
      { path: '**/src/app/api/**', title: /unexpected file in NFT/ },
    ],
  },
  images: {
    unoptimized: true
  },
  env: {},
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
    ];
  },
  async headers() {
    return [{
      source: '/v1/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Cache-Control', value: 'no-cache, no-store' },
      ],
    }];
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/v1/responses"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
