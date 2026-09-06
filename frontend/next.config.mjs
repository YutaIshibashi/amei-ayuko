/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lolipop does not run a Node server: everything must be a plain file.
  output: 'export',
  // Produces /shop/index.html etc. so Apache can serve extensionless URLs
  // and render.php can locate the shell for a given route.
  trailingSlash: true,
  // next/image optimisation requires a server; images are pre-optimised
  // (WebP) by the sync pipeline and by the asset build instead.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
