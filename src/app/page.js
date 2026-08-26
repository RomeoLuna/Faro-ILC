// app/page.js
// =========================================================================
// ROOT REDIRECT — Sprint 21 (auth-free)
// -------------------------------------------------------------------------
// La raíz "/" no muestra nada propio — la planta entra siempre a alguna
// de las dos secciones operativas. Por convención mandamos a Envasado;
// el sidebar permite cambiar a Ingeniería con un click.
// =========================================================================

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/envasado');
}