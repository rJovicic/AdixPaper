import { useId } from 'react'
import { useI18n } from '../../i18n'

/**
 * Label + control + hint + error, wired for assistive technology.
 * `children` is a render function receiving the props to spread on the control.
 */
export default function Field({ label, hint, error, optional = false, required = false, className = '', children }) {
  const id = useId()
  const { t } = useI18n()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-ink">
        {label}
        {optional && <span className="text-meta font-normal text-ink-3">({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined })}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-urgent">
          <span aria-hidden="true" className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-[1px] bg-urgent" />
          {error}
        </p>
      )}
      {hint && <p id={hintId} className="mt-1.5 text-meta text-ink-3">{hint}</p>}
    </div>
  )
}
