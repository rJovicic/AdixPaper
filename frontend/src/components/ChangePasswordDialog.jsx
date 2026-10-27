import { useRef, useState } from 'react'
import { api, errorMessage, fieldErrors } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useI18n } from '../i18n'
import { focusFirstInvalid } from '../lib/focus'
import Dialog from './ui/Dialog'
import Field from './ui/Field'
import { useToast } from './ui/Toast'

const EMPTY = { current_password: '', new_password: '', confirm: '' }

/** Any user changes their own password; other devices are signed out, this one stays in. */
export default function ChangePasswordDialog({ onClose }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const { replaceToken } = useAuth()
  const [form, setForm] = useState(EMPTY)
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
    if (!form.current_password) next.current_password = t('errors.required')
    if (form.new_password.length < 8) next.new_password = t('errors.passwordShort')
    else if (form.new_password === form.current_password) next.new_password = t('account.samePassword')
    if (form.confirm !== form.new_password) next.confirm = t('account.mismatch')
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) {
      focusFirstInvalid(formRef)
      return
    }
    setSaving(true)
    try {
      const { data } = await api.post('/auth/password', { current_password: form.current_password, new_password: form.new_password })
      replaceToken(data.access_token)
      toast.success(t('account.changed'))
      onClose()
    } catch (error) {
      const fields = fieldErrors(error, i18n)
      setErrors(fields)
      setFormError(Object.keys(fields).length ? '' : errorMessage(error, i18n))
      setSaving(false)
    }
  }

  const input = (field, label, autoComplete, hint) => (
    <Field label={label} error={errors[field]} hint={hint} required>
      {(props) => <input {...props} className="control" type="password" maxLength={72} autoComplete={autoComplete} value={form[field]} onChange={update(field)} />}
    </Field>
  )

  return (
    <Dialog
      title={t('account.changePassword')}
      description={t('account.changePasswordHint')}
      onClose={onClose}
      busy={saving}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          <button type="submit" form="password-form" className="btn-primary" disabled={saving}>{saving ? t('common.saving') : t('account.submit')}</button>
        </>
      }
    >
      <form id="password-form" ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded border border-urgent/30 bg-urgent-wash px-3 py-2.5 text-sm font-medium text-urgent">{formError}</p>}
        {input('current_password', t('account.current'), 'current-password')}
        {input('new_password', t('account.new'), 'new-password', t('account.newHint'))}
        {input('confirm', t('account.confirm'), 'new-password')}
      </form>
    </Dialog>
  )
}
