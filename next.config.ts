import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    serverActions: {
      // Applicant forms upload up to two 5 MB documents (Form 138, PSA)
      // plus multipart overhead.
      bodySizeLimit: "11mb",
    },
  },
  async redirects() {
    return [
      // The Users & Roles module was renamed to User Management.
      { source: "/users-roles", destination: "/user-management/accounts", permanent: true },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
