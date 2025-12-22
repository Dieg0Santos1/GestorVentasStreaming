export function Modal({ open, title, onClose, children, maxWidthClass = 'max-w-lg' }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      {/* Capa para cerrar al hacer clic fuera */}
      <button
        type="button"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
        aria-label="Cerrar modal"
      />

      <div className={`relative z-10 w-full ${maxWidthClass} rounded-2xl bg-white border border-slate-200 shadow-xl p-6`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
