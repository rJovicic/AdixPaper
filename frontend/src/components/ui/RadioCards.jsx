import { useId } from 'react'

/**
 * Large radio options for choices that need a sentence of explanation (e.g. urgency).
 * options: [{ value, label, hint, marker }]
 */
export default function RadioCards({ legend, name, value, onChange, options, error }) {
  const errorId = useId()
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">{legend}</legend>
      <div className="grid gap-2">
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label
              key={option.value}
              className={`flex min-h-[3.25rem] cursor-pointer items-start gap-3 rounded border px-3.5 py-3 transition-colors
                has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand
                ${checked ? 'border-brand bg-brand-wash' : 'border-rule-strong bg-stock hover:border-ink-3'}`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--brand))]"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold text-ink">
                  {option.marker}
                  {option.label}
                </span>
                {option.hint && <span className="mt-0.5 block text-sm text-ink-2">{option.hint}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && <p id={errorId} className="mt-1.5 text-sm font-medium text-urgent">{error}</p>}
    </fieldset>
  )
}
