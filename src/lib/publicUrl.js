// lib/publicUrl.js
// =========================================================================
// DIRECCIÓN PÚBLICA PARA LOS QR
// -------------------------------------------------------------------------
// El QR impreso tiene que llevar a una dirección que se pueda abrir desde
// cualquier celular. Si se toma la dirección del navegador y la app está
// abierta en la compu (http://localhost:3000), el QR queda apuntando a
// "localhost" — que en el celular no existe — y no lleva a nada.
//
// Por eso los QR usan SIEMPRE la dirección pública del sitio en Netlify:
//   1. NEXT_PUBLIC_APP_URL, si está configurada (por si algún día cambia
//      el dominio — se puede cambiar sin tocar código).
//   2. Si no, la dirección fija de producción (PUBLIC_SITE_URL).
// =========================================================================

export const PUBLIC_SITE_URL = 'https://faro-ilcbeer.netlify.app';

export function qrBaseUrl() {
  const env = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  return env || PUBLIC_SITE_URL;
}

/** true si la dirección solo funciona en esta computadora. */
export function isLocalOnlyUrl(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.endsWith('.local');
  } catch {
    return true;
  }
}
