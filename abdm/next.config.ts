import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'tesseract.js', 'canvas'],
};

export default nextConfig;
