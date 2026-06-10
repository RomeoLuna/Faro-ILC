/** @type {import('next').NextConfig} */
const nextConfig = {
  // Para Next.js 14.1+
  serverActions: {
    allowedOrigins: ['faro-ilcbeer.netlify.app', '*.netlify.app']
  },
  // Para Next.js 13.4 hasta 14.0
  experimental: {
    serverActions: {
      allowedOrigins: ['faro-ilcbeer.netlify.app', '*.netlify.app']
    }
  }
};

module.exports = nextConfig; // Usa 'export default nextConfig;' si tu archivo termina en .mjs