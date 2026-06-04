// app/envasado/layout.js
// =========================================================================
// LAYOUT DE SECCIÓN: ENVASADO
// -------------------------------------------------------------------------
// Layout específico para todas las rutas bajo /envasado/*.
// Hoy solo pasa los children, pero está listo para inyectar:
//   - Un SectionContext (para que componentes hijos sepan el "tone" env/eng)
//   - Breadcrumbs específicos de la sección
//   - Pre-carga de datos en servidor (Server Component)
// =========================================================================

export const metadata = {
  title: 'Sección Envasado | Calibraciones',
};

export default function EnvasadoLayout({ children }) {
  return <>{children}</>;
}
