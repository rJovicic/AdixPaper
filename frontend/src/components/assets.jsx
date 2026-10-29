import { useEffect, useRef, useState } from 'react'
import { Download, QrCode, RefreshCw } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../api/client'
import { useI18n } from '../i18n'
import { focusFirstInvalid } from '../lib/focus'
import { useToast } from './ui/Toast'
import { useFileExport } from './FileExport'
import Dialog from './ui/Dialog'
import ConfirmDialog from './ui/ConfirmDialog'
import Field from './ui/Field'
import { Badge } from './ui/Marks'

// Shared pieces of the machine → component screens (Machines, MachineDetail, ComponentDetail).

export const MACHINE_STATUSES = ['Aktivno', 'Neispravno', 'Na servisu', 'Raspisano']
const STATUS_TONE = { Aktivno: 'success', Neispravno: 'danger', 'Na servisu': 'warning', Raspisano: 'neutral' }

export function MachineStatus({ status }) {
  const { machineStatus } = useI18n()
  return <Badge tone={STATUS_TONE[status]} hollow={status === 'Raspisano'}>{machineStatus(status)}</Badge>
}

export function ActiveBadge({ active }) {
  const { t } = useI18n()
  return <Badge tone={active ? 'success' : 'neutral'} hollow={!active}>{active ? t('common.active') : t('common.inactive')}</Badge>
}

/** An identifier, or a quiet "Not entered" so an empty field reads as missing data, not as blank. */
export function Identifier({ value }) {
  const { t } = useI18n()
  return value ? <span className="tabular">{value}</span> : <span className="text-ink-3">{t('assets.notEntered')}</span>
}

/** Downloads printable QR labels for any of the label endpoints. */
export function useLabels() {
  const exporter = useFileExport('machines.qrFailed')
  return { busy: exporter.busy, dialog: exporter.dialog, download: (path, filename) => exporter.run(path, filename) }
}

const EMPTY_COMPONENT = { naziv: '', model: '', proizvodac: '', inventurni_broj: '', serijski_broj: '', opis: '' }

/** Add or edit a component of a machine. Identifiers are optional: the real values often come later. */
export function ComponentDialog({ machineId, component, onClose, onSaved }) {
  const i18n = useI18n()
  const { t } = i18n
  const [form, setForm] = useState(() => (component
    ? Object.fromEntries(Object.keys(EMPTY_COMPONENT).map((key) => [key, component[key] ?? '']))
    : EMPTY_COMPONENT))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!form.naziv.trim()) {
      setErrors({ naziv: t('errors.required') })
      focusFirstInvalid(formRef)
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { data } = component
        ? await api.put(`/oprema/komponente/${component.id}`, form)
        : await api.post(`/oprema/${machineId}/komponente`, { ...form, aktivna: true })
      onSaved(data, !component)
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSaving(false)
    }
  }

  const text = (field, label, { required = false, max = 100, hint } = {}) => (
    <Field label={label} error={errors[field]} required={required} optional={!required} hint={hint}>
      {(props) => <input {...props} className="control" maxLength={max} value={form[field]} onChange={update(field)} />}
    </Field>
  )

  return (
    <Dialog
      title={component ? t('assets.editComponent') : t('assets.addComponent')}
      description={component?.naziv}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="component-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </>
      }
    >
      <form id="component-form" ref={formRef} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent sm:col-span-2">{formError}</p>}
        <div className="sm:col-span-2">{text('naziv', t('assets.componentName'), { required: true, max: 150 })}</div>
        {text('model', t('machines.model'))}
        {text('proizvodac', t('machines.manufacturer'))}
        {text('inventurni_broj', t('assets.inventory'), { hint: t('assets.identifierHint') })}
        {text('serijski_broj', t('machines.serial'))}
        <Field label={t('assets.description')} optional className="sm:col-span-2">
          {(props) => <textarea {...props} className="control" rows={2} maxLength={5000} value={form.opis} onChange={update('opis')} />}
        </Field>
      </form>
    </Dialog>
  )
}

/**
 * The QR code of a machine or a component, its printable label, and (rarely) a new identifier.
 * `labelPath`: the PDF endpoint; `renewPath`: POST endpoint that issues a new identifier.
 */
export function QrPanel({ oznaka, labelPath, labelFile, renewPath, onRenewed }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const labels = useLabels()
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    if (!oznaka) return undefined
    let url = null
    let current = true
    setFailed(false)
    api.get(`/qr/${oznaka}/slika.svg`, { responseType: 'blob' })
      .then((response) => {
        if (!current) return
        url = URL.createObjectURL(response.data)
        setSrc(url)
      })
      .catch(() => current && setFailed(true))
    return () => {
      current = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [oznaka])

  const renew = async () => {
    try {
      const { data } = await api.post(renewPath)
      toast.success(t('assets.qrRenewed'))
      onRenewed?.(data)
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  return (
    <section aria-labelledby="qr-title" className="surface p-4 sm:p-5">
      {labels.dialog}
      <h2 id="qr-title" className="flex items-center gap-2 font-semibold"><QrCode size={18} aria-hidden="true" className="text-ink-2" /> {t('assets.qrTitle')}</h2>
      <div className="mt-3 flex items-start gap-4">
        <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-md border border-rule bg-stock p-2">
          {src ? <img src={src} alt={t('assets.qrAlt')} className="h-full w-full" /> : <span className="text-center text-meta text-ink-3">{failed ? t('assets.qrUnavailable') : t('common.loading')}</span>}
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm text-ink-2">
          <p>{t('assets.qrHelp')}</p>
          <p className="break-all text-meta">{t('assets.qrCode')}: <span className="font-mono text-ink">{oznaka}</span></p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={labels.busy} onClick={() => labels.download(labelPath, labelFile)}>
          <Download size={17} aria-hidden="true" /> {t('assets.qrDownload')}
        </button>
        {renewPath && (
          <button type="button" className="btn-quiet" onClick={() => setRenewing(true)}>
            <RefreshCw size={16} aria-hidden="true" /> {t('assets.qrRenew')}
          </button>
        )}
      </div>
      {renewing && (
        <ConfirmDialog
          title={t('assets.qrRenewTitle')}
          body={t('assets.qrRenewBody')}
          confirmLabel={t('assets.qrRenew')}
          onConfirm={renew}
          onClose={() => setRenewing(false)}
        />
      )}
    </section>
  )
}
