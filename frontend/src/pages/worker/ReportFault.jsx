import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Factory, Info, Plus, QrCode, Search, Send, X } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import Field from '../../components/ui/Field'
import RadioCards from '../../components/ui/RadioCards'
import { ErrorState, LoadingRows } from '../../components/ui/States'
import { PriorityMark, StatusMark } from '../../components/ui/Marks'
import PushToggle from '../../components/PushToggle'
import { uploadPhoto } from '../../lib/photo'
import { scanSupported } from '../../lib/qr'

const EMPTY = { oprema_id: '', komponenta_id: '', naslov: '', opis: '', prioritet: 'Normalno', kljuc: '', korak: 1 }
const STEPS = 3
const BASE = '/radnik'
const MAX_PHOTOS = 5 // the server keeps up to 6 per fault; one is left for the lead
const PRIORITY_DOT = { Hitno: 'bg-urgent-mark', Normalno: 'bg-warn-mark', Nisko: 'border-2 border-slate-mark' }

/** One key per report: a retry after a lost response returns the fault already saved instead of a duplicate. */
function newKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

// A half-written report, and the step it was on, survive a reload or an expired session.
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

/** Open faults already reported on the chosen machine. Informs; never blocks a new report. */
function KnownFaults({ faults }) {
  const { t, format } = useI18n()
  if (!faults?.length) return null
  return (
    <div role="status" className="rounded-md border border-brand/30 bg-brand-wash px-4 py-3">
      <p className="flex items-start gap-2 font-semibold text-brand-deep">
        <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t('report.knownTitle', { n: faults.length })}
      </p>
      <ul className="mt-2 space-y-1.5 pl-[1.625rem]">
        {faults.slice(0, 4).map((fault) => (
          <li key={fault.id} className="text-sm">
            <span className="font-semibold text-ink"><span className="numeral text-ink-3">#</span>{fault.id} {fault.naslov}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-ink-2">
              <StatusMark status={fault.status} className="text-meta" />
              {fault.komponenta && <span className="text-meta">{fault.komponenta.naziv}</span>}
              <span className="text-meta tabular">{format.dateShort(fault.datum_prijave)}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 pl-[1.625rem] text-sm text-ink-2">{t('report.knownBody')}</p>
    </div>
  )
}

/** 1 · 2 · 3 with the current step named; read out as "Step 2 of 3: Description". */
function Stepper({ step, labels }) {
  const { t } = useI18n()
  return (
    <ol aria-label={t('report.steps')} className="flex items-center gap-2">
      {labels.map((label, index) => {
        const number = index + 1
        const done = number < step
        const current = number === step
        return (
          <li key={label} aria-current={current ? 'step' : undefined} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold ${
                current ? 'bg-brand text-stock' : done ? 'bg-brand-wash text-brand' : 'border border-rule-strong/60 bg-stock text-ink-3'
              }`}
            >
              {done ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : number}
              <span className="sr-only">{done ? t('report.stepDone') : ''}</span>
            </span>
            <span className={`truncate text-sm ${current ? 'font-semibold text-ink' : 'text-ink-3'} ${current ? '' : 'hidden xs:inline'}`}>{label}</span>
            {number < labels.length && <span aria-hidden="true" className="h-px min-w-[1rem] flex-1 bg-rule" />}
          </li>
        )
      })}
    </ol>
  )
}

/** The machines as a searchable list of large radio rows. */
function MachinePicker({ machines, value, onChange, error, inputRef, scanned }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const labelId = useId()
  const errorId = useId()
  const needle = query.trim().toLocaleLowerCase()
  const shown = needle
    ? machines.filter((machine) => `${machine.naziv} ${machine.lokacija || ''} ${machine.tip || ''}`.toLocaleLowerCase().includes(needle))
    : machines
  return (
    <div>
      <p id={labelId} className="sr-only">{t('report.machine')}</p>
      {machines.length > 6 && (
        <div className="relative mb-2">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className="control pl-9"
            aria-label={t('report.machineSearch')}
            placeholder={t('report.machineSearch')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      {scanned && <p className="mb-2 text-meta text-ink-2">{t('report.scanned')}</p>}
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={`max-h-[min(26rem,52dvh)] overflow-y-auto rounded-md border ${error ? 'border-urgent' : 'border-rule'}`}
      >
        {shown.length === 0 ? (
          <p className="px-4 py-5 text-center text-ink-2">{t('report.machineNone')}</p>
        ) : shown.map((machine, index) => {
          const checked = String(machine.id) === String(value)
          return (
            <label
              key={machine.id}
              className={`flex min-h-[3.5rem] cursor-pointer items-center gap-3 border-b border-rule px-3 py-2.5 transition-colors last:border-b-0
                has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-brand
                ${checked ? 'bg-brand-wash' : 'bg-stock hover:bg-ground/70'}`}
            >
              <input
                ref={index === 0 || checked ? inputRef : undefined}
                type="radio"
                name="oprema"
                value={machine.id}
                checked={checked}
                onChange={() => onChange(String(machine.id))}
                className="sr-only"
              />
              <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${checked ? 'bg-brand text-stock' : 'bg-info-wash text-brand'}`}>
                <Factory size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{machine.naziv}</span>
                {machine.lokacija && <span className="block truncate text-meta text-ink-2">{machine.lokacija}</span>}
              </span>
              <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-brand bg-brand text-stock' : 'border-rule-strong/70'}`}>
                {checked && <Check size={14} strokeWidth={3} />}
              </span>
            </label>
          )
        })}
      </div>
      {error && <p id={errorId} className="mt-1.5 text-sm font-medium text-urgent">{error}</p>}
    </div>
  )
}

function PhotoStrip({ photos, onAdd, onRemove }) {
  const { t } = useI18n()
  const input = useRef(null)
  const urls = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos])
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls])
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">
        {t('report.photos')} <span className="font-normal text-ink-3">({t('common.optional')})</span>
      </p>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onAdd(Array.from(event.target.files || []))
          event.target.value = ''
        }}
      />
      <ul className="flex flex-wrap gap-2.5">
        {photos.map((file, index) => (
          <li key={urls[index]} className="relative">
            <img src={urls[index]} alt={t('report.photoPreview', { n: index + 1 })} className="h-20 w-20 rounded-md object-cover" />
            <button
              type="button"
              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink text-stock shadow-lift"
              aria-label={t('report.photoRemove', { n: index + 1 })}
              onClick={() => onRemove(index)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
        {photos.length < MAX_PHOTOS && (
          <li>
            <button
              type="button"
              className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-rule-strong bg-ground/60 text-meta font-semibold text-ink-2 transition-colors hover:border-brand hover:text-brand"
              onClick={() => input.current?.click()}
            >
              {photos.length ? <Plus size={20} aria-hidden="true" /> : <Camera size={20} aria-hidden="true" />}
              {photos.length ? t('report.photoMore') : t('report.photoAddShort')}
            </button>
          </li>
        )}
      </ul>
      <p className="mt-1.5 text-meta text-ink-3">{t('report.photosHint', { n: MAX_PHOTOS })}</p>
    </div>
  )
}

/** After sending: what was reported, where to follow it, and (where the server supports it) phone notifications. */
function Reported({ fault, machine, onNew }) {
  const { t } = useI18n()
  const heading = useRef(null)
  useEffect(() => heading.current?.focus(), [])
  const to = `/radnik/kvar/${fault.id}`
  return (
    <div className="enter-rise mx-auto max-w-md pt-4 text-center">
      <span aria-hidden="true" className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ok-mark text-stock shadow-[0_10px_24px_-10px_rgb(22_163_106/0.8)]">
        <Check size={34} strokeWidth={3} />
      </span>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-xl font-semibold text-ink focus:outline-none">{t('report.doneTitle')}</h1>
      <p className="mt-1 text-ink-2">{t('report.doneBody')}</p>
      <dl className="surface mt-5 divide-y divide-rule text-left">
        <div className="px-4 py-3">
          <dt className="field-label">{t('report.doneNumber')}</dt>
          <dd className="numeral text-lg text-ink">#{fault.id}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="field-label">{t('report.machine')}</dt>
          <dd className="font-semibold text-ink">{machine?.naziv || '—'}{fault.komponenta ? ` · ${fault.komponenta.naziv}` : ''}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="field-label">{t('fault.priority')}</dt>
          <dd className="mt-0.5"><PriorityMark priority={fault.prioritet} /></dd>
        </div>
      </dl>
      <div className="mt-5 grid gap-2.5">
        <Link to={to} className="btn-primary btn-lg w-full">{t('report.doneOpen')}</Link>
        <button type="button" className="btn-secondary btn-lg w-full" onClick={onNew}>
          <Plus size={18} aria-hidden="true" /> {t('report.doneNew')}
        </button>
      </div>
      <div className="mt-4 text-left empty:hidden">
        <PushToggle variant="card" hint={t('worker.pushHint')} />
      </div>
    </div>
  )
}

/** The worker's report, in three short steps. Administrators and leads manage faults; they do not report them here. */
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
    const stored = readDraft(user?.id)
    const draft = stored.kljuc ? stored : { ...stored, kljuc: newKey() }
    if (!scanned || draft.oprema_id === scanned) return scanned ? { ...draft, oprema_id: scanned } : draft
    return { ...draft, oprema_id: scanned, komponenta_id: '', korak: 1 }
  })
  const step = Math.min(STEPS, Math.max(1, Number(form.korak) || 1))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState('') // '' | 'report' | 'photo'
  const [photoProgress, setPhotoProgress] = useState({ n: 0, of: 0 })
  const [photos, setPhotos] = useState([])
  const [done, setDone] = useState(null)
  const refs = { oprema_id: useRef(null), komponenta_id: useRef(null), naslov: useRef(null) }
  const stepHeading = useRef(null)
  const autoAdvanced = useRef(false)
  const canScan = scanSupported()

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
  // A failure here only hides the hint; reporting must keep working.
  const known = useAsync(
    () => (form.oprema_id ? api.get(`/kvarovi/na-masini/${form.oprema_id}`).then((response) => asArray(response.data)).catch(() => []) : []),
    [form.oprema_id],
  )
  const machine = (machines.data || []).find((item) => String(item.id) === String(form.oprema_id))

  useEffect(() => {
    if (!done) writeDraft(user?.id, form)
  }, [user?.id, form, done])

  // A scanned or remembered machine that is no longer offered (decommissioned, deleted) is dropped.
  useEffect(() => {
    if (machines.data && form.oprema_id && !machines.data.some((item) => String(item.id) === String(form.oprema_id))) {
      setForm((current) => ({ ...current, oprema_id: '', komponenta_id: '', korak: 1 }))
    }
  }, [machines.data, form.oprema_id])
  const needsComponent = Boolean(form.oprema_id) && componentList.length > 0

  // Scanned a machine with no parts to choose: nothing to do on step 1, go straight to the description.
  useEffect(() => {
    if (scanned && !autoAdvanced.current && step === 1 && machine && components.data && !components.loading && !needsComponent) {
      autoAdvanced.current = true
      setForm((current) => ({ ...current, korak: 2 }))
    }
  }, [scanned, step, machine, components.data, components.loading, needsComponent])

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value, ...(field === 'oprema_id' ? { komponenta_id: '' } : {}) }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const goTo = (next) => {
    setForm((current) => ({ ...current, korak: next }))
    setFormError('')
    window.scrollTo({ top: 0 })
    requestAnimationFrame(() => stepHeading.current?.focus())
  }

  const stepErrors = (which) => {
    const next = {}
    if (which === 1) {
      if (!form.oprema_id) next.oprema_id = t('errors.required')
      if (needsComponent && !form.komponenta_id) next.komponenta_id = t('errors.required')
    }
    if (which === 2 && !form.naslov.trim()) next.naslov = t('errors.required')
    return next
  }

  const showErrors = (next) => {
    setErrors(next)
    const firstInvalid = ['oprema_id', 'komponenta_id', 'naslov'].find((field) => next[field])
    if (firstInvalid) refs[firstInvalid].current?.focus()
    return Boolean(firstInvalid)
  }

  const next = (event) => {
    event.preventDefault()
    if (showErrors(stepErrors(step))) return
    goTo(step + 1)
  }

  const submit = async (event) => {
    event.preventDefault()
    for (const which of [1, 2]) {
      const found = stepErrors(which)
      if (Object.keys(found).length) {
        goTo(which)
        requestAnimationFrame(() => showErrors(found))
        return
      }
    }
    if (submitting) return // a second tap while sending; the server would deduplicate it anyway
    setSubmitting('report')
    setFormError('')
    try {
      const { data } = await api.post('/kvarovi', {
        oprema_id: Number(form.oprema_id),
        komponenta_id: form.komponenta_id ? Number(form.komponenta_id) : null,
        naslov: form.naslov.trim(),
        opis: form.opis.trim() || null,
        prioritet: form.prioritet,
        klijent_kljuc: form.kljuc,
      })
      writeDraft(user?.id, EMPTY)
      for (const [index, photo] of photos.entries()) {
        setSubmitting('photo')
        setPhotoProgress({ n: index + 1, of: photos.length })
        try {
          await uploadPhoto(data.id, photo)
        } catch (error) {
          // The report itself is saved; say so plainly and send the worker where the photo can be added again.
          toast.error(`${t('report.photoFailed', { id: data.id })} ${errorMessage(error, i18n)}`)
          navigate(`/radnik/kvar/${data.id}`)
          return
        }
      }
      setSubmitting('')
      setPhotos([])
      setDone({ fault: data, machine })
      window.scrollTo({ top: 0 })
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setSubmitting('')
      if (Object.keys(fields).length) {
        const which = fields.oprema_id || fields.komponenta_id ? 1 : fields.naslov || fields.opis ? 2 : 3
        setErrors(fields)
        if (which !== step) goTo(which)
      } else {
        setFormError(errorMessage(error, i18n))
      }
    }
  }

  const startNew = () => {
    setDone(null)
    setErrors({})
    setForm({ ...EMPTY, kljuc: newKey() })
    navigate(`${BASE}/prijava`, { replace: true })
  }

  if (done) return <Reported fault={done.fault} machine={done.machine} onNew={startNew} />

  const labels = [t('report.stepMachine'), t('report.stepDescription'), t('report.stepPriority')]
  const stepTitles = [t('report.titleMachine'), t('report.titleDescription'), t('report.titlePriority')]
  const sending = submitting === 'photo' ? t('report.sendingPhotoN', photoProgress) : submitting ? t('report.submitting') : ''

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-1">
        {step === 1 ? (
          <Link to={BASE} className="btn-icon -ml-2.5 h-11 w-11" aria-label={t('fault.backToMine')}>
            <ArrowLeft size={21} aria-hidden="true" />
          </Link>
        ) : (
          <button type="button" className="btn-icon -ml-2.5 h-11 w-11" aria-label={t('report.back')} onClick={() => goTo(step - 1)}>
            <ArrowLeft size={21} aria-hidden="true" />
          </button>
        )}
        <h1 className="text-xl font-semibold text-ink">{t('report.title')}</h1>
      </div>

      {machines.loading && !machines.data ? (
        <div className="surface"><LoadingRows rows={3} /></div>
      ) : machines.error ? (
        <div className="surface"><ErrorState error={machines.error} onRetry={machines.reload} /></div>
      ) : machines.data.length === 0 ? (
        <p className="surface px-5 py-6 text-ink-2">{t('report.noMachines')}</p>
      ) : (
        <form onSubmit={step === STEPS ? submit : next} noValidate className="surface flex flex-col">
          <div className="border-b border-rule px-4 py-3.5 sm:px-5">
            <Stepper step={step} labels={labels} />
          </div>

          <div className="space-y-5 px-4 py-5 sm:px-5">
            <h2 ref={stepHeading} tabIndex={-1} className="text-lg font-semibold text-ink focus:outline-none">
              <span className="sr-only">{t('report.stepOf', { n: step, of: STEPS })}: </span>
              {stepTitles[step - 1]}
            </h2>

            {formError && <p role="alert" className="rounded-md border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">{formError}</p>}

            {step > 1 && machine && (
              <button type="button" onClick={() => goTo(1)} className="flex w-full items-center gap-3 rounded-md border border-rule bg-ground/60 px-3 py-2.5 text-left transition-colors hover:border-rule-strong/60">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-stock"><Factory size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{machine.naziv}</span>
                  <span className="block truncate text-meta text-ink-2">
                    {[componentList.find((item) => String(item.id) === String(form.komponenta_id))?.naziv, machine.lokacija].filter(Boolean).join(' · ') || t('report.change')}
                  </span>
                </span>
                <span className="text-sm font-semibold text-brand">{t('report.change')}</span>
              </button>
            )}

            {step === 1 && (
              <>
                <MachinePicker
                  machines={machines.data}
                  value={form.oprema_id}
                  onChange={(value) => update('oprema_id', value)}
                  error={errors.oprema_id}
                  inputRef={refs.oprema_id}
                  scanned={scanned && String(form.oprema_id) === scanned}
                />
                {form.oprema_id && needsComponent && (
                  <Field label={t('report.component')} error={errors.komponenta_id} hint={t('report.componentHint')} required>
                    {(props) => (
                      <select
                        {...props}
                        ref={refs.komponenta_id}
                        className="control"
                        value={form.komponenta_id}
                        disabled={components.loading}
                        onChange={(event) => update('komponenta_id', event.target.value)}
                      >
                        <option value="">{components.loading ? t('common.loading') : t('report.componentPlaceholder')}</option>
                        {componentList.map((component) => <option key={component.id} value={component.id}>{component.naziv}</option>)}
                      </select>
                    )}
                  </Field>
                )}
                <KnownFaults faults={known.data} />
                {canScan && !form.oprema_id && (
                  <Link to={`${BASE}/skeniraj`} className="btn-secondary w-full">
                    <QrCode size={18} aria-hidden="true" /> {t('report.orScan')}
                  </Link>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <Field label={t('report.headline')} error={errors.naslov} required>
                  {(props) => (
                    <input
                      {...props}
                      ref={refs.naslov}
                      className="control"
                      maxLength={200}
                      autoComplete="off"
                      autoCapitalize="sentences"
                      enterKeyHint="next"
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
                      rows={4}
                      maxLength={5000}
                      autoCapitalize="sentences"
                      value={form.opis}
                      placeholder={t('report.detailsPlaceholder')}
                      onChange={(event) => update('opis', event.target.value)}
                    />
                  )}
                </Field>
                <PhotoStrip
                  photos={photos}
                  onAdd={(files) => setPhotos((current) => [...current, ...files].slice(0, MAX_PHOTOS))}
                  onRemove={(index) => setPhotos((current) => current.filter((_, at) => at !== index))}
                />
              </>
            )}

            {step === 3 && (
              <RadioCards
                legend={t('report.priority')}
                name="prioritet"
                value={form.prioritet}
                onChange={(value) => update('prioritet', value)}
                options={['Hitno', 'Normalno', 'Nisko'].map((value) => ({
                  value,
                  label: priority(value),
                  hint: t(`priorityHint.${value}`),
                  marker: <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${PRIORITY_DOT[value]}`} />,
                }))}
              />
            )}
          </div>

          {/* Phones: the next step stays under the thumb, above the keyboard's reach. */}
          <div className="pb-safe sticky bottom-0 z-10 mt-auto rounded-b-lg border-t border-rule bg-stock/95 px-4 py-3 backdrop-blur-sm sm:px-5">
            {step < STEPS ? (
              <button type="submit" className="btn-primary btn-lg w-full">
                {t('report.next')} <ArrowRight size={19} aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" disabled={Boolean(submitting)} aria-busy={Boolean(submitting)} className="btn-primary btn-lg w-full">
                {submitting ? null : <Send size={19} aria-hidden="true" />}
                {sending || t('report.submit')}
              </button>
            )}
            <p aria-live="polite" className="sr-only">{submitting === 'photo' ? sending : ''}</p>
          </div>
        </form>
      )}
      {step === 3 && !submitting && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-meta text-ink-3">
          <CheckCircle2 size={14} aria-hidden="true" /> {t('report.notifyNote')}
        </p>
      )}
    </div>
  )
}
