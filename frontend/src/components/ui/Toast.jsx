import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { useI18n } from '../../i18n'

const ToastContext = createContext(null)

const TONES = {
  success: { icon: Check, mark: 'bg-ok text-stock' },
  error: { icon: AlertTriangle, mark: 'bg-urgent text-stock' },
  info: { icon: Info, mark: 'bg-brand text-stock' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(1)
  const { t } = useI18n()

  const dismiss = useCallback((id) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])

  const show = useCallback((message, { tone = 'success', action, duration } = {}) => {
    const id = nextId.current++
    setToasts((list) => [...list.slice(-2), { id, message, tone, action }])
    const ms = duration ?? (tone === 'error' ? 9000 : action ? 12000 : 5000)
    window.setTimeout(() => dismiss(id), ms)
    return id
  }, [dismiss])

  const api = useMemo(() => ({
    success: (message, options) => show(message, { ...options, tone: 'success' }),
    error: (message, options) => show(message, { ...options, tone: 'error' }),
    info: (message, options) => show(message, { ...options, tone: 'info' }),
  }), [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 sm:bottom-auto sm:left-auto sm:top-0 sm:items-end"
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.tone]
          const Icon = tone.icon
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="enter-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-rule bg-stock p-3 pr-2 shadow-lift"
            >
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${tone.mark}`}>
                <Icon size={15} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[0.9375rem] leading-snug text-ink">{toast.message}</p>
                {toast.action && (
                  <Link to={toast.action.to} onClick={() => dismiss(toast.id)} className="link mt-1 inline-block text-sm">
                    {toast.action.label}
                  </Link>
                )}
              </div>
              <button type="button" onClick={() => dismiss(toast.id)} className="btn-icon h-8 w-8" aria-label={t('common.close')}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
