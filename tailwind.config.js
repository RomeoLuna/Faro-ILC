/**
 * tailwind.config.js
 * Tema industrial de "Sistema de Calibraciones v2".
 * Las paletas brand.* replican exactamente las del Mockup_v2_Calibraciones.html
 * para que los componentes migrados conserven fidelidad visual 1:1.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: [
    './src/app/**/*.{js,jsx,ts,tsx}',
    './src/components/**/*.{js,jsx,ts,tsx}',
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

          // Sección Envasado (azul) e Ingeniería (teal)
          env:        '#2563EB',
          envSoft:    '#DBEAFE',
          eng:        '#0D9488',
          engSoft:    '#CCFBF1',

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