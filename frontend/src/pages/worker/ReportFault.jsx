import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Send } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import Field from '../../components/ui/Field'
import RadioCards from '../../components/ui/RadioCards'
import { ErrorState, LoadingRows } from '../../components/ui/States'

const EMPTY = { oprema_id: '', komponenta_id: '', naslov: '', opis: '', prioritet: 'Normalno' }

// A half-written report survives a reload or an expired session (sign in, come back, carry on).
const draftKey = (userId) => `adix.reportDraft.${userId}`

function readDraft(userId) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey(userId)) || 'null')
    return draft && typeof draft === 'object' ? { ...EMPTY, ...draft } : EMPTY
  } catch {
    return EMPTY
  }
}

function writeDraft(userId, form) {
  try {
    if (form.naslov || form.opis || form.oprema_id) sessionStorage.setItem(draftKey(userId), JSON.stringify(form))
    else sessionStorage.removeItem(draftKey(userId))
  } catch {
    // Storage unavailable: the form still works, it just is not kept.
  }
}

const PRIORITY_MARKERS = {
  Hitno: 'bg-urgent',
  Normalno: 'bg-ink-2',
  Nisko: 'border-[1.5px] border-ink-3',
}

export default function ReportFault() {
  const i18n = useI18n()
  const { t, priority } = i18n
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [params] = useSearchParams()
  // Set when the worker arrived by scanning a machine's QR label.
  const scanned = /^\d+$/.test(params.get('oprema') || '') ? params.get('oprema') : ''
  const [form, setForm] = useState(() => {
    const draft = readDraft(user?.id)
    if (!scanned || draft.oprema_id === scanned) return scanned ? { ...draft, oprema_id: scanned } : draft
    return { ...draft, oprema_id: scanned, komponenta_id: '' }
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const refs = { oprema_id: useRef(null), komponenta_id: useRef(null), naslov: useRef(null) }

  useEffect(() => {
    document.title = `${t('report.title')} · ${t('app.name')}`
  }, [t])

  const machines = useAsync(() => api.get('/oprema').then((response) => asArray(response.data).filter((machine) => machine.status !== 'Raspisano')), [])
  const components = useAsync(async () => {
    if (!form.oprema_id) return []
    const { data } = await api.get(`/oprema/${form.oprema_id}/komponente`)
    return asArray(data).filter((component) => component.aktivna)
  }, [form.oprema_id])

  const componentList = useMemo(() => components.data || [], [components.data])

  useEffect(() => writeDraft(user?.id, form), [user?.id, form])

  // A scanned or remembered machine that is no longer offered (decommissioned, deleted) is dropped.
  useEffect(() => {
    if (machines.data && form.oprema_id && !machines.data.some((machine) => String(machine.id) === String(form.oprema_id))) {
      setForm((current) => ({ ...current, oprema_id: '', komponenta_id: '' }))
    }
  }, [machines.data, form.oprema_id])
  const needsComponent = Boolean(form.oprema_id) && componentList.length > 0

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value, ...(field === 'oprema_id' ? { komponenta_id: '' } : {}) }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (!form.oprema_id) next.oprema_id = t('errors.required')
    if (needsComponent && !form.komponenta_id) next.komponenta_id = t('errors.required')
    if (!form.naslov.trim()) next.naslov = t('errors.required')
    return next
  }

  const submit = async (event) => {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    setFormError('')
    const firstInvalid = ['oprema_id', 'komponenta_id', 'naslov'].find((field) => next[field])
    if (firstInvalid) {
      refs[firstInvalid].current?.focus()
      return
    }
    setSubmitting(true)
    try {
      const { data } = await api.post('/kvarovi', {
        oprema_id: Number(form.oprema_id),
        komponenta_id: form.komponenta_id ? Number(form.komponenta_id) : null,
        naslov: form.naslov.trim(),
        opis: form.opis.trim() || null,
        prioritet: form.prioritet,
      })
      writeDraft(user?.id, EMPTY)
      toast.success(t('report.success', { id: data.id }))
      navigate('/radnik', { state: { newId: data.id } })
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Link to="/radnik" className="btn-quiet -ml-3 mb-2">
        <ArrowLeft size={18} aria-hidden="true" />
        {t('fault.backToMine')}
      </Link>
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">{t('report.title')}</h1>

      {machines.loading && !machines.data ? (
        <div className="surface mt-5"><LoadingRows rows={3} /></div>
      ) : machines.error ? (
        <div className="surface mt-5"><ErrorState error={machines.error} onRetry={machines.reload} /></div>
      ) : machines.data.length === 0 ? (
        <p className="surface mt-5 px-5 py-6 text-ink-2">{t('report.noMachines')}</p>
      ) : (
        <form onSubmit={submit} noValidate className="surface mt-5 space-y-6 px-5 py-6">
          {formError && <p role="alert" className="rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">{formError}</p>}

          <Field
            label={t('report.machine')}
            error={errors.oprema_id}
            hint={scanned && String(form.oprema_id) === scanned ? t('report.scanned') : undefined}
            required
          >
            {(props) => (
              <select {...props} ref={refs.oprema_id} className="control" value={form.oprema_id} onChange={(event) => update('oprema_id', event.target.value)}>
                <option value="">{t('report.machinePlaceholder')}</option>
                {machines.data.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.naziv}{machine.lokacija ? ` — ${machine.lokacija}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {form.oprema_id && (
            <Field
              label={t('report.component')}
              error={errors.komponenta_id}
              hint={needsComponent ? t('report.componentHint') : undefined}
              required={needsComponent}
            >
              {(props) => (
                <select
                  {...props}
                  ref={refs.komponenta_id}
                  className="control"
                  value={form.komponenta_id}
                  disabled={components.loading || !needsComponent}
                  onChange={(event) => update('komponenta_id', event.target.value)}
                >
                  <option value="">{components.loading ? t('common.loading') : needsComponent ? t('report.componentPlaceholder') : t('report.componentNone')}</option>
                  {componentList.map((component) => <option key={component.id} value={component.id}>{component.naziv}</option>)}
                </select>
              )}
            </Field>
          )}

          <Field label={t('report.headline')} error={errors.naslov} required>
            {(props) => (
              <input
                {...props}
                ref={refs.naslov}
                className="control"
                maxLength={200}
                value={form.naslov}
                placeholder={t('report.headlinePlaceholder')}
                onChange={(event) => update('naslov', event.target.value)}
              />
            )}
          </Field>

          <Field label={t('report.details')} error={errors.opis} optional>
            {(props) => (
              <textarea
                {...props}
                className="control"
                rows={3}
                maxLength={5000}
                value={form.opis}
                placeholder={t('report.detailsPlaceholder')}
                onChange={(event) => update('opis', event.target.value)}
              />
            )}
          </Field>

          <RadioCards
            legend={t('report.priority')}
            name="prioritet"
            value={form.prioritet}
            onChange={(value) => update('prioritet', value)}
            options={['Hitno', 'Normalno', 'Nisko'].map((value) => ({
              value,
              label: priority(value),
              hint: t(`priorityHint.${value}`),
              marker: <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-[2px] ${PRIORITY_MARKERS[value]}`} />,
            }))}
          />

          <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full">
            <Send size={19} aria-hidden="true" />
            {submitting ? t('report.submitting') : t('report.submit')}
          </button>
        </form>
      )}
    </div>
  )
}
