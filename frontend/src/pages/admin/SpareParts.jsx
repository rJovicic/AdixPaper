import { useEffect, useMemo, useRef, useState } from 'react'
import { PackageSearch, Pencil, Plus, Search, SearchX, Trash2 } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { focusFirstInvalid } from '../../lib/focus'
import { useToast } from '../../components/ui/Toast'
import Dialog from '../../components/ui/Dialog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const PAGE = 100
const EMPTY_PART = { naziv: '', sifra: '', jedinica: 'kom', cijena: '' }

// Supplier and stock are stored for existing parts but not managed in the UI (owner's decision, 2026-10-27);
// edits send only the fields below, so stored values stay untouched.
function PartDialog({ part, onClose, onSaved }) {
  const i18n = useI18n()
  const { t } = i18n
  const [form, setForm] = useState(() => (part
    ? { naziv: part.naziv, sifra: part.sifra || '', jedinica: part.jedinica || 'kom', cijena: part.cijena ?? '' }
    : EMPTY_PART))
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
    if (form.cijena !== '' && !(Number(form.cijena) >= 0)) next.cijena = t('errors.notNegative')
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) {
      focusFirstInvalid(formRef)
      return
    }
    setSaving(true)
    const payload = { ...form, cijena: form.cijena === '' ? null : Number(form.cijena) }
    try {
      if (part) await api.put(`/rezervni-dijelovi/${part.id}`, payload)
      else await api.post('/rezervni-dijelovi', payload)
      onSaved()
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSaving(false)
    }
  }

  return (
    <Dialog
      title={part ? t('parts.editTitle') : t('parts.addTitle')}
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="part-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </>
      }
    >
      <form id="part-form" ref={formRef} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent sm:col-span-2">{formError}</p>}
        <Field label={t('parts.name')} error={errors.naziv} required className="sm:col-span-2">
          {(props) => <input {...props} className="control" maxLength={220} value={form.naziv} onChange={update('naziv')} />}
        </Field>
        <Field label={t('parts.code')} error={errors.sifra} optional>
          {(props) => <input {...props} className="control" maxLength={100} value={form.sifra} onChange={update('sifra')} />}
        </Field>
        <Field label={t('parts.unit')} error={errors.jedinica}>
          {(props) => <input {...props} className="control" maxLength={30} value={form.jedinica} onChange={update('jedinica')} />}
        </Field>
        <Field label={t('parts.price')} error={errors.cijena} optional>
          {(props) => <input {...props} className="control tabular" type="number" inputMode="decimal" min="0" step="0.01" value={form.cijena} onChange={update('cijena')} />}
        </Field>
      </form>
    </Dialog>
  )
}

export default function SpareParts() {
  const i18n = useI18n()
  const { t, format } = i18n
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState(null) // null | 'new' | part
  const [removing, setRemoving] = useState(null)
  const parts = useAsync(() => api.get('/rezervni-dijelovi').then((response) => asArray(response.data)), [])

  useEffect(() => {
    document.title = `${t('parts.title')} · ${t('app.name')}`
  }, [t])
  useEffect(() => setLimit(PAGE), [query])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (parts.data || []).filter((part) => !q || `${part.naziv} ${part.sifra || ''}`.toLowerCase().includes(q))
  }, [parts.data, query])

  const remove = async () => {
    try {
      await api.delete(`/rezervni-dijelovi/${removing.id}`)
      toast.success(t('parts.deactivated'))
      parts.setData((list) => list.filter((part) => part.id !== removing.id))
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  const filtered = Boolean(query)

  return (
    <div>
      <PageHeader
        title={t('parts.title')}
        meta={parts.data ? t('parts.summary', { parts: parts.data.length }) : ' '}
        actions={<button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus size={18} aria-hidden="true" /> {t('parts.add')}</button>}
      />

      <div className="relative mb-4">
        <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input type="search" className="control pl-9" aria-label={t('common.search')} placeholder={t('parts.searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>

      {parts.loading && !parts.data ? (
        <div className="surface"><LoadingRows rows={6} /></div>
      ) : parts.error ? (
        <div className="surface"><ErrorState error={parts.error} onRetry={parts.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface">
          {filtered
            ? <EmptyState icon={SearchX} title={t('parts.noMatchTitle')} action={<button type="button" className="btn-secondary" onClick={() => setQuery('')}>{t('common.clearFilters')}</button>} />
            : <EmptyState icon={PackageSearch} title={t('parts.emptyTitle')} body={t('parts.emptyBody')} />}
        </div>
      ) : (
        <>
          {filtered && <p className="mb-2 text-meta text-ink-2" role="status">{t('common.results', { n: rows.length })}</p>}
          <div className="surface overflow-x-auto">
            <table className="w-full text-[0.9375rem]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('parts.name')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-semibold sm:table-cell">{t('parts.unit')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">{t('parts.price')}</th>
                  <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">{t('common.edit')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.slice(0, limit).map((part) => (
                  <tr key={part.id} className="hover:bg-ground/40">
                    <td className="max-w-0 px-4 py-2.5">
                      <span className="block truncate font-medium">{part.naziv}</span>
                      <span className="block truncate text-meta text-ink-2 tabular">{part.sifra || t('fault.noCode')}</span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-ink-2 sm:table-cell">{part.jedinica}</td>
                    <td className="hidden px-4 py-2.5 text-right tabular sm:table-cell">{part.cijena === null || part.cijena === undefined ? '—' : format.money(part.cijena)}</td>
                    <td className="px-2 py-1">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-icon" aria-label={`${t('common.edit')}: ${part.naziv}`} onClick={() => setEditing(part)}>
                          <Pencil size={18} aria-hidden="true" />
                        </button>
                        <button type="button" className="btn-icon hover:bg-urgent-wash hover:text-urgent" aria-label={`${t('parts.deactivate')}: ${part.naziv}`} onClick={() => setRemoving(part)}>
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn-secondary" onClick={() => setLimit((value) => value + PAGE)}>
                {t('common.showMore', { n: Math.min(PAGE, rows.length - limit) })}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <PartDialog
          key={editing === 'new' ? 'new' : editing.id}
          part={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(t('parts.saved'))
            setEditing(null)
            parts.reload()
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={t('parts.deactivateTitle')}
          body={t('parts.deactivateBody', { name: removing.naziv })}
          confirmLabel={t('parts.deactivate')}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
