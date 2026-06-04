import './globals.css';

export const metadata = {
  title: 'Sistema de Calibraciones | LC Beer',
  description: 'Mantenimiento de Instrumentación',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}