// app/page.js
// =========================================================================
// PÁGINA RAÍZ ("/")
// -------------------------------------------------------------------------
// Al entrar a la app, redirigimos al Faro de la Sección Envasado, que es
// el ecosistema por defecto del operador en planta.
// =========================================================================

import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/envasado');
}
