/**
 * tailwind.config.js
 * Tema industrial de "Sistema de Calibraciones v2".
 * Sprint 36: agregada paleta 'qual' para la sección Calidad.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  safelist: [
    // Sprint 36: fuerza a Tailwind a generar las clases dinámicas de las 3
    // secciones aunque el JIT no las detecte por interpolación.
    'bg-brand-env',   'border-brand-env',   'ring-brand-env/40',   'hover:border-brand-env',   'text-brand-env',   'border-t-brand-env',
    'bg-brand-eng',   'border-brand-eng',   'ring-brand-eng/40',   'hover:border-brand-eng',   'text-brand-eng',   'border-t-brand-eng',
    'bg-brand-qual',  'border-brand-qual',  'ring-brand-qual/40',  'hover:border-brand-qual',  'text-brand-qual',  'border-t-brand-qual',
    'bg-brand-qual/20',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // Superficies oscuras (sidebar / topbar)
          ink:        '#0B0B0C',
          graphite:   '#1A1A1D',
          steel:      '#2A2A2F',
          line:       '#3A3A40',

          // Acento corporativo (AB InBev)
          amber:      '#F2A900',
          amberHover: '#D49300',
          amberSoft:  '#FFF5DD',

          // Sección Envasado (azul), Ingeniería (teal), Calidad (púrpura)
          env:        '#2563EB',
          envSoft:    '#DBEAFE',
          eng:        '#0D9488',
          engSoft:    '#CCFBF1',
          qual:       '#7C3AED',
          qualSoft:   '#EDE9FE',

          // Semánticos de estado
          pass:       '#059669',
          passSoft:   '#D1FAE5',
          fail:       '#DC2626',
          failSoft:   '#FEE2E2',
          warn:       '#F59E0B',
          warnSoft:   '#FEF3C7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
        pop:  '0 10px 30px rgba(0,0,0,0.18)',
      },
    },
  },
  plugins: [],
};