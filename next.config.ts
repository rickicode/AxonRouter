/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@axonrouter/data-dir"],
  // Allow HMR/dev assets when the app is opened via localhost or 127.0.0.1 on alternate local ports.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
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
