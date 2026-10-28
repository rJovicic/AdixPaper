import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CalendarCheck, CheckCircle2, ClipboardList, Download, FileSpreadsheet, FileText, Factory, Search, SearchX, SlidersHorizontal, X } from 'lucide-react'
import Dialog from '../../components/ui/Dialog'
import { api, errorMessage } from '../../api/client'
import { useFileExport } from '../../components/FileExport'
import { asArray, useAsync } from '../../lib/useAsync'
import { useLiveRefresh } from '../../lib/live'
import { useI18n } from '../../i18n'
import { useToast } from '../../components/ui/Toast'
import Menu from '../../components/ui/Menu'
import FaultRow from '../../components/FaultRow'
import { DueTag, FaultNumber, PriorityMark, StatusMark, WaitingTag } from '../../components/ui/Marks'
import { EmptyState, ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'

const PAGE = 50
const OPEN_STATUSES = ['Novo', 'U rješavanju', 'Na čekanju']
const PRIORITIES = ['Hitno', 'Normalno', 'Nisko']
const WAITING = ['dijelovi', 'vanjski_servis', 'odobrenje', 'proizvodnja', 'ostalo']
const PERIODS = ['danas', '7d', '30d', 'mjesec']
const SEARCH_DELAY_MS = 250

async function fetchPage(query, offset, size = PAGE) {
  const response = await api.get(`/kvarovi?${query}${query ? '&' : ''}limit=${size}&offset=${offset}`)
  return { rows: asArray(response.data), total: Number(response.headers['x-total-count'] ?? response.data.length) }
}

async function fetchCount(query) {
  const response = await api.get(`/kvarovi?${query}${query ? '&' : ''}limit=1`)
  return Number(response.headers['x-total-count'] ?? 0)
}

/** Old links (`status=Riješeno`, `rijeseno=7d`) open the resolved view; `status=otvoreni` the active one. */
function viewFromParams(params) {
  if (params.get('pregled') === 'rijeseni' || params.get('status') === 'Riješeno' || params.get('rijeseno')) return 'resolved'
  return 'active'
}

function ViewTabs({ view, counts, onChange }) {
  const { t } = useI18n()
  const tabs = [
    { id: 'active', label: t('faults.tabActive'), count: counts?.active },
    { id: 'resolved', label: t('faults.tabResolved'), count: counts?.resolved },
  ]
  return (
    <div role="tablist" aria-label={t('faults.views')} className="pill-track mb-4 sm:inline-flex sm:min-w-[22rem]">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => onChange(tab.id)} className="pill-tab">
          {tab.label}
          {typeof tab.count === 'number' && <span className="tabular">({tab.count})</span>}
        </button>
      ))}
    </div>
  )
}

/** Phones: one tap per priority, as chips under the search. */
function PriorityChips({ value, onChange }) {
  const { t, priority } = useI18n()
  return (
    <div role="group" aria-label={t('faults.priorityChips')} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:hidden">
      <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange('')}>{t('faults.chipAll')}</button>
      {PRIORITIES.map((item) => (
        <button key={item} type="button" className="chip" aria-pressed={value === item} onClick={() => onChange(value === item ? '' : item)}>
          {priority(item)}
        </button>
      ))}
    </div>
  )
}

/** The URL's search text, settled: the list is not re-fetched on every keystroke. */
function useSettled(value, delay) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

function FilterChip({ icon: Icon, label, value, clearLabel, onClear }) {
  return (
    <span className="inline-flex min-h-[2.25rem] items-center gap-2 rounded border border-rule-strong bg-stock pl-3 text-sm">
      <Icon size={16} aria-hidden="true" className="text-ink-3" />
      <span>{label}: <span className="font-semibold">{value}</span></span>
      <button type="button" className="btn-icon h-9 w-9" aria-label={clearLabel} onClick={onClear}>
        <X size={16} aria-hidden="true" />
      </button>
    </span>
  )
}

export default function Faults() {
  const i18n = useI18n()
  const { t, format, status: statusLabel, priority: priorityLabel, waitingReason } = i18n
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = viewFromParams(params)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = {
    q: params.get('q') || '',
    status: OPEN_STATUSES.includes(params.get('status')) && view === 'active' ? params.get('status') : '',
    prioritet: params.get('prioritet') || '',
    sla: params.get('sla') || '',
    sort: params.get('sort') || (view === 'resolved' ? 'rijeseno' : 'novo'),
    assignee: params.get('preuzeo') || '',
    machine: params.get('oprema') || '',
    waiting: params.get('cekanje') || '',
    resolved: PERIODS.includes(params.get('rijeseno')) ? params.get('rijeseno') : '',
  }
  const settledQ = useSettled(filters.q.trim(), SEARCH_DELAY_MS)

  // Filters shared by both views (search, priority, machine, handler): the tab counts use them too.
  const sharedQuery = useMemo(() => {
    const query = new URLSearchParams()
    if (filters.prioritet) query.set('prioritet', filters.prioritet)
    if (/^\d+$/.test(filters.machine)) query.set('oprema_id', filters.machine)
    if (filters.assignee === 'ja' || filters.assignee === 'nitko' || /^\d+$/.test(filters.assignee)) query.set('preuzeo', filters.assignee)
    if (settledQ) query.set('q', settledQ)
    return query.toString()
  }, [filters.prioritet, filters.machine, filters.assignee, settledQ])

  // Every filter is applied on the server, so the count, the pages and the exports agree.
  const serverQuery = useMemo(() => {
    const query = new URLSearchParams(sharedQuery)
    if (view === 'active') {
      query.set('status', filters.status || 'otvoreni')
      if (filters.sla) query.set('sla', filters.sla)
      if (WAITING.includes(filters.waiting)) query.set('cekanje', filters.waiting)
      if (filters.sort !== 'novo') query.set('sort', filters.sort)
    } else {
      query.set('status', 'Riješeno')
      if (filters.resolved) query.set('rijeseno', filters.resolved)
      if (filters.sort !== 'novo') query.set('sort', filters.sort)
    }
    return query.toString()
  }, [sharedQuery, view, filters.status, filters.sla, filters.waiting, filters.resolved, filters.sort])

  // A live refresh re-reads as many rows as are on screen, so "Show more" pages survive it.
  const shownRows = useRef(PAGE)
  const firstPage = useAsync(() => fetchPage(serverQuery, 0, shownRows.current), [serverQuery])
  const counts = useAsync(async () => {
    const shared = sharedQuery ? `${sharedQuery}&` : ''
    const [active, resolved] = await Promise.all([fetchCount(`${shared}status=otvoreni`), fetchCount(`${shared}status=Riješeno`)])
    return { active, resolved }
  }, [sharedQuery])
  useLiveRefresh(() => {
    firstPage.refresh()
    counts.refresh()
  })
  // Pages loaded with "Show more" belong to the first page they extend; a new first page drops them.
  const [moreState, setMore] = useState({ base: null, rows: [], loading: false })
  const more = moreState.base === firstPage.data ? moreState : { base: firstPage.data, rows: [], loading: false }

  const machine = useAsync(
    () => (/^\d+$/.test(filters.machine) ? api.get(`/oprema/${filters.machine}`).then((response) => response.data) : null),
    [filters.machine],
  )
  const leads = useAsync(() => api.get('/korisnici/radnici/lista').then((response) => asArray(response.data).filter((user) => user.rola !== 'radnik')), [])

  useEffect(() => {
    document.title = `${t('faults.title')} · ${t('app.name')}`
  }, [t])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (view === 'resolved') next.set('pregled', 'rijeseni') // clearing the period keeps the view
    setParams(next, { replace: true })
  }

  const rows = useMemo(() => [...(firstPage.data?.rows || []), ...more.rows], [firstPage.data, more.rows])
  const total = firstPage.data?.total ?? 0
  useEffect(() => {
    shownRows.current = Math.max(PAGE, rows.length)
  }, [rows.length])
  useEffect(() => {
    shownRows.current = PAGE // a different list starts with one page
  }, [serverQuery])

  const changeView = (next) => {
    const query = new URLSearchParams()
    for (const key of ['q', 'prioritet', 'oprema', 'preuzeo']) if (params.get(key)) query.set(key, params.get(key))
    if (next === 'resolved') query.set('pregled', 'rijeseni')
    setParams(query, { replace: true })
  }

  const loadMore = async () => {
    const base = firstPage.data
    setMore({ ...more, loading: true })
    try {
      const page = await fetchPage(serverQuery, rows.length)
      setMore((current) => (current.base === base ? { base, rows: [...current.rows, ...page.rows], loading: false } : current))
    } catch (error) {
      setMore((current) => ({ ...current, loading: false }))
      toast.error(`${t('faults.loadMoreFailed')} ${errorMessage(error, i18n)}`)
    }
  }

  const hasFilters = Boolean(filters.q || filters.status || filters.prioritet || filters.sla || filters.assignee || filters.machine || filters.waiting || filters.resolved)
  const clearFilters = () => setParams(view === 'resolved' ? { pregled: 'rijeseni' } : {}, { replace: true })

  const exporter = useFileExport('faults.exportFailed')
  const exportFile = (path, filename) => exporter.run(`${path}${serverQuery ? `?${serverQuery}` : ''}`, filename)

  // The same controls serve the desktop row and the phone sheet.
  const filterSelects = (
    <>
        {view === 'active' ? (
          <select className="control" aria-label={t('faults.status')} value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">{t('faults.openStatuses')}</option>
            {OPEN_STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}
          </select>
        ) : (
          <select className="control" aria-label={t('faults.resolvedFilter')} value={filters.resolved} onChange={(event) => setFilter('rijeseno', event.target.value)}>
            <option value="">{t('faults.resolvedAnyTime')}</option>
            {PERIODS.map((value) => <option key={value} value={value}>{t(`dashboard.periodName.${value}`)}</option>)}
          </select>
        )}
        <select className="control" aria-label={t('faults.priority')} value={filters.prioritet} onChange={(event) => setFilter('prioritet', event.target.value)}>
          <option value="">{t('faults.allPriorities')}</option>
          {PRIORITIES.map((value) => <option key={value} value={value}>{priorityLabel(value)}</option>)}
        </select>
        {view === 'active' && (
          <>
            <select className="control" aria-label={t('faults.sla')} value={filters.sla} onChange={(event) => setFilter('sla', event.target.value)}>
              <option value="">{t('faults.allSla')}</option>
              <option value="kasni">{t('sla.filterLate')}</option>
              <option value="uskoro">{t('sla.filterSoon')}</option>
              <option value="ok">{t('sla.filterOk')}</option>
            </select>
            <select className="control" aria-label={t('waiting.filter')} value={filters.waiting} onChange={(event) => setFilter('cekanje', event.target.value)}>
              <option value="">{t('waiting.allReasons')}</option>
              {WAITING.map((value) => <option key={value} value={value}>{waitingReason(value)}</option>)}
            </select>
          </>
        )}
        <select className="control" aria-label={t('faults.assignee')} value={filters.assignee} onChange={(event) => setFilter('preuzeo', event.target.value)}>
          <option value="">{t('faults.allAssignees')}</option>
          <option value="ja">{t('faults.assignedToMe')}</option>
          <option value="nitko">{t('faults.unassigned')}</option>
          {(leads.data || []).length > 0 && (
            <optgroup label={t('faults.allLeads')}>
              {leads.data.map((user) => <option key={user.id} value={String(user.id)}>{user.ime} {user.prezime}</option>)}
            </optgroup>
          )}
        </select>
        <select className="control" aria-label={t('faults.sort')} value={filters.sort} onChange={(event) => setFilter('sort', event.target.value === (view === 'resolved' ? 'rijeseno' : 'novo') ? '' : event.target.value)}>
          {view === 'resolved' && <option value="rijeseno">{t('faults.sortResolvedNewest')}</option>}
          <option value="novo">{t('faults.sortNewest')}</option>
          <option value="staro">{t('faults.sortOldest')}</option>
          {view === 'active' && <option value="rizik">{t('faults.sortRisk')}</option>}
        </select>
    </>
  )
  const activeFilters = [filters.status, filters.prioritet, filters.sla, filters.waiting, filters.assignee, filters.resolved, filters.machine].filter(Boolean).length

  const loading = firstPage.loading
  return (
    <div>
      {exporter.dialog}
      <PageHeader
        title={t('faults.title')}
        meta={firstPage.data ? t('common.results', { n: total }) : ' '}
        actions={
          <>
            <Menu
              label={t('faults.export')}
              icon={Download}
              note={t('faults.exportHint')}
              items={[
                { label: t('faults.exportXlsx'), icon: FileSpreadsheet, onSelect: () => exportFile('/kvarovi/export.xlsx', 'adix-paper-kvarovi.xlsx') },
                { label: t('faults.exportParts'), icon: FileSpreadsheet, onSelect: () => exportFile('/kvarovi/export-dijelovi.xlsx', 'adix-paper-utroseni-dijelovi.xlsx') },
                { label: t('faults.exportPdf'), icon: FileText, onSelect: () => exportFile('/kvarovi/export.pdf', 'adix-paper-kvarovi.pdf') },
              ]}
            />
          </>
        }
      />

      <ViewTabs view={view} counts={counts.data} onChange={changeView} />

      {(filters.machine || filters.resolved) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {filters.machine && (
            <FilterChip
              icon={Factory}
              label={t('faults.machineFilter')}
              value={machine.data?.naziv || `#${filters.machine}`}
              clearLabel={t('faults.clearMachine')}
              onClear={() => setFilter('oprema', '')}
            />
          )}
          {filters.resolved && (
            <FilterChip
              icon={CalendarCheck}
              label={t('faults.resolvedFilter')}
              value={t(`dashboard.periodName.${filters.resolved}`)}
              clearLabel={t('faults.clearResolved')}
              onClear={() => setFilter('rijeseno', '')}
            />
          )}
        </div>
      )}

      {/* Phones: search and one Filters button; the controls open in a sheet. Wider screens: one row. */}
      <div className="mb-4 flex gap-2 sm:hidden">
        <div className="relative min-w-0 flex-1">
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className="control pl-9"
            aria-label={t('common.search')}
            placeholder={t('faults.searchPlaceholder')}
            maxLength={200}
            value={filters.q}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </div>
        <button type="button" className="btn-secondary shrink-0" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal size={17} aria-hidden="true" />
          {t('faults.filters')}
          {activeFilters > 0 && <span className="min-w-[1.25rem] rounded-full bg-brand px-1.5 text-center text-xs font-bold leading-5 text-stock">{activeFilters}</span>}
        </button>
      </div>
      <PriorityChips value={filters.prioritet} onChange={(value) => setFilter('prioritet', value)} />
      {filtersOpen && (
        <Dialog
          title={t('faults.filters')}
          onClose={() => setFiltersOpen(false)}
          footer={
            <>
              <button type="button" className="btn-secondary" onClick={() => { clearFilters(); setFiltersOpen(false) }}>{t('common.clearFilters')}</button>
              <button type="button" className="btn-primary" onClick={() => setFiltersOpen(false)}>
                {firstPage.data ? t('faults.showResults', { n: total }) : t('common.close')}
              </button>
            </>
          }
        >
          <div className="grid gap-3">{filterSelects}</div>
        </Dialog>
      )}

      <div className={`surface mb-4 hidden gap-3 p-3 sm:grid sm:grid-cols-3 ${
        view === 'active' ? 'xl:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))]' : 'lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]'
      }`}>
        <div className={`relative col-span-2 sm:col-span-3 ${view === 'active' ? 'xl:col-span-1' : 'lg:col-span-1'}`}>
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            className="control pl-9"
            aria-label={t('common.search')}
            placeholder={t('faults.searchPlaceholder')}
            maxLength={200}
            value={filters.q}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </div>
        {filterSelects}
      </div>

      {loading && !firstPage.data ? (
        <div className="surface"><LoadingRows rows={6} /></div>
      ) : firstPage.error ? (
        <div className="surface"><ErrorState error={firstPage.error} onRetry={firstPage.reload} /></div>
      ) : rows.length === 0 ? (
        <div className="surface">
          {hasFilters ? (
            <EmptyState
              icon={SearchX}
              title={t('faults.noMatchTitle')}
              action={<button type="button" className="btn-secondary" onClick={clearFilters}>{t('common.clearFilters')}</button>}
            />
          ) : view === 'resolved' ? (
            <EmptyState icon={CheckCircle2} title={t('faults.emptyResolvedTitle')} body={t('faults.emptyResolvedBody')} />
          ) : (
            <EmptyState icon={ClipboardList} title={t('faults.emptyActiveTitle')} body={t('faults.emptyActiveBody')} />
          )}
        </div>
      ) : (
        <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ul className="surface divide-y divide-rule overflow-hidden md:hidden">
            {rows.map((fault) => (
              <li key={fault.id}><FaultRow fault={fault} to={`/admin/kvarovi/${fault.id}`} /></li>
            ))}
          </ul>

          <div className="surface hidden overflow-x-auto md:block">
            <table className="w-full text-[0.9375rem]">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="w-20 px-4 py-2.5 font-medium">#</th>
                  <th scope="col" className="w-[38%] px-4 py-2.5 font-medium">{t('faults.colFault')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('fault.priority')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('fault.status')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{view === 'resolved' ? t('fault.resolvedAt') : t('fault.due')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">{t('fault.assignee')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">{t('fault.reportedAt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((fault) => (
                  <tr
                    key={fault.id}
                    onClick={(event) => {
                      if (event.target.closest('a')) return
                      navigate(`/admin/kvarovi/${fault.id}`)
                    }}
                    className="cursor-pointer transition-colors hover:bg-brand-wash/50"
                  >
                    <td className="px-4 py-3 align-top"><FaultNumber id={fault.id} size="sm" /></td>
                    <td className="max-w-0 px-4 py-3">
                      <Link to={`/admin/kvarovi/${fault.id}`} className="block truncate font-semibold text-ink hover:underline">{fault.naslov}</Link>
                      <span className="block truncate text-meta text-ink-2">{[fault.oprema?.naziv, fault.komponenta?.naziv].filter(Boolean).join(' · ')}</span>
                    </td>
                    <td className="px-4 py-3"><PriorityMark priority={fault.prioritet} className="text-[0.75rem]" /></td>
                    <td className="px-4 py-3">
                      <StatusMark status={fault.status} className="text-[0.75rem]" />
                      <WaitingTag fault={fault} compact className="mt-1 flex text-meta" />
                    </td>
                    <td className="px-4 py-3">
                      {fault.status === 'Riješeno'
                        ? <span className="whitespace-nowrap text-sm tabular text-ink-2">{format.dateShort(fault.datum_rjesavanja)}</span>
                        : <DueTag fault={fault} />}
                    </td>
                    <td className="hidden max-w-[11rem] truncate px-4 py-3 text-ink-2 lg:table-cell">
                      {fault.voditelj ? `${fault.voditelj.ime} ${fault.voditelj.prezime}` : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-ink-2 tabular xl:table-cell">{format.dateShort(fault.datum_prijave)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length < total && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn-secondary" disabled={more.loading} onClick={loadMore}>
                {more.loading ? t('faults.loadingMore') : t('common.showMore', { n: Math.min(PAGE, total - rows.length) })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
