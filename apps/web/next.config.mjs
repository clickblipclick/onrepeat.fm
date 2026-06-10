/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { externalDir: true },
  // Load these server-only atproto packages from node_modules at runtime instead of
  // bundling them into webpack server vendor chunks. Bundling produced
  // .next/server/vendor-chunks/@atproto+api@*.js, which the dev static-paths worker for
  // dynamic routes (e.g. /profile/[handle]) intermittently failed to resolve
  // (MODULE_NOT_FOUND) as chunks were re-emitted across recompiles.
  serverExternalPackages: [
    '@atproto/api',
    '@atproto/oauth-client-node',
    '@atproto/jwk-jose',
    'pg-boss',
  ],
  // Dev runs on 127.0.0.1 (atproto loopback OAuth requires the IP, not localhost).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Force HTTPS for two years (with preload-eligible directives). Harmless in dev
          // over http — the header only takes effect on https responses.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Anti-clickjacking: we never frame our own authenticated UI. Belt-and-suspenders
          // with the CSP frame-ancestors below (X-Frame-Options for older agents).
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Drop ambient access to powerful features we don't use.
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ]
  },
}
export default nextConfig
