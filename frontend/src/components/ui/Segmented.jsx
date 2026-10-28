/** A small set of mutually exclusive choices (e.g. a period). Fills the width on phones so it never overflows. */
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="grid w-full auto-cols-fr grid-flow-col rounded border border-rule-strong bg-stock p-0.5 sm:inline-grid sm:w-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-[2.25rem] rounded-sm px-2 text-sm font-semibold leading-tight transition-colors sm:px-3 ${
            value === option.value ? 'bg-brand text-stock' : 'text-ink-2 hover:bg-ink/5 hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
