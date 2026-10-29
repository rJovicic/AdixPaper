import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Download, Factory, Pencil, Plus, QrCode, Search, SearchX, Trash2 } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import { focusFirstInvalid } from '../../lib/focus'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import Dialog from '../../components/ui/Dialog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'
import { MACHINE_STATUSES, MachineStatus, useLabels } from '../../components/assets'

const COMPANIES = ['Cupup d.o.o', 'Delt papir d.o.o']
const EMPTY = {
  naziv: '', tip: '', tvrtka: '', proizvodac: '', model: '', serijski_broj: '', inventurni_broj: '', lokacija: '', datum_kupnje: '', status: 'Aktivno', napomene: '',
}
const COMPONENT_SEARCH_MIN = 2

/** Add or edit a machine's own details. Its components are managed on the machine's page. */
export function MachineDialog({ machine, onClose, onSaved }) {
  const i18n = useI18n()
  const { t, machineStatus } = i18n
  const [form, setForm] = useState(() => (machine ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, machine[key] ?? ''])) } : EMPTY))
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
    const next = {}
    if (!form.naziv.trim()) next.naziv = t('errors.required')
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) {
      focusFirstInvalid(formRef)
      return
    }
    setSaving(true)
    const payload = { ...form, tvrtka: form.tvrtka || null, datum_kupnje: form.datum_kupnje || null }
    try {
      const { data } = machine ? await api.put(`/oprema/${machine.id}`, payload) : await api.post('/oprema', payload)
      onSaved(data, !machine)
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSaving(false)
    }
  }

  const text = (field, label, props = {}) => (
    <Field label={label} error={errors[field]} required={props.required} optional={!props.required} hint={props.hint}>
      {(fieldProps) => <input {...fieldProps} className="control" value={form[field]} onChange={update(field)} maxLength={props.max || 100} type={props.type || 'text'} />}
    </Field>
  )

  return (
    <Dialog
      title={machine ? t('machines.editTitle') : t('machines.addTitle')}
      description={machine?.naziv}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="machine-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </>
      }
    >
      <form id="machine-form" ref={formRef} onSubmit={submit} noValidate>
        {formError && <p role="alert" className="mb-4 rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{text('naziv', t('machines.name'), { required: true, max: 200 })}</div>
          {text('proizvodac', t('machines.manufacturer'))}
          {text('model', t('machines.model'))}
          {text('inventurni_broj', t('assets.inventory'), { hint: t('assets.identifierHint') })}
          {text('serijski_broj', t('machines.serial'))}
          <Field label={t('machines.status')}>
            {(props) => (
              <select {...props} className="control" value={form.status} onChange={update('status')}>
                {MACHINE_STATUSES.map((value) => <option key={value} value={value}>{machineStatus(value)}</option>)}
              </select>
            )}
          </Field>
          {text('tip', t('machines.type'))}
          <Field label={t('machines.company')} optional>
            {(props) => (
              <select {...props} className="control" value={form.tvrtka} onChange={update('tvrtka')}>
                <option value="">{t('machines.noCompany')}</option>
                {COMPANIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            )}
          </Field>
          {text('lokacija', t('machines.location'), { max: 150 })}
          {text('datum_kupnje', t('machines.purchased'), { type: 'date' })}
          <Field label={t('assets.description')} optional className="sm:col-span-2">
            {(props) => <textarea {...props} className="control" rows={2} maxLength={5000} value={form.napomene} onChange={update('napomene')} />}
          </Field>
        </div>
        {!machine && <p className="mt-4 text-meta text-ink-2">{t('assets.componentsAfterSave')}</p>}
      </form>
    </Dialog>
  )
}

/** Components of any machine matching the search (name, model, manufacturer, identifiers). */
function ComponentMatches({ query }) {
  const { t } = useI18n()
  const q = query.trim()
  const matches = useAsync(
    () => (q.length >= COMPONENT_SEARCH_MIN ? api.get('/oprema/komponente/trazi', { params: { q } }).then((response) => asArray(response.data)) : []),
    [q],
  )
  if (q.length < COMPONENT_SEARCH_MIN || !matches.data?.length) return null
  return (
    <section aria-labelledby="component-matches" className="surface mb-4 overflow-hidden">
      <h2 id="component-matches" className="border-b border-rule px-4 py-2.5 text-sm font-semibold text-ink-2">{t('assets.componentMatches', { n: matches.data.length })}</h2>
      <ul className="divide-y divide-rule">
        {matches.data.map((component) => (
          <li key={component.id}>
            <Link to={`/admin/oprema/${component.oprema_id}/komponente/${component.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-ground/40">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{component.naziv}</span>
                <span className="block text-meta text-ink-2">
                  {[component.oprema?.naziv, component.model, component.proizvodac, component.inventurni_broj, component.serijski_broj].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Machines() {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | machine
  const [deleting, setDeleting] = useState(null)
  const labels = useLabels()
  const machines = useAsync(() => api.get('/oprema').then((response) => asArray(response.data)), [])
  const canDelete = user?.rola === 'admin'
  useLiveRefresh(() => machines.refresh())

  useEffect(() => {
    document.title = `${t('machines.title')} · ${t('app.name')}`
  }, [t])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (machines.data || []).filter((machine) => (!status || machine.status === status)
      && (!q || [machine.naziv, machine.tip, machine.lokacija, machine.serijski_broj, machine.inventurni_broj, machine.proizvodac, machine.model]
        .filter(Boolean).join(' ').toLowerCase().includes(q)))
  }, [machines.data, query, status])
  const filtered = Boolean(query || status)

  const onSaved = (saved, created) => {
    toast.success(t('machines.saved'))
    setEditing(null)
    if (created) navigate(`/admin/oprema/${saved.id}?nova=1`)
    else machines.reload()
  }

  const remove = async () => {
    try {
      await api.delete(`/oprema/${deleting.id}`)
      toast.success(t('machines.deleted'))
      machines.reload()
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  const faultsLink = (machine, className) => (machine.aktivni_kvarovi > 0 ? (
    <Link to={`/admin/kvarovi?oprema=${machine.id}`} className={`numeral link ${className}`} aria-label={t('machines.showFaults', { name: machine.naziv, n: machine.aktivni_kvarovi })}>
      {machine.aktivni_kvarovi}
    </Link>
  ) : <span className={`numeral text-ink-3 ${className}`}>0</span>)

  const actions = (machine) => (
    <div className="flex justify-end gap-1">
      <button type="button" className="btn-icon" aria-label={t('machines.qrRow', { name: machine.naziv })} title={t('assets.labelsMachine')} onClick={() => labels.download(`/oprema/${machine.id}/qr-oznake.pdf`, 'adix-paper-qr-oznake-masine.pdf')} disabled={labels.busy}>
        <QrCode size={18} aria-hidden="true" />
      </button>
      <button type="button" className="btn-icon" aria-label={`${t('common.edit')}: ${machine.naziv}`} onClick={() => setEditing(machine)}>
        <Pencil size={18} aria-hidden="true" />
      </button>
      {/* Only a machine with no faults can be deleted (the server refuses otherwise, to keep history);
          one with faults is retired by setting its status to Raspisano. */}
      {canDelete && !machine.broj_kvarova && (
        <button type="button" className="btn-icon hover:bg-urgent-wash hover:text-urgent" aria-label={`${t('machines.delete')}: ${machine.naziv}`} onClick={() => setDeleting(machine)}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )

  return (
    <div>
      {labels.dialog}
      <PageHeader
        title={t('machines.title')}
        meta={machines.data ? t('common.results', { n: rows.length }) : ' '}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => labels.download('/oprema/export.xlsx', 'adix-paper-masine-komponente.xlsx')} disabled={labels.busy}>
              <Download size={17} aria-hidden="true" /> {t('assets.exportRegister')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => labels.download('/oprema/qr-oznake.pdf', 'adix-paper-qr-oznake.pdf')} disabled={labels.busy || !machines.data?.length} title={t('machines.qrHint')}>
              <QrCode size={17} aria-hidden="true" /> {t('machines.qrAll')}
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus size={18} aria-hidden="true" /> {t('machines.add')}</button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input type="search" className="control pl-9" aria-label={t('common.search')} placeholder={t('assets.searchMachines')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <select className="control" aria-label={t('machines.status')} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">{t('machines.allStatuses')}</option>
          {MACHINE_STATUSES.map((value) => <option key={value} value={value}>{i18n.machineStatus(value)}</option>)}
        </select>
      </div>

      <ComponentMatches query={query} />

      {machines.loading && !machines.data ? (
        <div className="surface"><LoadingRows rows={4} /></div>
      ) : machines.error ? (
        <div className="surface"><ErrorState error={machines.error} onRetry={machines.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface">
          {filtered
            ? <EmptyState icon={SearchX} title={t('machines.noMatchTitle')} action={<button type="button" className="btn-secondary" onClick={() => { setQuery(''); setStatus('') }}>{t('common.clearFilters')}</button>} />
            : <EmptyState icon={Factory} title={t('machines.emptyTitle')} body={t('machines.emptyBody')} action={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>{t('machines.add')}</button>} />}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((machine) => (
              <li key={machine.id} className="surface flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={`/admin/oprema/${machine.id}`} className="link break-words font-semibold text-ink">{machine.naziv}</Link>
                  <p className="break-words text-meta text-ink-2">{[machine.model, machine.proizvodac, machine.lokacija].filter(Boolean).join(' · ') || '—'}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                    <MachineStatus status={machine.status} />
                    <span>{t('assets.componentsCount', { n: machine.broj_komponenti })}</span>
                    <span className="inline-flex min-h-[2.75rem] items-center gap-1">{t('assets.activeFaults')}: {faultsLink(machine, '')}</span>
                  </div>
                </div>
                {actions(machine)}
              </li>
            ))}
          </ul>
          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-[0.9375rem]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="w-full px-4 py-2.5 font-semibold">{t('machines.name')}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{t('assets.components')}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{t('assets.activeFaults')}</th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{t('assets.urgentFaults')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('machines.status')}</th>
                  <th scope="col" className="w-36 px-4 py-2.5"><span className="sr-only">{t('common.edit')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((machine) => (
                  <tr key={machine.id} className="hover:bg-ground/40">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/oprema/${machine.id}`} className="link block font-semibold text-ink">{machine.naziv}</Link>
                      <span className="block text-meta text-ink-2">{[machine.model, machine.proizvodac, machine.lokacija].filter(Boolean).join(' · ') || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right numeral">{machine.broj_komponenti}</td>
                    <td className="px-4 py-2.5 text-right">{faultsLink(machine, 'text-lg')}</td>
                    <td className={`px-4 py-2.5 text-right numeral ${machine.hitni_kvarovi ? 'font-semibold text-urgent' : 'text-ink-3'}`}>{machine.hitni_kvarovi}</td>
                    <td className="px-4 py-2.5"><MachineStatus status={machine.status} /></td>
                    <td className="px-2 py-1.5">{actions(machine)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <MachineDialog
          key={editing === 'new' ? 'new' : editing.id}
          machine={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('machines.deleteTitle')}
          body={t('machines.deleteBody', { name: deleting.naziv })}
          confirmLabel={t('machines.delete')}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
