import { AlertTriangle, RotateCw } from 'lucide-react'
import { useI18n } from '../../i18n'
import { errorMessage } from '../../api/client'

export function EmptyState({ icon: Icon, title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-rule bg-ground text-ink-2">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {body && <p className="mt-1.5 max-w-[42ch] text-ink-2">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, className = '' }) {
  const i18n = useI18n()
  return (
    <div role="alert" className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-urgent-wash text-urgent">
        <AlertTriangle size={22} aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{i18n.t('errors.loadFailed')}</h2>
      <p className="mt-1.5 max-w-[46ch] text-ink-2">{errorMessage(error, i18n)}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-5">
          <RotateCw size={16} aria-hidden="true" /> {i18n.t('common.retry')}
        </button>
      )}
    </div>
  )
}

/** Placeholder rows shown while a list loads; announced once to screen readers. */
export function LoadingRows({ rows = 5, className = '' }) {
  const { t } = useI18n()
  return (
    <div className={className} aria-busy="true">
      <span className="sr-only" role="status">{t('common.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-rule px-4 py-4 last:border-0" aria-hidden="true">
          <div className="h-6 w-10 animate-pulse rounded-sm bg-ground motion-reduce:animate-none" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-ground motion-reduce:animate-none" />
            <div className="h-3 w-1/3 animate-pulse rounded-sm bg-ground motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PageHeader({ title, meta, actions, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 sm:mb-6 sm:items-end">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[1.75rem]">{title}</h1>
        {meta && <p className="mt-1 text-ink-2">{meta}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
