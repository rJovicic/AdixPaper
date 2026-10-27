import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import { api, errorMessage, fieldErrors } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { focusFirstInvalid } from '../../lib/focus'
import { useAuth } from '../../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'
import Dialog from '../../components/ui/Dialog'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Field from '../../components/ui/Field'
import RadioCards from '../../components/ui/RadioCards'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const ROLES = ['radnik', 'voditelj', 'admin']
const EMPTY = { username: '', ime: '', prezime: '', email: '', telefon: '', odjel: '', rola: 'radnik', password: '' }
const USERNAME = /^[A-Za-z0-9._-]{3,50}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function UserDialog({ user, isSelf, onClose, onSaved }) {
  const i18n = useI18n()
  const { t, role } = i18n
  const [form, setForm] = useState(() => (user ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((key) => [key, user[key] ?? ''])), password: '' } : EMPTY))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  const set = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }
  const update = (field) => (event) => set(field, event.target.value)

  const submit = async (event) => {
    event.preventDefault()
    const next = {}
    if (!user && !USERNAME.test(form.username.trim())) next.username = t('errors.usernameFormat')
    if (!form.ime.trim()) next.ime = t('errors.required')
    if (!form.prezime.trim()) next.prezime = t('errors.required')
    if (form.email.trim() && !EMAIL.test(form.email.trim())) next.email = t('errors.email')
    if ((!user || form.password) && form.password.length < 8) next.password = t('errors.passwordShort')
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) {
      focusFirstInvalid(formRef)
      return
    }
    setSaving(true)
    const payload = { ...form, username: form.username.trim() }
    if (user) {
      delete payload.username
      if (!payload.password) delete payload.password
      if (isSelf) delete payload.rola
    }
    try {
      if (user) await api.put(`/korisnici/${user.id}`, payload)
      else await api.post('/korisnici', payload)
      onSaved()
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSaving(false)
    }
  }

  const text = (field, label, { required = false, max = 100, type = 'text', autoComplete } = {}) => (
    <Field label={label} error={errors[field]} required={required} optional={!required}>
      {(props) => <input {...props} className="control" type={type} maxLength={max} autoComplete={autoComplete} value={form[field]} onChange={update(field)} />}
    </Field>
  )

  return (
    <Dialog
      title={user ? t('users.editTitle') : t('users.addTitle')}
      description={user ? `${user.ime} ${user.prezime} · @${user.username}` : undefined}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="user-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </>
      }
    >
      <form id="user-form" ref={formRef} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {formError && <p role="alert" className="rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent sm:col-span-2">{formError}</p>}
        {!user && (
          <Field label={t('users.username')} error={errors.username} required className="sm:col-span-2">
            {(props) => <input {...props} className="control" maxLength={50} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" value={form.username} onChange={update('username')} />}
          </Field>
        )}
        {text('ime', t('users.firstName'), { required: true })}
        {text('prezime', t('users.lastName'), { required: true })}
        {text('odjel', t('users.department'))}
        {text('telefon', t('users.phone'), { max: 20, type: 'tel' })}
        {text('email', t('users.email'), { max: 150, type: 'email' })}
        <Field
          label={user ? t('users.newPassword') : t('users.password')}
          error={errors.password}
          hint={user ? t('users.newPasswordHint') : t('users.passwordHint')}
          required={!user}
          optional={Boolean(user)}
        >
          {(props) => <input {...props} className="control" type="password" autoComplete="new-password" maxLength={72} value={form.password} onChange={update('password')} />}
        </Field>
        <div className="sm:col-span-2">
          {isSelf ? (
            <p className="rounded border border-rule bg-ground/60 px-3 py-2.5 text-sm text-ink-2">{role(form.rola)} — {t('users.selfLocked')}</p>
          ) : (
            <RadioCards
              legend={t('users.role')}
              name="rola"
              value={form.rola}
              onChange={(value) => set('rola', value)}
              options={ROLES.map((value) => ({ value, label: role(value), hint: t(`roleHints.${value}`) }))}
            />
          )}
        </div>
      </form>
    </Dialog>
  )
}

export default function Users() {
  const i18n = useI18n()
  const { t, format, role } = i18n
  const toast = useToast()
  const { user: me } = useAuth()
  const [editing, setEditing] = useState(null)
  const [deactivating, setDeactivating] = useState(null)
  const users = useAsync(() => api.get('/korisnici').then((response) => asArray(response.data)), [])

  useEffect(() => {
    document.title = `${t('users.title')} · ${t('app.name')}`
  }, [t])

  const rows = useMemo(() => [...(users.data || [])].sort((a, b) => Number(b.aktivan) - Number(a.aktivan)), [users.data])
  const activeCount = rows.filter((user) => user.aktivan).length

  const setActive = async (user, aktivan) => {
    try {
      await api.put(`/korisnici/${user.id}`, { aktivan })
      toast.success(aktivan ? t('users.activated') : t('users.deactivated'))
      users.setData((list) => list.map((item) => (item.id === user.id ? { ...item, aktivan } : item)))
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  const actions = (user) => {
    const isSelf = String(user.id) === String(me?.id)
    return (
      <div className="flex justify-end gap-1">
        <button type="button" className="btn-icon" aria-label={`${t('common.edit')}: ${user.ime} ${user.prezime}`} onClick={() => setEditing(user)}>
          <Pencil size={18} aria-hidden="true" />
        </button>
        {user.aktivan ? (
          <button
            type="button"
            className="btn-icon hover:bg-urgent-wash hover:text-urgent"
            disabled={isSelf}
            title={isSelf ? t('users.selfLocked') : undefined}
            aria-label={`${t('users.deactivate')}: ${user.ime} ${user.prezime}`}
            onClick={() => setDeactivating(user)}
          >
            <UserX size={18} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="btn-icon hover:bg-ok-wash hover:text-ok" aria-label={`${t('users.activate')}: ${user.ime} ${user.prezime}`} onClick={() => setActive(user, true).catch(() => {})}>
            <UserCheck size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    )
  }

  const nameCell = (user) => (
    <>
      <span className="block font-semibold">
        {user.ime} {user.prezime}
        {String(user.id) === String(me?.id) && <span className="ml-2 text-meta font-normal text-ink-3">({t('users.you')})</span>}
      </span>
      <span className="block text-meta text-ink-2">@{user.username}{user.odjel ? ` · ${user.odjel}` : ''}</span>
    </>
  )

  const statusCell = (user) => (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[2px] ${user.aktivan ? 'bg-brand' : 'border-[1.5px] border-ink-3'}`} />
      {user.aktivan ? t('common.active') : t('common.inactive')}
    </span>
  )

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        meta={users.data ? t('users.activeCount', { n: activeCount }) : ' '}
        actions={<button type="button" className="btn-primary" onClick={() => setEditing('new')}><Plus size={18} aria-hidden="true" /> {t('users.add')}</button>}
      />

      {users.loading && !users.data ? (
        <div className="surface"><LoadingRows rows={4} /></div>
      ) : users.error ? (
        <div className="surface"><ErrorState error={users.error} onRetry={users.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface"><EmptyState icon={UsersIcon} title={t('users.emptyTitle')} /></div>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {rows.map((user) => (
              <li key={user.id} className={`surface flex items-start gap-3 px-4 py-3 ${user.aktivan ? '' : 'bg-ground/60'}`}>
                <div className="min-w-0 flex-1">
                  {nameCell(user)}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                    <span>{role(user.rola)}</span>
                    {statusCell(user)}
                  </div>
                </div>
                {actions(user)}
              </li>
            ))}
          </ul>
          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-[0.9375rem]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('users.firstName')} / {t('users.lastName')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('users.role')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-semibold lg:table-cell">{t('users.lastLogin')}</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">{t('fault.status')}</th>
                  <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">{t('common.edit')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((user) => (
                  <tr key={user.id} className={user.aktivan ? 'hover:bg-ground/40' : 'bg-ground/50 text-ink-2'}>
                    <td className="px-4 py-2.5">{nameCell(user)}</td>
                    <td className="px-4 py-2.5">{role(user.rola)}</td>
                    <td className="hidden whitespace-nowrap px-4 py-2.5 text-ink-2 tabular lg:table-cell">{user.zadnja_prijava ? format.dateShort(user.zadnja_prijava) : t('users.never')}</td>
                    <td className="px-4 py-2.5">{statusCell(user)}</td>
                    <td className="px-2 py-1">{actions(user)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <UserDialog
          key={editing === 'new' ? 'new' : editing.id}
          user={editing === 'new' ? null : editing}
          isSelf={editing !== 'new' && String(editing.id) === String(me?.id)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success(t('users.saved'))
            setEditing(null)
            users.reload()
          }}
        />
      )}
      {deactivating && (
        <ConfirmDialog
          title={t('users.deactivateTitle')}
          body={t('users.deactivateBody', { name: `${deactivating.ime} ${deactivating.prezime}` })}
          confirmLabel={t('users.deactivate')}
          onConfirm={() => setActive(deactivating, false)}
          onClose={() => setDeactivating(null)}
        />
      )}
    </div>
  )
}
