import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Factory, Pencil, Plus, QrCode, Search, SearchX, Trash2 } from 'lucide-react'
import { api, downloadFile, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { focusFirstInvalid } from '../../lib/focus'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import Dialog from '../../components/ui/Dialog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const COMPANIES = ['Cupup d.o.o', 'Delt papir d.o.o']
const STATUSES = ['Aktivno', 'Neispravno', 'Na servisu', 'Raspisano']
const STATUS_MARK = { Aktivno: 'bg-brand', Neispravno: 'bg-urgent', 'Na servisu': 'mark-half', Raspisano: 'border-[1.5px] border-ink-3' }
const EMPTY = { naziv: '', tip: '', tvrtka: '', proizvodac: '', model: '', serijski_broj: '', lokacija: '', datum_kupnje: '', status: 'Aktivno', napomene: '' }

function MachineStatus({ status }) {
  const { machineStatus } = useI18n()
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[2px] ${STATUS_MARK[status] || 'bg-ink-3'}`} />
      {machineStatus(status)}
    </span>
  )
}

function ComponentsEditor({ machineId }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const list = useAsync(() => api.get(`/oprema/${machineId}/komponente`).then((response) => asArray(response.data)), [machineId])

  const add = async (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return setError(t('errors.required'))
    setBusy(true)
    setError('')
    try {
      await api.post(`/oprema/${machineId}/komponente`, { naziv: value, aktivna: true })
      setName('')
      await list.reload()
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (component) => {
    try {
      await api.put(`/oprema/komponente/${component.id}`, { aktivna: !component.aktivna })
      list.setData((items) => items.map((item) => (item.id === component.id ? { ...item, aktivna: !item.aktivna } : item)))
    } catch (err) {
      toast.error(errorMessage(err, i18n))
    }
  }

  return (
    <section aria-labelledby="components-title" className="mt-6 border-t border-rule pt-5">
      <h3 id="components-title" className="font-semibold">{t('machines.components')}</h3>
      <p className="mb-3 text-meta text-ink-2">{t('machines.componentsHint')}</p>
      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} className="py-4" />
      ) : (
        <ul className="mb-3 divide-y divide-rule rounded border border-rule">
          {(list.data || []).length === 0 && !list.loading && <li className="px-3 py-3 text-ink-3">{t('machines.noComponents')}</li>}
          {(list.data || []).map((component) => (
            <li key={component.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className={component.aktivna ? 'text-ink' : 'text-ink-3 line-through'}>{component.naziv}</span>
              <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" checked={component.aktivna} onChange={() => toggle(component)} className="h-5 w-5 accent-[rgb(var(--brand))]" />
                <span className="hidden sm:inline">{t('machines.componentActive')}</span>
                <span className="sr-only sm:hidden">{t('machines.componentActive')}: {component.naziv}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex items-start gap-2" noValidate>
        <div className="flex-1">
          <Field label={t('machines.addComponent')} error={error}>
            {(props) => <input {...props} className="control" maxLength={150} value={name} placeholder={t('machines.componentPlaceholder')} onChange={(event) => setName(event.target.value)} />}
          </Field>
        </div>
        <button type="submit" className="btn-secondary mt-[1.875rem]" disabled={busy}>
          <Plus size={17} aria-hidden="true" /> {t('common.add')}
        </button>
      </form>
    </section>
  )
}

/** Downloads printable QR labels: one machine, or every machine in use. */
function useQrLabels() {
  const i18n = useI18n()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const download = async (machineId) => {
    setBusy(true)
    try {
      await downloadFile(`/oprema/qr-oznake.pdf${machineId ? `?ids=${machineId}` : ''}`, 'adix-paper-qr-oznake.pdf')
    } catch (error) {
      toast.error(`${i18n.t('machines.qrFailed')} ${errorMessage(error, i18n)}`)
    } finally {
      setBusy(false)
    }
  }
  return { busy, download }
}

function MachineDialog({ machine, justCreated = false, onClose, onSaved }) {
  const i18n = useI18n()
  const { t, machineStatus } = i18n
  const [form, setForm] = useState(() => (machine ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, machine[key] ?? ''])) } : EMPTY))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)
  const qr = useQrLabels()

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const submit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!form.naziv.trim()) next.naziv = t('errors.required')
    if (!form.tip.trim()) next.tip = t('errors.required')
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
    <Field label={label} error={errors[field]} required={props.required} optional={!props.required}>
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
          {machine && (
            <button type="button" className="btn-quiet mr-auto" onClick={() => qr.download(machine.id)} disabled={qr.busy}>
              <QrCode size={17} aria-hidden="true" /> {t('machines.qrOne')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="machine-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </>
      }
    >
      {justCreated && (
        <div role="status" className="mb-5 flex flex-col gap-3 rounded border border-brand/30 bg-brand-wash px-4 py-3.5 sm:flex-row sm:items-center">
          <p className="flex-1 text-[0.9375rem] text-ink">
            <span className="font-semibold">{t('machines.qrCreatedTitle')}</span> {t('machines.qrCreatedBody')}
          </p>
          <button type="button" className="btn-primary shrink-0" onClick={() => qr.download(machine.id)} disabled={qr.busy}>
            <QrCode size={17} aria-hidden="true" /> {t('machines.qrPrint')}
          </button>
        </div>
      )}
      <form id="machine-form" ref={formRef} onSubmit={submit} noValidate>
        {formError && <p role="alert" className="mb-4 rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">{formError}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {text('naziv', t('machines.name'), { required: true, max: 200 })}
          {text('tip', t('machines.type'), { required: true })}
          <Field label={t('machines.status')}>
            {(props) => (
              <select {...props} className="control" value={form.status} onChange={update('status')}>
                {STATUSES.map((value) => <option key={value} value={value}>{machineStatus(value)}</option>)}
              </select>
            )}
          </Field>
          <Field label={t('machines.company')} optional>
            {(props) => (
              <select {...props} className="control" value={form.tvrtka} onChange={update('tvrtka')}>
                <option value="">{t('machines.noCompany')}</option>
                {COMPANIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            )}
          </Field>
          {text('lokacija', t('machines.location'), { max: 150 })}
          {text('serijski_broj', t('machines.serial'))}
          {text('proizvodac', t('machines.manufacturer'))}
          {text('model', t('machines.model'))}
          {text('datum_kupnje', t('machines.purchased'), { type: 'date' })}
          <Field label={t('machines.notes')} optional className="sm:col-span-2">
            {(props) => <textarea {...props} className="control" rows={2} maxLength={5000} value={form.napomene} onChange={update('napomene')} />}
          </Field>
        </div>
      </form>
      {machine ? <ComponentsEditor machineId={machine.id} /> : <p className="mt-5 text-meta text-ink-2">{t('machines.componentsAfterSave')}</p>}
    </Dialog>
  )
}

export default function Machines() {
  const i18n = useI18n()
  const { t, format } = i18n
  const toast = useToast()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | machine
  const [deleting, setDeleting] = useState(null)
  const [createdId, setCreatedId] = useState(null)
  const qr = useQrLabels()
  const machines = useAsync(() => api.get('/oprema').then((response) => asArray(response.data)), [])
  const canDelete = user?.rola === 'admin'

  useEffect(() => {
    document.title = `${t('machines.title')} · ${t('app.name')}`
  }, [t])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = machines.data || []
    if (!q) return list
    return list.filter((machine) => `${machine.naziv} ${machine.tip} ${machine.lokacija || ''} ${machine.serijski_broj || ''}`.toLowerCase().includes(q))
  }, [machines.data, query])

  const onSaved = (saved, created) => {
    toast.success(t('machines.saved'))
    machines.reload()
    // A new machine stays open so its parts can be added and its QR label printed straight away.
    setCreatedId(created ? saved.id : null)
    setEditing(created ? saved : null)
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

  const actions = (machine) => (
    <div className="flex justify-end gap-1">
      <button type="button" className="btn-icon" aria-label={t('machines.qrRow', { name: machine.naziv })} title={t('machines.qrOne')} onClick={() => qr.download(machine.id)} disabled={qr.busy}>
        <QrCode size={18} aria-hidden="true" />
      </button>
      <button type="button" className="btn-icon" aria-label={`${t('common.edit')}: ${machine.naziv}`} onClick={() => setEditing(machine)}>
        <Pencil size={18} aria-hidden="true" />
      </button>
      {canDelete && (
        <button type="button" className="btn-icon hover:bg-urgent-wash hover:text-urgent" aria-label={`${t('machines.delete')}: ${machine.naziv}`} onClick={() => setDeleting(machine)}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  )

  return (
    <div>
      <PageHeader
        title={t('machines.title')}
        meta={machines.data ? t('common.results', { n: rows.length }) : ' '}
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => qr.download()} disabled={qr.busy || !machines.data?.length} title={t('machines.qrHint')}>
              <QrCode size={17} aria-hidden="true" /> {t('machines.qrAll')}
            </button>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus size={18} aria-hidden="true" /> {t('machines.add')}</button>
          </>
        }
      />

      <div className="relative mb-4">
        <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input type="search" className="control pl-9" aria-label={t('common.search')} placeholder={t('machines.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      {machines.loading && !machines.data ? (
        <div className="surface"><LoadingRows rows={4} /></div>
      ) : machines.error ? (
        <div className="surface"><ErrorState error={machines.error} onRetry={machines.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface">
          {query
            ? <EmptyState icon={SearchX} title={t('machines.noMatchTitle')} action={<button type="button" className="btn-secondary" onClick={() => setQuery('')}>{t('common.clearFilters')}</button>} />
            : <EmptyState icon={Factory} title={t('machines.emptyTitle')} body={t('machines.emptyBody')} action={<button type="button" className="btn-primary" onClick={() => setEditing('new')}>{t('machines.add')}</button>} />}
        </div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((machine) => (
              <li key={machine.id} className="surface flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{machine.naziv}</p>
                  <p className="truncate text-ink-2">{[machine.tip, machine.lokacija].filter(Boolean).join(' · ')}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                    <MachineStatus status={machine.status} />
                    {machine.broj_kvarova > 0 ? (
                      <Link to={`/admin/kvarovi?oprema=${machine.id}`} className="link inline-flex min-h-[2.75rem] items-center" aria-label={t('machines.showFaults', { name: machine.naziv, n: machine.broj_kvarova })}>
                        {t('machines.faults')}: <span className="numeral ml-1">{machine.broj_kvarova}</span>
                      </Link>
                    ) : (
                      <span className="inline-flex min-h-[2.75rem] items-center">{t('machines.faults')}: <span className="numeral ml-1 text-ink">0</span></span>
                    )}
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
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('machines.name')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('machines.location')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-semibold lg:table-cell">{t('machines.company')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('machines.status')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('machines.faults')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold lg:table-cell">{t('machines.cost')}</th>
                  <th scope="col" className="w-36 px-4 py-2.5"><span className="sr-only">{t('common.edit')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((machine) => (
                  <tr key={machine.id} className="hover:bg-ground/40">
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold">{machine.naziv}</span>
                      <span className="block text-meta text-ink-2">{[machine.tip, machine.serijski_broj].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{machine.lokacija || '—'}</td>
                    <td className="hidden px-4 py-2.5 text-ink-2 lg:table-cell">{machine.tvrtka || '—'}</td>
                    <td className="px-4 py-2.5"><MachineStatus status={machine.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {machine.broj_kvarova > 0 ? (
                        <Link to={`/admin/kvarovi?oprema=${machine.id}`} className="numeral link text-lg" aria-label={t('machines.showFaults', { name: machine.naziv, n: machine.broj_kvarova })}>
                          {machine.broj_kvarova}
                        </Link>
                      ) : <span className="numeral text-lg text-ink-3">0</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right text-ink-2 tabular lg:table-cell">{format.money(machine.ukupni_troskovi)}</td>
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
          justCreated={editing !== 'new' && editing.id === createdId}
          onClose={() => {
            setEditing(null)
            setCreatedId(null)
          }}
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
