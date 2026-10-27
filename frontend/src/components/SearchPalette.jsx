import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Factory, Search } from 'lucide-react'
import { api } from '../api/client'
import { asArray } from '../lib/useAsync'
import { byRisk, OPEN_STATUSES } from '../lib/sla'
import { useI18n } from '../i18n'
import { FaultNumber, StatusMark } from './ui/Marks'
import { ErrorState } from './ui/States'

const MAX_FAULTS = 8
const MAX_MACHINES = 5

function matchFaults(faults, query) {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  if (!q) return faults.filter((fault) => OPEN_STATUSES.includes(fault.status)).sort(byRisk).slice(0, 6)
  const number = /^\d+$/.test(q) ? q : null
  const scored = []
  for (const fault of faults) {
    const id = String(fault.id)
    let score = -1
    if (number && id === number) score = 0
    else if (number && id.startsWith(number)) score = 1
    else if (`${fault.naslov} ${fault.oprema?.naziv || ''} ${fault.komponenta?.naziv || ''}`.toLowerCase().includes(q)) {
      score = OPEN_STATUSES.includes(fault.status) ? 2 : 3
    }
    if (score >= 0) scored.push([score, fault])
  }
  return scored.sort((a, b) => a[0] - b[0] || b[1].id - a[1].id).slice(0, MAX_FAULTS).map(([, fault]) => fault)
}

function matchMachines(machines, query) {
  const q = query.trim().toLowerCase()
  if (!q || /^#?\d+$/.test(q)) return []
  return machines
    .filter((machine) => `${machine.naziv} ${machine.tip} ${machine.lokacija || ''} ${machine.serijski_broj || ''}`.toLowerCase().includes(q))
    .slice(0, MAX_MACHINES)
}

/** Ctrl/⌘ K search across faults (number, title, machine, part) and machines, for leads and admins. */
export default function SearchPalette({ open, onClose }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [data, setData] = useState({ faults: [], machines: [], loading: false, error: null })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setQuery('')
      setActive(0)
      inputRef.current?.focus()
      // Fresh data each time: faults change all day.
      setData((current) => ({ ...current, loading: true, error: null }))
      Promise.all([api.get('/kvarovi'), api.get('/oprema')])
        .then(([faults, machines]) => setData({ faults: asArray(faults.data), machines: asArray(machines.data), loading: false, error: null }))
        .catch((error) => setData((current) => ({ ...current, loading: false, error })))
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const results = useMemo(() => {
    const faults = matchFaults(data.faults, query).map((fault) => ({ kind: 'fault', key: `f${fault.id}`, item: fault, to: `/admin/kvarovi/${fault.id}` }))
    const machines = matchMachines(data.machines, query).map((machine) => ({ kind: 'machine', key: `m${machine.id}`, item: machine, to: `/admin/kvarovi?oprema=${machine.id}` }))
    return [...faults, ...machines]
  }, [data, query])

  useEffect(() => setActive(0), [query])

  const go = (result) => {
    if (!result) return
    onClose()
    navigate(result.to)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => (results.length ? (index + 1) % results.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => (results.length ? (index - 1 + results.length) % results.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active])
    }
  }

  const optionId = (index) => `${listId}-${index}`
  const faultCount = results.filter((result) => result.kind === 'fault').length
  const heading = (text) => <li role="presentation" className="field-label px-4 pb-1 pt-3">{text}</li>

  return (
    <dialog
      ref={dialogRef}
      aria-label={t('search.title')}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="enter-rise mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-lg border border-rule bg-stock p-0 text-ink shadow-dialog backdrop:bg-key/50"
    >
      <div className="flex items-center gap-3 border-b border-rule px-4">
        <Search size={18} aria-hidden="true" className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results.length ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label={t('search.title')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-ink-3 focus:outline-none"
        />
        <kbd className="hidden rounded-sm border border-rule px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-3 sm:inline">Esc</kbd>
      </div>

      {data.error ? (
        <ErrorState error={data.error} className="py-8" />
      ) : (
        <ul id={listId} role="listbox" aria-label={t('search.title')} className="max-h-[min(60vh,28rem)] overflow-y-auto pb-2">
          {data.loading && !data.faults.length && <li role="presentation" className="px-4 py-6 text-ink-3">{t('common.loading')}</li>}
          {!data.loading && results.length === 0 && (
            <li role="presentation" className="px-4 py-6 text-ink-2">{t('search.noResults', { q: query.trim() })}</li>
          )}
          {faultCount > 0 && heading(query.trim() ? t('search.faults') : t('search.openFaults'))}
          {results.map((result, index) => {
            const selected = index === active
            const optionClass = `mx-2 flex cursor-pointer items-center gap-3 rounded px-2.5 py-2 ${selected ? 'bg-brand-wash' : ''}`
            const first = result.kind === 'machine' && results[index - 1]?.kind !== 'machine'
            return (
              <FragmentRow key={result.key} header={first ? heading(t('search.machines')) : null}>
                <li
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(result)}
                  className={optionClass}
                >
                  {result.kind === 'fault' ? (
                    <>
                      <FaultNumber id={result.item.id} size="sm" className="w-11 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{result.item.naslov}</span>
                        <span className="block truncate text-meta text-ink-2">{[result.item.oprema?.naziv, result.item.komponenta?.naziv].filter(Boolean).join(' · ')}</span>
                      </span>
                      <StatusMark status={result.item.status} className="hidden sm:inline-flex" />
                    </>
                  ) : (
                    <>
                      <span className="flex w-11 shrink-0 justify-center text-ink-3"><Factory size={17} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{result.item.naziv}</span>
                        <span className="block truncate text-meta text-ink-2">{[result.item.tip, result.item.lokacija].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="numeral text-sm text-ink-3">{result.item.broj_kvarova}</span>
                    </>
                  )}
                </li>
              </FragmentRow>
            )
          })}
        </ul>
      )}
      <p className="hidden border-t border-rule bg-[#FAFAFB] px-4 py-2 font-mono text-[0.6875rem] text-ink-3 sm:block">{t('search.hint')}</p>
    </dialog>
  )
}

function FragmentRow({ header, children }) {
  return (
    <>
      {header}
      {children}
    </>
  )
}
