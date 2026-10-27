import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useI18n } from '../../i18n'

const MAX_OPTIONS = 40

function partText(part) {
  return `${part.naziv} ${part.sifra || ''}`.toLowerCase()
}

/** Searchable combobox over the spare-parts catalogue (WAI-ARIA combobox pattern). */
export default function PartPicker({ parts, value, onChange, invalid, describedBy, label }) {
  const { t } = useI18n()
  const listId = useId()
  const inputRef = useRef(null)
  const selected = useMemo(() => parts.find((part) => Number(part.id) === Number(value)), [parts, value])
  const [query, setQuery] = useState(selected?.naziv || '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    setQuery(selected?.naziv || '')
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q && q !== selected?.naziv?.toLowerCase() ? parts.filter((part) => partText(part).includes(q)) : parts
    return pool.slice(0, MAX_OPTIONS)
  }, [parts, query, selected?.naziv])

  useEffect(() => setActive(0), [query])

  const choose = (part) => {
    onChange(part.id)
    setQuery(part.naziv)
    setOpen(false)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => Math.min(index + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && options[active]) {
      event.preventDefault()
      choose(options[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
      setQuery(selected?.naziv || '')
    }
  }

  return (
    <div className="relative">
      <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-[0.8rem] text-ink-3" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        className="control pl-9"
        value={query}
        placeholder={t('fault.partPlaceholder')}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => {
          setOpen(false)
          setQuery(selected?.naziv || '')
        }, 120)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
      />
      {selected && !open && <p className="mt-1 truncate text-meta text-ink-3 tabular">{selected.sifra || t('fault.noCode')}</p>}
      {open && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-rule bg-stock py-1 shadow-lift">
          {options.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-3">{t('fault.partNoResults', { q: query.trim() })}</li>
          ) : options.map((part, index) => (
            <li
              key={part.id}
              id={`${listId}-${part.id}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(part)}
              className={`cursor-pointer px-3 py-2 ${index === active ? 'bg-brand-wash' : ''}`}
            >
              <span className="block truncate font-medium text-ink">{part.naziv}</span>
              <span className="block truncate text-meta text-ink-2 tabular">{part.sifra || t('fault.noCode')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
