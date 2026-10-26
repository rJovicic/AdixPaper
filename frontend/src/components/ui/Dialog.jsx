import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * Modal built on the native <dialog>: focus is trapped and the page behind is inert.
 * Escape and backdrop clicks close it unless `busy`.
 */
export default function Dialog({ title, description, onClose, busy = false, size = 'md', children, footer }) {
  const ref = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const { t } = useI18n()

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const requestClose = () => {
    if (!busy) onClose()
  }

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) requestClose()
      }}
      className={`enter-rise m-0 mt-auto max-h-[92dvh] w-full max-w-full overflow-hidden rounded-t-lg bg-stock p-0 text-ink shadow-dialog
        backdrop:bg-ink/45 sm:m-auto sm:rounded-lg ${widths[size]}`}
    >
      <div className="flex max-h-[92dvh] flex-col">
        <header className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-ink-2">{description}</p>}
          </div>
          <button type="button" onClick={requestClose} disabled={busy} className="btn-icon -mr-2 -mt-1" aria-label={t('common.close')}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <footer className="safe-bottom flex flex-wrap-reverse justify-end gap-2 border-t border-rule bg-ground/40 px-5 pt-4">{footer}</footer>}
      </div>
    </dialog>
  )
}
