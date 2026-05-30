/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { externalDir: true },
  // Dev runs on 127.0.0.1 (atproto loopback OAuth requires the IP, not localhost).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
}
export default nextConfig
