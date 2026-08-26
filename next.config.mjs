/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['faro-ilcbeer.netlify.app']
    }
  }
};

export default nextConfig;