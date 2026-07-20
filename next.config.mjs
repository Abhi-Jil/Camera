/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — no Node server, no backend. Deploys to Vercel as static output.
  output: "export",
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    // Lint locally with `npm run lint`; do not block production builds / Vercel deploys.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
