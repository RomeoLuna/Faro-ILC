/** @type {import('next').NextConfig} */
const nextConfig = {
  serverActions: {
    allowedOrigins: ['faro-ilcbeer.netlify.app']
  }
};

module.exports = nextConfig; // o export default nextConfig; según como lo tengas