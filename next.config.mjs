/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // better-sqlite3 is a native module and must be externalized
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
