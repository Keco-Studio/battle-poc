/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * WSL / multiple `next dev` / antivirus: webpack persistent pack cache can throw
   * `ENOENT ... rename ... 0.pack.gz_ -> 0.pack.gz`, then static chunks/CSS return 500.
   * Disabling webpack disk cache in dev avoids that (slightly slower cold compiles).
   */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/favicon.svg', permanent: false }]
  },
}

module.exports = nextConfig
