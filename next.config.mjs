/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Blog posts can involve several base64-encoded photos, so raise the
    // server action / route body limit above the default.
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
