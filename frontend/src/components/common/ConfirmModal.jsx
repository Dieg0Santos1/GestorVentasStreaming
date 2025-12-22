import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

const icons = {
  warning: { Icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
  danger: { Icon: XCircle, color: 'text-rose-600', bg: 'bg-rose-100' },
  success: { Icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  info: { Icon: Info, color: 'text-blue-600', bg: 'bg-blue-100' },
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = '¿Estás seguro?',
  message = 'Esta acción no se puede deshacer.',
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'warning', // 'warning' | 'danger' | 'success' | 'info'
  confirmButtonClass = '',
}) {
  if (!open) return null

  const { Icon, color, bg } = icons[type] || icons.warning

  const defaultConfirmClass =
    type === 'danger'
      ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800'
      : type === 'success'
      ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800'
      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="text-center">
            <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full ${bg} mb-4`}>
              <Icon className={`h-8 w-8 ${color}`} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-600 mb-6">{message}</p>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-lg border-2 border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-6 py-2.5 rounded-lg text-white font-semibold transition-all shadow-lg ${
                  confirmButtonClass || defaultConfirmClass
                }`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
