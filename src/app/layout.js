// app/layout.js
// =========================================================================
// ROOT LAYOUT — Minimal
// -------------------------------------------------------------------------
// El layout maestro ahora vive en app/(app)/layout.js (donde inyecta el
// Sidebar + Topbar). Este root layout sólo:
//   - Establece <html>/<body>
//   - Importa los estilos globales
//
// Las rutas se dividen en dos grupos:
//   - (app)/  → layout con shell (Sidebar + TopNav), requiere sesión.
//   - /login  → standalone, sin shell, accesible sin sesión.
// =========================================================================

import './globals.css';

export const metadata = {
  title: 'Sistema de Calibraciones | LC Beer El Salvador',
  description: 'Gestión de calibraciones — Envasado e Ingeniería',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}