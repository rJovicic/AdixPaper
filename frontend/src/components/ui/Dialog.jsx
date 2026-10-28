import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../i18n'

/**
 * Modal built on the native <dialog>: focus is trapped and the page behind is inert.
 * Escape and backdrop clicks close it unless `busy`.
 */
export default function Dialog({ title, description, onClose, busy = false, size = 'md', children, footer }) {
  const ref = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const titleId = useId()
  const descriptionId = useId()
  const { t } = useI18n()

  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement
    if (dialog && !dialog.open) dialog.showModal()
    // showModal() focuses the first control (the close button) and draws a ring on it; start on the panel
    // instead, unless a field inside asked for focus itself.
    const active = document.activeElement
    if (!dialog?.contains(active) || active === closeRef.current) panelRef.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  const requestClose = () => {
    if (!busy) onClose()
  }

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl' }
  // Phones: forms take the whole screen (like a native sheet); short dialogs rise from the bottom.
  const full = size !== 'sm'
  const phone = full ? 'h-dvh max-h-dvh rounded-none' : 'mt-auto max-h-[92dvh] rounded-t-lg'

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
      className={`enter-rise m-0 w-full max-w-full overflow-hidden bg-stock p-0 text-ink shadow-dialog backdrop:bg-ink/45
        sm:m-auto sm:h-auto sm:max-h-[92dvh] sm:rounded-lg ${phone} ${widths[size]}`}
    >
      {/* Focus starts here, not on the close button: no ring on open, and reading starts at the title. */}
      <div ref={panelRef} tabIndex={-1} className={`flex flex-col focus:outline-none sm:h-auto sm:max-h-[92dvh] ${full ? 'h-dvh' : 'max-h-[92dvh]'}`}>
        <header className="flex items-start gap-3 border-b border-rule px-5 pb-3.5 pt-[max(0.875rem,env(safe-area-inset-top))] sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm text-ink-2">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={requestClose} disabled={busy} className="btn-icon -mr-2 -mt-1" aria-label={t('common.close')}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5">{children}</div>
        {footer && <footer className="safe-bottom flex flex-wrap-reverse justify-end gap-2 border-t border-rule bg-ground/40 px-5 pt-4">{footer}</footer>}
      </div>
    </dialog>
  )
}
