/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['faro-ilcbeer.netlify.app'],
      // FIX: Next.js limita el tamaño de los Server Actions a 1 MB por
      // defecto — sin avisar con un error claro, la petición simplemente
      // se rechaza antes de llegar a saveExternalCalibration(). Un PDF
      // escaneado casi siempre pesa más de 1 MB, así que "Registrar
      // externo" fallaba en silencio (no guardaba, no cerraba, no
      // actualizaba la lista) aunque la pantalla dijera "máx. 15 MB".
      bodySizeLimit: '15mb',
    }
  }
};

export default nextConfig;