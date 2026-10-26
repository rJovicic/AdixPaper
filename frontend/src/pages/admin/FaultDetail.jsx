import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, PackagePlus, Pause, Play, RotateCcw, Save, SearchX, Trash2 } from 'lucide-react'
import { api, errorKind, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { useToast } from '../../components/ui/Toast'
import Field from '../../components/ui/Field'
import PartPicker from '../../components/ui/PartPicker'
import Timeline from '../../components/Timeline'
import { DueTag, FaultNumber, LabelFields, PriorityMark, StatusMark } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)
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

// eslint-disable-next-line no-unused-vars
const comparable = (form) => JSON.stringify({ ...form, parts: form.parts.map(({ key, ...rest }) => rest) })

const ACTIONS = {
  Novo: [{ status: 'U rješavanju', key: 'fault.actionTake', icon: Play, primary: true }],
  'U rješavanju': [
    { status: 'Riješeno', key: 'fault.actionResolve', icon: CheckCircle2, primary: true },
    { status: 'Na čekanju', key: 'fault.actionPause', icon: Pause },
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

  const [form, setForm] = useState(null)
  const [initial, setInitial] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState('')
  const formRef = useRef(null)

  useEffect(() => {
    if (!fault.data) return
    const next = formFromFault(fault.data)
    setForm(next)
    setInitial(comparable(next))
    setErrors({})
    document.title = `${t('fault.number', { id: fault.data.id })} · ${t('app.name')}`
  }, [fault.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = form ? comparable(form) !== initial : false

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

  const save = async (status) => {
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) {
      formRef.current?.querySelector('[aria-invalid=true]')?.focus()
      return
    }
    setSaving(status || 'form')
    const payload = {
      prioritet: form.prioritet,
      voditelj_id: form.voditelj_id ? Number(form.voditelj_id) : null,
      komponenta_id: form.komponenta_id ? Number(form.komponenta_id) : null,
      sto_je_uradjeno: form.sto_je_uradjeno,
      materijal: form.materijal,
      napomene_voditelja: form.napomene_voditelja,
      troskovi: form.troskovi === '' ? 0 : Number(form.troskovi),
      trajanje_min: form.trajanje_min === '' ? 0 : Number(form.trajanje_min),
      utroseni_dijelovi: form.parts.map((row) => ({ rezervni_dio_id: Number(row.rezervni_dio_id), kolicina: Number(row.kolicina), napomena: row.napomena })),
      ...(status ? { status } : {}),
    }
    try {
      const { data } = await api.put(`/kvarovi/${id}`, payload)
      fault.setData(data)
      events.reload()
      toast.success(status ? t('fault.statusChanged', { status: statusLabel(status) }) : t('common.saved'))
    } catch (error) {
      setErrors(fieldErrors(error, i18n))
      toast.error(errorMessage(error, i18n))
    } finally {
      setSaving('')
    }
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

  return (
    <div>
      {back}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="min-w-0 space-y-6">
          <article className="surface overflow-hidden">
            <header className="border-b border-rule px-5 py-4">
              <FaultNumber id={item.id} size="lg" />
              <h1 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">{item.naslov}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <StatusMark status={item.status} />
                <PriorityMark priority={item.prioritet} />
                <DueTag fault={item} />
              </div>
            </header>
            <LabelFields
              items={[
                { label: t('fault.machine'), value: item.oprema?.naziv },
                { label: t('fault.location'), value: item.oprema?.lokacija || '—' },
                { label: t('fault.component'), value: item.komponenta?.naziv || t('fault.componentGeneral') },
                { label: t('fault.reportedBy'), value: item.prijavio ? `${item.prijavio.ime} ${item.prijavio.prezime}` : '—' },
                { label: t('fault.reportedAt'), value: format.dateTime(item.datum_prijave) },
                { label: t('fault.assignee'), value: item.voditelj ? `${item.voditelj.ime} ${item.voditelj.prezime}` : t('fault.unassigned') },
                { label: t('fault.startedAt'), value: format.dateTime(item.datum_pocetka) },
                { label: t('fault.resolvedAt'), value: format.dateTime(item.datum_rjesavanja) },
              ]}
            />
            <div className="px-5 py-4">
              <h2 className="field-label">{t('fault.description')}</h2>
              <p className="mt-1 max-w-[75ch] whitespace-pre-wrap break-words">{item.opis || <span className="text-ink-3">{t('fault.noDescription')}</span>}</p>
            </div>
          </article>

          <form
            ref={formRef}
            className="surface"
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

            <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-rule bg-stock/95 px-5 py-3 backdrop-blur-sm">
              {dirty && <span role="status" className="mr-auto text-sm font-medium text-warn">{t('common.unsavedChanges')}</span>}
              <button type="submit" className="btn-primary" disabled={busy || !dirty}>
                <Save size={17} aria-hidden="true" />
                {saving === 'form' ? t('common.saving') : t('common.saveChanges')}
              </button>
            </div>
          </form>

          {events.error ? (
            <div className="surface"><ErrorState error={events.error} onRetry={events.reload} /></div>
          ) : (
            <Timeline faultId={item.id} events={events.data || []} canInternal onAdded={events.reload} />
          )}
        </div>

        <aside className="surface order-first p-4 lg:sticky lg:top-6 lg:order-none" aria-label={t('fault.status')}>
          <p className="field-label">{t('fault.status')}</p>
          <p className="mt-1.5"><StatusMark status={item.status} className="text-base font-semibold" /></p>
          <div className="mt-4 grid gap-2">
            {(ACTIONS[item.status] || []).map((action) => (
              <button
                key={action.status}
                type="button"
                disabled={busy}
                onClick={() => save(action.status)}
                className={action.primary ? 'btn-primary w-full' : 'btn-secondary w-full'}
              >
                <action.icon size={17} aria-hidden="true" />
                {saving === action.status ? t('common.saving') : t(action.key)}
              </button>
            ))}
          </div>
          {dirty && <p className="mt-3 text-meta text-ink-2">{t('common.unsavedChanges')}</p>}
        </aside>
      </div>
    </div>
  )
}
