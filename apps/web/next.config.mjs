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
  ],
  // Dev runs on 127.0.0.1 (atproto loopback OAuth requires the IP, not localhost).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}
export default nextConfig
