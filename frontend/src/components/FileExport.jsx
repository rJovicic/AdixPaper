import { useState } from 'react'
import { Share } from 'lucide-react'
import { downloadFile, errorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import Dialog from './ui/Dialog'

/**
 * Exports and printable labels: `run(path, filename)` downloads, or on iPhone opens the share sheet.
 * Render `dialog` once; it appears only when iOS needs one more tap to share the ready file.
 */
export function useFileExport(failedKey) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const [ready, setReady] = useState(null)
  const [busy, setBusy] = useState(false)

  const run = async (path, filename) => {
    setBusy(true)
    try {
      await downloadFile(path, filename)
    } catch (error) {
      if (error?.code === 'needs-tap') setReady(error.file)
      else toast.error(`${t(failedKey)} ${errorMessage(error, i18n)}`)
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    const file = ready
    setReady(null)
    try {
      await navigator.share({ files: [file] }) // inside the tap, so iOS allows it
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error(t(failedKey))
    }
  }

  const dialog = ready ? (
    <Dialog
      title={t('export.readyTitle')}
      description={ready.name}
      size="sm"
      onClose={() => setReady(null)}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => setReady(null)}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" onClick={share}>
            <Share size={17} aria-hidden="true" /> {t('export.share')}
          </button>
        </>
      }
    >
      <p className="text-ink-2">{t('export.readyBody')}</p>
    </Dialog>
  ) : null

  return { run, busy, dialog }
}
