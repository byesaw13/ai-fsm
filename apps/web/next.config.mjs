/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@ai-fsm/domain",
    "@ai-fsm/log",
    "@ai-fsm/money",
    "@ai-fsm/email-templates",
  ],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  experimental: {
    typedRoutes: true
  },
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  env: {
    NEXT_PUBLIC_APP_URL: process.env.APP_URL ?? "",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  },
};

export default nextConfig;
