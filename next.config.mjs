/** @type {import('next').NextConfig} */
const nextConfig = {
  // Otras configuraciones que ya tengas...

  serverActions: {
    allowedOrigins: [
      'faro-ilcbeer.netlify.app', 
      '*.netlify.app', 
      'localhost:3000'
    ]
  }
};

export default nextConfig; // o module.exports = nextConfig; dependiendo de tu archivo