/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared packages ship TypeScript-compiled CommonJS from the workspace;
  // transpiling them here keeps one build for both Next.js and NestJS.
  transpilePackages: ['@naqla/domain', '@naqla/contracts', '@naqla/config'],
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
