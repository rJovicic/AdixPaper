import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AlertTriangle, ArrowLeft, CheckCircle2, History, PackagePlus, Pause, Play, RotateCcw, RotateCw, Save, SearchX, Trash2 } from 'lucide-react'
import { api, errorKind, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLive, useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import { focusFirstInvalid } from '../../lib/focus'
import { useToast } from '../../components/ui/Toast'
import Field from '../../components/ui/Field'
import PartPicker from '../../components/ui/PartPicker'
import Timeline from '../../components/Timeline'
import Photos from '../../components/Photos'
import Dialog from '../../components/ui/Dialog'
import RadioCards from '../../components/ui/RadioCards'
import { AttentionReasons, DueTag, FaultNumber, LabelFields, PriorityMark, PriorityTile, ResponseOutcome, StatusMark, WaitingTag } from '../../components/ui/Marks'
import { useReportedAt } from '../../components/FaultRow'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)
const TABS = ['details', 'activity', 'photos', 'work']
const TAB_KEYS = { details: 'fault.tabDetails', activity: 'fault.tabActivity', photos: 'fault.tabPhotos', work: 'fault.tabWork' }
let rowKey = 0

function formFromFault(fault) {
  return {
    prioritet: fault.prioritet,
    voditelj_id: fault.voditelj_id ? String(fault.voditelj_id) : '',
    komponenta_id: fault.komponenta_id ? String(fault.komponenta_id) : '',
    sto_je_uradjeno: fault.sto_je_uradjeno || '',
    materijal: fault.materijal || '',
    troskovi: fault.troskovi !== null && fault.troskovi !== undefined && Number(fault.troskovi) !== 0 ? String(Number(fault.troskovi)) : '',
    trajanje_min: fault.trajanje_min ? String(fault.trajanje_min) : '',
    napomene_voditelja: fault.napomene_voditelja || '',
    parts: asArray(fault.utroseni_dijelovi).map((item) => ({
      key: ++rowKey,
      rezervni_dio_id: item.rezervni_dio_id,
      kolicina: String(Number(item.kolicina) || 1),
      napomena: item.napomena || '',
    })),
  }
}

const partsPayload = (parts) => parts.map((row) => ({ rezervni_dio_id: Number(row.rezervni_dio_id), kolicina: Number(row.kolicina), napomena: row.napomena }))

function toPayload(form) {
  return {
    prioritet: form.prioritet,
    voditelj_id: form.voditelj_id ? Number(form.voditelj_id) : null,
    komponenta_id: form.komponenta_id ? Number(form.komponenta_id) : null,
    sto_je_uradjeno: form.sto_je_uradjeno,
    materijal: form.materijal,
    napomene_voditelja: form.napomene_voditelja,
    troskovi: form.troskovi === '' ? 0 : Number(form.troskovi),
    trajanje_min: form.trajanje_min === '' ? 0 : Number(form.trajanje_min),
    utroseni_dijelovi: partsPayload(form.parts),
  }
}

/**
 * Only the fields the lead actually changed. Sending the whole form let a stale tab
 * overwrite another lead's assignment (and made "Take" send "unassigned").
 */
function changedFields(form, initialForm) {
  const next = toPayload(form)
  const before = toPayload(initialForm)
  return Object.fromEntries(Object.entries(next).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(before[field])))
}

/**
 * Where the fault is in its life: reported → taken → (on hold) → resolved. Steps with a timestamp are done;
 * the first step without one is current. Text carries the state, the dots only reinforce it.
 */
function Progress({ fault }) {
  const { t, format, waitingReason } = useI18n()
  const name = (person) => (person ? `${person.ime} ${person.prezime}` : null)
  const steps = [
    { key: 'reported', label: t('fault.stepReported'), at: fault.datum_prijave, who: name(fault.prijavio) },
    { key: 'taken', label: t('fault.stepTaken'), at: fault.datum_pocetka, who: name(fault.voditelj) },
    fault.status === 'Na čekanju' && { key: 'waiting', label: t('fault.stepWaiting'), at: fault.cekanje_od, who: fault.razlog_cekanja ? waitingReason(fault.razlog_cekanja) : null, tone: 'warning' },
    { key: 'resolved', label: t('fault.stepResolved'), at: fault.datum_rjesavanja, who: null },
  ].filter(Boolean)
  const current = fault.status === 'Na čekanju' ? 'waiting' : steps.find((step) => !step.at)?.key
  return (
    <ol className="mt-4" aria-label={t('fault.progress')}>
      {steps.map((step, index) => {
        const done = Boolean(step.at) && step.key !== current
        const isCurrent = step.key === current
        const dot = isCurrent
          ? step.tone === 'warning' ? 'border-warn-mark bg-warn-mark' : 'border-brand bg-stock ring-4 ring-brand/15'
          : done ? 'border-ok-mark bg-ok-mark' : 'border-rule-strong bg-stock'
        return (
          <li key={step.key} className="relative flex gap-3 pb-3.5 last:pb-0">
            {index < steps.length - 1 && <span aria-hidden="true" className={`absolute bottom-0 left-[0.4375rem] top-4 w-0.5 ${done ? 'bg-ok-mark/60' : 'bg-rule'}`} />}
            <span aria-hidden="true" className={`relative mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${dot}`} />
            <span className="min-w-0">
              <span className={`block text-sm ${isCurrent ? 'font-semibold text-ink' : done ? 'font-medium text-ink' : 'text-ink-3'}`}>
                {step.label}
                {isCurrent && <span className="sr-only"> ({t('fault.stepCurrent')})</span>}
              </span>
              {(step.at || step.who) && (
                <span className="block text-meta text-ink-2">{[step.at ? format.dateTime(step.at) : null, step.who].filter(Boolean).join(' · ')}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const WAITING_REASONS = ['dijelovi', 'vanjski_servis', 'odobrenje', 'proizvodnja', 'ostalo']

/** Asks why the fault goes on hold (or changes the reason); the reason is required by the server. */
function WaitingDialog({ current, changing, busy, onConfirm, onClose }) {
  const { t, waitingReason } = useI18n()
  const [reason, setReason] = useState(current || '')
  const [error, setError] = useState('')
  const confirm = () => {
    if (!reason) {
      setError(t('waiting.required'))
      return
    }
    onConfirm(reason)
  }
  return (
    <Dialog
      title={t('waiting.dialogTitle')}
      description={t('waiting.dialogBody')}
      onClose={onClose}
      busy={busy}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={busy || (changing && reason === current)}>
            <Pause size={17} aria-hidden="true" />
            {busy ? t('common.saving') : changing ? t('common.saveChanges') : t('waiting.confirm')}
          </button>
        </>
      }
    >
      <RadioCards
        legend={t('waiting.label')}
        name="razlog-cekanja"
        value={reason}
        onChange={(value) => {
          setReason(value)
          setError('')
        }}
        error={error}
        options={WAITING_REASONS.map((value) => ({ value, label: waitingReason(value), hint: t(`waiting.hints.${value}`) }))}
      />
    </Dialog>
  )
}

const ACTIONS = {
  Novo: [{ status: 'U rješavanju', key: 'fault.actionTake', icon: Play, primary: true }],
  'U rješavanju': [
    { status: 'Riješeno', key: 'fault.actionResolve', icon: CheckCircle2, primary: true },
    { status: 'Na čekanju', key: 'fault.actionPause', icon: Pause, asksReason: true },
  ],
  'Na čekanju': [
    { status: 'U rješavanju', key: 'fault.actionResume', icon: Play, primary: true },
    { status: 'Riješeno', key: 'fault.actionResolve', icon: CheckCircle2 },
  ],
  'Riješeno': [{ status: 'U rješavanju', key: 'fault.actionReopen', icon: RotateCcw }],
}

export default function FaultDetail() {
  const { id } = useParams()
  const i18n = useI18n()
  const { t, format, status: statusLabel, priority: priorityLabel } = i18n
  const toast = useToast()
  const fault = useAsync(() => get(`/kvarovi/${id}`), [id])
  const events = useAsync(() => get(`/kvarovi/${id}/dogadjaji`).then(asArray), [id])
  const catalog = useAsync(() => get('/rezervni-dijelovi').then(asArray), [])
  const people = useAsync(() => get('/korisnici/radnici/lista').then((list) => asArray(list).filter((user) => user.rola !== 'radnik')), [])
  const machineId = fault.data?.oprema_id
  const components = useAsync(() => (machineId ? get(`/oprema/${machineId}/komponente`).then(asArray) : []), [machineId])
  const history = useAsync(() => (machineId ? get(`/kvarovi?oprema_id=${machineId}&limit=7`).then(asArray) : []), [machineId])

  const [form, setForm] = useState(null)
  const [initial, setInitial] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const [conflict, setConflict] = useState(false)
  const [waitingDialog, setWaitingDialog] = useState(null)
  // Phones: one section at a time under tabs. Wide screens show every section; the tabs are hidden there.
  const [tab, setTab] = useState('details')
  const reportedAt = useReportedAt()
  const formRef = useRef(null)

  useEffect(() => {
    if (!fault.data) return
    const next = formFromFault(fault.data)
    setForm(next)
    setInitial(next)
    setErrors({})
    setConflict(false)
    document.title = `${t('fault.number', { id: fault.data.id })} · ${t('app.name')}`
  }, [fault.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form && initial ? Object.keys(changedFields(form, initial)).length > 0 : false

  // Someone else changed this fault: show it at once, unless this lead is mid-edit; then keep
  // their edits and say so (saving would be refused with 409 anyway).
  const editing = useRef({ dirty: false, saving: false, version: null })
  editing.current = { dirty, saving: Boolean(saving), version: fault.data?.verzija ?? null }
  useLiveRefresh(events.refresh, (message) => message.kvarId === Number(id))
  useLiveRefresh(history.refresh, (message) => message.kvarId !== Number(id) || message.action !== 'comment')
  useLive((message) => {
    const relevant = message.type === 'resync' || (message.type === 'kvar' && message.kvarId === Number(id))
    if (!relevant || editing.current.saving) return
    if (message.action === 'deleted') {
      fault.reload()
      return
    }
    get(`/kvarovi/${id}`).then((latest) => {
      if (!latest || latest.verzija === editing.current.version) return
      if (editing.current.dirty) setConflict('remote')
      else fault.setData(latest)
    }).catch(() => {})
  })

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }
  const updatePart = (key, patch) => {
    setForm((current) => ({ ...current, parts: current.parts.map((row) => (row.key === key ? { ...row, ...patch } : row)) }))
    setErrors((current) => ({ ...current, [`part-${key}`]: undefined }))
  }

  const validate = () => {
    const next = {}
    if (form.troskovi !== '' && !(Number(form.troskovi) >= 0)) next.troskovi = t('errors.notNegative')
    if (form.trajanje_min !== '' && !(Number.isInteger(Number(form.trajanje_min)) && Number(form.trajanje_min) >= 0)) next.trajanje_min = t('errors.notNegative')
    form.parts.forEach((row) => {
      if (!row.rezervni_dio_id) next[`part-${row.key}`] = t('fault.partRequired')
      else if (!(Number(row.kolicina) > 0)) next[`part-${row.key}`] = t('errors.positive')
    })
    return next
  }

  /** Saves changed fields (and a status change). Sends the loaded version: a stale save gets 409. */
  const save = async (status, extra = {}) => {
    const next = validate()
    if (status === 'Riješeno' && !form.sto_je_uradjeno.trim()) next.sto_je_uradjeno = t('fault.workDoneRequired')
    setErrors(next)
    if (Object.keys(next).length) {
      focusFirstInvalid(formRef)
      return false
    }
    setSaving(status || (extra.razlog_cekanja ? 'Na čekanju' : 'form'))
    const payload = { ...changedFields(form, initial), ...(status ? { status } : {}), ...extra, verzija: fault.data.verzija }
    try {
      const { data } = await api.put(`/kvarovi/${id}`, payload)
      fault.setData(data)
      events.reload()
      history.reload()
      toast.success(status ? t('fault.statusChanged', { status: statusLabel(status) }) : t('common.saved'))
      return true
    } catch (error) {
      if (error?.response?.status === 409) setConflict(true)
      setErrors(fieldErrors(error, i18n))
      toast.error(errorMessage(error, i18n))
      return false
    } finally {
      setSaving('')
    }
  }

  const reloadLatest = () => {
    fault.reload()
    events.reload()
  }

  const confirmWaiting = async (reason) => {
    const changing = waitingDialog === 'change'
    const saved = await save(changing ? undefined : 'Na čekanju', { razlog_cekanja: reason })
    if (saved) setWaitingDialog(null)
  }

  const back = (
    <Link to="/admin/kvarovi" className="btn-quiet -ml-3 mb-3">
      <ArrowLeft size={18} aria-hidden="true" /> {t('fault.backToList')}
    </Link>
  )

  if (fault.loading && !fault.data) return <div>{back}<div className="surface"><LoadingRows rows={5} /></div></div>
  if (fault.error) {
    return (
      <div>
        {back}
        <div className="surface">
          {errorKind(fault.error) === 'notFound'
            ? <EmptyState icon={SearchX} title={t('fault.notFoundTitle')} body={t('errors.notFound')} />
            : <ErrorState error={fault.error} onRetry={fault.reload} />}
        </div>
      </div>
    )
  }
  if (!form) return null

  const item = fault.data
  const parts = catalog.data || []
  const assignees = people.data || []
  const componentOptions = (components.data || []).filter((component) => component.aktivna || String(component.id) === form.komponenta_id)
  const busy = Boolean(saving)
  const peopleNames = Object.fromEntries(assignees.map((user) => [user.id, `${user.ime} ${user.prezime}`]))
  const otherFaults = (history.data || []).filter((other) => other.id !== item.id).slice(0, 6)
  const panelClass = (id) => (tab === id ? '' : 'max-lg:hidden')

  return (
    <div>
      {back}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="min-w-0 space-y-6">
          <article className="surface overflow-hidden">
            <header className="flex gap-3.5 px-4 py-4 sm:px-5">
              <PriorityTile priority={item.prioritet} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-ink-2">
                  <span className="truncate">{item.oprema?.naziv}</span>
                  <FaultNumber id={item.id} size="sm" className="shrink-0 text-base" />
                </p>
                <h1 className="mt-0.5 text-xl font-semibold leading-snug sm:text-2xl">{item.naslov}</h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <PriorityMark priority={item.prioritet} />
                  <StatusMark status={item.status} />
                  <DueTag fault={item} className="ml-1" />
                  <ResponseOutcome fault={item} className="ml-1" />
                </div>
                <p className="mt-2 text-meta text-ink-3">{t('fault.reportedWhen', { when: reportedAt(item.datum_prijave) })}</p>
                <AttentionReasons fault={item} max={5} skip={['hitno']} withTime={false} className="mt-2" />
              </div>
            </header>
            <div role="tablist" aria-label={t('fault.sections')} className="flex overflow-x-auto border-t border-rule px-2 lg:hidden">
              {TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`fault-tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`fault-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={`-mb-px min-h-[2.875rem] flex-1 whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors ${
                    tab === id ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink'
                  }`}
                >
                  {t(TAB_KEYS[id])}
                </button>
              ))}
            </div>
            <div id="fault-panel-details" role="tabpanel" aria-labelledby="fault-tab-details" className={panelClass('details')}>
              <LabelFields
                items={[
                  { label: t('fault.machine'), value: [item.oprema?.naziv, item.oprema?.lokacija].filter(Boolean).join(' · ') },
                  { label: t('fault.component'), value: item.komponenta?.naziv || t('fault.componentGeneral') },
                  { label: t('fault.reportedBy'), value: item.prijavio ? `${item.prijavio.ime} ${item.prijavio.prezime}` : '—' },
                  { label: t('fault.reportedAt'), value: format.dateTime(item.datum_prijave) },
                  { label: t('fault.assignee'), value: item.voditelj ? `${item.voditelj.ime} ${item.voditelj.prezime}` : t('fault.unassigned') },
                  { label: t('fault.deadline'), value: format.dateTime(item.rok) },
                  {
                    label: t('fault.firstResponse'),
                    value: item.datum_odziva
                      ? `${format.dateTime(item.datum_odziva)}${item.odziv_u_roku === null ? '' : ` · ${t(item.odziv_u_roku ? 'sla.respondedOnTime' : 'sla.respondedLate')}`}`
                      : item.status === 'Novo' ? t('sla.awaiting') : '—',
                  },
                  { label: t('fault.startedAt'), value: format.dateTime(item.datum_pocetka) },
                  item.status === 'Riješeno'
                    ? { label: t('fault.resolvedAt'), value: format.dateTime(item.datum_rjesavanja) }
                    : { label: t('fault.timeOpen'), value: format.duration((Date.now() - new Date(item.datum_prijave)) / 60000) },
                ]}
              />
              <div className="px-4 py-4 sm:px-5">
                <h2 className="field-label">{t('fault.description')}</h2>
                <p className="mt-1 max-w-[75ch] whitespace-pre-wrap break-words">{item.opis || <span className="text-ink-3">{t('fault.noDescription')}</span>}</p>
              </div>
            </div>
            <div id="fault-panel-photos" role="tabpanel" aria-labelledby="fault-tab-photos" className={panelClass('photos')}>
              <Photos faultId={item.id} canAdd canDelete={() => true} onChanged={events.reload} className="border-t border-rule px-4 py-4 sm:px-5" />
            </div>
          </article>

          {conflict && (
            <div role="alert" className="surface flex flex-wrap items-start gap-3 border-urgent/50 bg-urgent-wash/60 px-5 py-4">
              <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-urgent" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{t('fault.conflictTitle')}</p>
                <p className="mt-0.5 text-ink-2">{t(conflict === 'remote' ? 'fault.conflictLiveBody' : 'fault.conflictBody')}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={reloadLatest}>
                <RotateCw size={16} aria-hidden="true" /> {t('fault.conflictReload')}
              </button>
            </div>
          )}

          <form
            ref={formRef}
            id="fault-panel-work"
            role="tabpanel"
            aria-labelledby="fault-tab-work"
            className={`surface ${panelClass('work')}`}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <h2 className="border-b border-rule px-5 py-3.5 text-base font-semibold">{t('fault.detailsTitle')}</h2>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-3">
              <Field label={t('fault.priority')}>
                {(props) => (
                  <select {...props} className="control" value={form.prioritet} onChange={(event) => update('prioritet', event.target.value)}>
                    {['Hitno', 'Normalno', 'Nisko'].map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
                  </select>
                )}
              </Field>
              <Field label={t('fault.assignee')}>
                {(props) => (
                  <select {...props} className="control" value={form.voditelj_id} onChange={(event) => update('voditelj_id', event.target.value)}>
                    <option value="">{t('fault.unassigned')}</option>
                    {assignees.map((user) => <option key={user.id} value={user.id}>{user.ime} {user.prezime}</option>)}
                  </select>
                )}
              </Field>
              <Field label={t('fault.component')}>
                {(props) => (
                  <select {...props} className="control" value={form.komponenta_id} onChange={(event) => update('komponenta_id', event.target.value)}>
                    <option value="">{t('fault.componentGeneral')}</option>
                    {componentOptions.map((component) => <option key={component.id} value={component.id}>{component.naziv}</option>)}
                  </select>
                )}
              </Field>
            </div>

            <h3 className="border-y border-rule bg-ground/40 px-5 py-2.5 field-label">{t('fault.resolutionTitle')}</h3>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <Field label={t('fault.workDone')} className="sm:col-span-2" error={errors.sto_je_uradjeno}>
                {(props) => (
                  <textarea {...props} className="control" rows={3} maxLength={5000} value={form.sto_je_uradjeno} placeholder={t('fault.workDonePlaceholder')} onChange={(event) => update('sto_je_uradjeno', event.target.value)} />
                )}
              </Field>
              <Field label={t('fault.duration')} error={errors.trajanje_min}>
                {(props) => (
                  <input {...props} className="control tabular" type="number" inputMode="numeric" min="0" step="1" value={form.trajanje_min} onChange={(event) => update('trajanje_min', event.target.value)} />
                )}
              </Field>
              <Field label={t('fault.cost')} error={errors.troskovi}>
                {(props) => (
                  <input {...props} className="control tabular" type="number" inputMode="decimal" min="0" step="0.01" value={form.troskovi} onChange={(event) => update('troskovi', event.target.value)} />
                )}
              </Field>
            </div>

            <div className="border-t border-rule px-5 py-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t('fault.parts')}</h3>
                  <p className="text-meta text-ink-2">{t('fault.partsHint')}</p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={parts.length === 0}
                  onClick={() => setForm((current) => ({ ...current, parts: [...current.parts, { key: ++rowKey, rezervni_dio_id: '', kolicina: '1', napomena: '' }] }))}
                >
                  <PackagePlus size={16} aria-hidden="true" /> {t('fault.addPart')}
                </button>
              </div>
              {catalog.error ? (
                <ErrorState error={catalog.error} onRetry={catalog.reload} className="py-6" />
              ) : parts.length === 0 && !catalog.loading ? (
                <p className="rounded border border-dashed border-rule-strong px-4 py-3 text-ink-2">{t('fault.noCatalog')}</p>
              ) : form.parts.length === 0 ? (
                <p className="rounded border border-dashed border-rule-strong px-4 py-3 text-ink-2">{t('fault.noParts')}</p>
              ) : (
                <ul className="space-y-3">
                  {form.parts.map((row, index) => {
                    const error = errors[`part-${row.key}`]
                    const errorId = `part-error-${row.key}`
                    return (
                      <li key={row.key} className="rounded border border-rule bg-ground/30 p-3">
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,0.8fr)_auto] sm:items-start">
                          <PartPicker
                            parts={parts}
                            value={row.rezervni_dio_id}
                            label={`${t('fault.parts')} ${index + 1}`}
                            invalid={Boolean(error)}
                            describedBy={error ? errorId : undefined}
                            onChange={(value) => updatePart(row.key, { rezervni_dio_id: value })}
                          />
                          <input
                            className="control tabular"
                            type="number"
                            inputMode="decimal"
                            min="0.01"
                            step="0.01"
                            aria-label={`${t('fault.quantity')} ${index + 1}`}
                            value={row.kolicina}
                            onChange={(event) => updatePart(row.key, { kolicina: event.target.value })}
                          />
                          <input
                            className="control"
                            maxLength={200}
                            aria-label={`${t('fault.partNote')} ${index + 1}`}
                            placeholder={t('fault.partNote')}
                            value={row.napomena}
                            onChange={(event) => updatePart(row.key, { napomena: event.target.value })}
                          />
                          <button
                            type="button"
                            className="btn-icon text-urgent hover:bg-urgent-wash hover:text-urgent"
                            aria-label={`${t('fault.removePart')} ${index + 1}`}
                            onClick={() => setForm((current) => ({ ...current, parts: current.parts.filter((part) => part.key !== row.key) }))}
                          >
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </div>
                        {error && <p id={errorId} className="mt-1.5 text-sm font-medium text-urgent">{error}</p>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="grid gap-5 border-t border-rule px-5 py-5 sm:grid-cols-2">
              <Field label={t('fault.material')} optional>
                {(props) => (
                  <textarea {...props} className="control" rows={2} maxLength={5000} value={form.materijal} placeholder={t('fault.materialPlaceholder')} onChange={(event) => update('materijal', event.target.value)} />
                )}
              </Field>
              <Field label={t('fault.internalNote')} optional>
                {(props) => (
                  <textarea {...props} className="control" rows={2} maxLength={5000} value={form.napomene_voditelja} placeholder={t('fault.internalNotePlaceholder')} onChange={(event) => update('napomene_voditelja', event.target.value)} />
                )}
              </Field>
            </div>

            <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] flex flex-wrap items-center justify-end gap-3 rounded-b-lg border-t border-rule bg-stock/95 lg:bottom-0 px-5 py-3 backdrop-blur-sm">
              {dirty && <span role="status" className="mr-auto text-sm font-medium text-warn">{t('common.unsavedChanges')}</span>}
              <button type="submit" className="btn-primary" disabled={busy || !dirty}>
                <Save size={17} aria-hidden="true" />
                {saving === 'form' ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          </form>

          <div id="fault-panel-activity" role="tabpanel" aria-labelledby="fault-tab-activity" className={panelClass('activity')}>
            {events.error ? (
              <div className="surface"><ErrorState error={events.error} onRetry={events.reload} /></div>
            ) : (
              <Timeline faultId={item.id} events={events.data || []} canInternal onAdded={events.reload} people={peopleNames} />
            )}
          </div>
        </div>

        <div className={`space-y-6 lg:sticky lg:top-[5.75rem] ${panelClass('details')}`}>
          <aside className="surface p-4" aria-label={t('fault.status')}>
            <p className="field-label">{t('fault.status')}</p>
            <p className="mt-1.5"><StatusMark status={item.status} /></p>
            <Progress fault={item} />
            {item.status === 'Na čekanju' && (
              <div className="mt-3 rounded border border-warn-mark/30 bg-warn-wash px-3 py-2">
                <WaitingTag fault={item} />
                <button type="button" className="link mt-1 block text-sm" disabled={busy} onClick={() => setWaitingDialog('change')}>{t('fault.changeReason')}</button>
              </div>
            )}
            <div className="mt-4 grid gap-2">
              {(ACTIONS[item.status] || []).map((action) => (
                <button
                  key={action.status}
                  type="button"
                  disabled={busy}
                  onClick={() => (action.asksReason ? setWaitingDialog('pause') : save(action.status))}
                  className={action.primary ? 'btn-primary w-full' : 'btn-secondary w-full'}
                >
                  <action.icon size={17} aria-hidden="true" />
                  {saving === action.status ? t('common.saving') : t(action.key)}
                </button>
              ))}
            </div>
            {dirty && <p className="mt-3 text-meta text-ink-2">{t('fault.unsavedWithAction')}</p>}
          </aside>

          <section aria-labelledby="machine-history-title" className="surface hidden lg:block">
            <header className="flex items-center gap-2 border-b border-rule px-4 py-3">
              <History size={16} aria-hidden="true" className="text-ink-3" />
              <h2 id="machine-history-title" className="text-sm font-semibold">{t('fault.machineHistory')}</h2>
            </header>
            {history.loading && !history.data ? (
              <LoadingRows rows={2} />
            ) : otherFaults.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-3">{t('fault.machineHistoryEmpty')}</p>
            ) : (
              <ul className="divide-y divide-rule">
                {otherFaults.map((other) => (
                  <li key={other.id}>
                    <Link to={`/admin/kvarovi/${other.id}`} className="block px-4 py-2.5 transition-colors hover:bg-brand-wash/50">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <FaultNumber id={other.id} size="sm" className="text-base" />
                        <span className="truncate text-sm font-medium">{other.naslov}</span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <StatusMark status={other.status} className="text-meta" />
                        <span className="text-meta text-ink-3 tabular">{format.date(other.datum_prijave)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-rule p-3">
              <Link to={`/admin/kvarovi?oprema=${item.oprema_id}`} className="btn-quiet btn-sm w-full">{t('fault.machineHistoryAll')}</Link>
            </div>
          </section>
        </div>
      </div>
      {waitingDialog && (
        <WaitingDialog
          current={item.razlog_cekanja}
          changing={waitingDialog === 'change'}
          busy={busy}
          onConfirm={confirmWaiting}
          onClose={() => setWaitingDialog(null)}
        />
      )}
    </div>
  )
}
