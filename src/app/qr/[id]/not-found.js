// app/qr/[id]/not-found.js
// Se muestra si el QR apunta a un sticker que no existe o fue eliminado.
export default function QrNotFound() {
  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 text-center">
        <div className="w-12 h-12 rounded-full mx-auto mb-3 bg-neutral-100 text-neutral-500 grid place-items-center text-2xl">?</div>
        <div className="text-[17px] font-bold text-neutral-900">Sticker no encontrado</div>
        <p className="text-[13px] text-neutral-500 mt-2">
          Este código QR no corresponde a ningún sticker activo. Puede que se haya eliminado
          desde la app. Avisa al área de mantenimiento para reemplazarlo.
        </p>
        <div className="mt-4 text-[11px] text-neutral-400">Calibraciones · LC Beer El Salvador</div>
      </div>
    </div>
  );
}
