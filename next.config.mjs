/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // FIX: la restricción explícita de allowedOrigins estaba causando un
      // 403 Forbidden en TODAS las Server Actions de esta app en Netlify
      // ("POST /certificados 403"), incluso con el dominio correcto en la
      // lista — el origen que Netlify le pasa a Next.js por dentro no
      // siempre coincide exactamente con el dominio público. Se quita la
      // restricción y se deja que Next.js use su propia detección
      // automática del host (comportamiento por defecto sin esta opción).
      bodySizeLimit: '15mb',
    }
  }
};

export default nextConfig;