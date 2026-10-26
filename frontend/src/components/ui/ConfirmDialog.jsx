import { useState } from 'react'
import Dialog from './Dialog'
import { useI18n } from '../../i18n'

/** Confirmation for destructive or hard-to-reverse actions. `onConfirm` may return a promise. */
export default function ConfirmDialog({ title, body, confirmLabel, tone = 'danger', onConfirm, onClose }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } catch {
      // The caller reports the error; keep the dialog open so the user can retry or cancel.
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={title}
      onClose={onClose}
      busy={busy}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={confirm} disabled={busy} autoFocus>
            {busy ? t('common.saving') : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-ink-2">{body}</p>
    </Dialog>
  )
}
