import { useState } from 'react'
import { Lock, MessageSquare, Send } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import Field from './ui/Field'

function eventTitle(event, i18n) {
  const { t, status, priority } = i18n
  const data = event.podaci || {}
  const base = t(`fault.events.${event.tip}`)
  if (event.tip === 'status' && data.old && data.new) return `${base}: ${t('fault.eventChange', { from: status(data.old), to: status(data.new) })}`
  if (event.tip === 'prioritet' && data.old && data.new) return `${base}: ${t('fault.eventChange', { from: priority(data.old), to: priority(data.new) })}`
  return base.startsWith('fault.') ? event.naslov : base
}

export default function Timeline({ faultId, events, canInternal = false, onAdded }) {
  const i18n = useI18n()
  const { t, format } = i18n
  const toast = useToast()
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const value = text.trim()
    if (!value) {
      setError(t('errors.required'))
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post(`/kvarovi/${faultId}/komentari`, { tekst: value, interno: canInternal && internal })
      setText('')
      setInternal(false)
      toast.success(t('fault.commentAdded'))
      await onAdded?.()
    } catch (err) {
      setError(errorMessage(err, i18n))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="timeline-title" className="surface">
      <h2 id="timeline-title" className="border-b border-rule px-5 py-3.5 text-base font-semibold">{t('fault.timeline')}</h2>

      {events.length === 0 ? (
        <p className="px-5 py-5 text-ink-2">{t('fault.timelineEmpty')}</p>
      ) : (
        <ol className="px-5 py-4">
          {events.map((item, index) => {
            const isComment = item.tip === 'komentar'
            return (
              <li key={item.id} className="relative flex gap-3 pb-5 last:pb-1">
                {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[0.6875rem] top-6 w-px bg-rule" />}
                <span
                  aria-hidden="true"
                  className={`relative mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${
                    isComment ? 'bg-brand text-stock' : 'border border-rule-strong bg-stock text-ink-3'
                  }`}
                >
                  {isComment ? <MessageSquare size={13} /> : <span className="h-1.5 w-1.5 rounded-[1px] bg-ink-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-semibold text-ink">
                    {eventTitle(item, i18n)}
                    {item.interno && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-ground px-1.5 py-0.5 text-label font-semibold uppercase text-ink-2">
                        <Lock size={11} aria-hidden="true" /> {t('fault.internal')}
                      </span>
                    )}
                  </p>
                  {item.opis && <p className="mt-1 whitespace-pre-wrap break-words text-ink-2">{item.opis}</p>}
                  <p className="mt-1 text-meta text-ink-3">
                    <time dateTime={item.kreiran}>{format.dateTime(item.kreiran)}</time>
                    {item.korisnik ? ` · ${item.korisnik.ime} ${item.korisnik.prezime}` : ''}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <form onSubmit={submit} className="space-y-3 border-t border-rule bg-ground/40 px-5 py-4" noValidate>
        <Field label={t('fault.comment')} error={error}>
          {(props) => (
            <textarea
              {...props}
              className="control"
              rows={3}
              maxLength={5000}
              value={text}
              placeholder={t('fault.commentPlaceholder')}
              onChange={(event) => setText(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canInternal ? (
            <label className="inline-flex min-h-[2.75rem] cursor-pointer items-center gap-2.5 text-[0.9375rem] text-ink-2">
              <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} className="h-5 w-5 accent-[rgb(var(--brand))]" />
              {t('fault.commentInternal')}
            </label>
          ) : <span />}
          <button type="submit" disabled={saving} className="btn-secondary">
            <Send size={16} aria-hidden="true" />
            {saving ? t('common.saving') : t('fault.commentSubmit')}
          </button>
        </div>
      </form>
    </section>
  )
}
