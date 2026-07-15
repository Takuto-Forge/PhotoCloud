// import type { NextConfig } from "next";

// const nextConfig: NextConfig = {
//   /* config options here */
// };

// export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
};

export default nextConfig;
