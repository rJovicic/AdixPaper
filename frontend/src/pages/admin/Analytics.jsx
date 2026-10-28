import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { PRIORITY_HEX, REPORTED_HEX, RESOLVED_HEX, STATUS_HEX, WAITING_HEX } from '../../lib/stateColors'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { ErrorState, LoadingRows, PageHeader } from '../../components/ui/States'
import Segmented from '../../components/ui/Segmented'

const get = (path) => api.get(path).then((response) => response.data)
const PERIODS = ['30d', 'mjesec', '90d', 'godina']
const PERIOD_KEY = 'adix.analyticsPeriod'
const RECURRING_MIN = 3 // mirrors backend dashboard.RECURRING_MIN

function readPeriod() {
  try {
    const value = localStorage.getItem(PERIOD_KEY)
    return PERIODS.includes(value) ? value : '30d'
  } catch {
    return '30d'
  }
}

function Panel({ title, hint, children, className = '' }) {
  return (
    <section className={`surface flex min-w-0 flex-col ${className}`} aria-label={title}>
      <header className="border-b border-rule px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-meta text-ink-2">{hint}</p>}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function Empty() {
  const { t } = useI18n()
  return <p className="px-5 py-6 text-ink-3">{t('analytics.noData')}</p>
}

/** One headline figure with the same figure for the period before. */
function Metric({ label, value, sub, previous }) {
  const { t } = useI18n()
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-r border-rule px-4 py-3">
      <dt className="field-label leading-snug">{label}</dt>
      <dd className="numeral text-[1.75rem] leading-tight text-ink">{value}</dd>
      {sub && <dd className="truncate text-meta text-ink-2">{sub}</dd>}
      {previous !== undefined && <dd className="truncate text-meta text-ink-3">{t('analytics.previous', { value: previous })}</dd>}
    </div>
  )
}

// Backend month labels (Croatian short names) mapped back to month numbers.
const BACKEND_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

function MonthlyChart({ rows }) {
  const { t, locale } = useI18n()
  const data = useMemo(() => {
    const now = new Date()
    const byMonth = new Map(rows.map((row) => [BACKEND_MONTHS.indexOf(row.mjesec), row]))
    const label = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: now.getMonth() + 1 }, (_, month) => ({
      mjesec: label.format(new Date(now.getFullYear(), month, 1)),
      ukupno: byMonth.get(month)?.ukupno ?? 0,
      rijeseno: byMonth.get(month)?.rijeseno ?? 0,
    }))
  }, [rows, locale])
  if (!rows.length) return <p className="px-5 py-6 text-ink-3">{t('dashboard.noData')}</p>
  return (
    <div className="px-2 pb-3 pt-4">
      <div className="mb-2 flex gap-4 px-3 text-meta text-ink-2" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: REPORTED_HEX }} />{t('dashboard.reportedSeries')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RESOLVED_HEX }} />{t('dashboard.resolvedSeries')}</span>
      </div>
      <div className="h-56" role="img" aria-label={`${t('dashboard.byMonth')}: ${data.map((row) => `${row.mjesec} ${row.ukupno}/${row.rijeseno}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgb(214 218 224)" />
            <XAxis dataKey="mjesec" tickLine={false} axisLine={{ stroke: 'rgb(214 218 224)' }} tick={{ fill: 'rgb(71 78 89)', fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'rgb(71 78 89)', fontSize: 12 }} width={40} />
            <Tooltip cursor={{ fill: 'rgb(231 237 247 / 0.6)' }} contentStyle={{ borderRadius: 5, border: '1px solid rgb(214 218 224)', fontSize: 13 }} />
            <Bar dataKey="ukupno" name={t('dashboard.reportedSeries')} fill={REPORTED_HEX} radius={[3, 3, 0, 0]} />
            <Bar dataKey="rijeseno" name={t('dashboard.resolvedSeries')} fill={RESOLVED_HEX} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** Donut segments as a conic gradient, with a 1° white gap between segments. */
function conic(rows, total) {
  let at = 0
  const stops = rows.map((row) => {
    const from = at
    at += (row.broj / total) * 360
    const gap = rows.length > 1 ? 1 : 0
    return `${STATUS_HEX[row.status]} ${from}deg ${Math.max(from, at - gap)}deg, #fff ${Math.max(from, at - gap)}deg ${at}deg`
  })
  return `conic-gradient(${stops.join(', ')})`
}

/** Where the period's reported faults stand now: a donut with the total in the middle and a legend with counts. */
function StatusDonut({ rows }) {
  const { t, status } = useI18n()
  const total = rows.reduce((sum, row) => sum + row.broj, 0)
  if (!total) return <Empty />
  const data = rows.filter((row) => row.broj > 0)
  return (
    <div className="flex flex-col items-center gap-4 px-5 py-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0" role="img" aria-label={`${t('analytics.byStatus')}: ${data.map((row) => `${status(row.status)} ${row.broj}`).join(', ')}`}>
        {/* A conic gradient: no focusable SVG parts; the wrapper's label carries the data. */}
        <div aria-hidden="true" className="h-full w-full rounded-full" style={{ background: conic(data, total), mask: 'radial-gradient(circle, transparent 52%, #000 53%)', WebkitMask: 'radial-gradient(circle, transparent 52%, #000 53%)' }} />
        <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="numeral text-3xl text-ink">{total}</span>
          <span className="text-meta text-ink-2">{t('analytics.total')}</span>
        </span>
      </div>
      <ul className="w-full space-y-2">
        {rows.map((row) => (
          <li key={row.status} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-ink">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_HEX[row.status] }} />
              {status(row.status)}
            </span>
            <span className="tabular font-semibold text-ink">
              {row.broj}
              <span className="ml-2 font-normal text-ink-3">{Math.round((row.broj / total) * 100)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal hairline bars: the number is always printed, the bar only helps compare. */
function BarRows({ rows }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="divide-y divide-rule">
      {rows.map((row) => (
        <li key={row.key} className="px-5 py-2.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium text-ink">{row.label}</span>
            <span className="shrink-0 text-meta tabular text-ink-2">{row.text}</span>
          </span>
          <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-wash">
            <i className="block h-full rounded-full" style={{ width: `${Math.max(row.value ? 3 : 0, Math.round((row.value / max) * 100))}%`, background: row.color }} />
          </span>
          {row.note && <span className="mt-1 block text-meta text-ink-3">{row.note}</span>}
        </li>
      ))}
    </ul>
  )
}

export default function Analytics() {
  const i18n = useI18n()
  const { t, format, priority, waitingReason } = i18n
  const [period, setPeriodState] = useState(readPeriod)
  const data = useAsync(() => get(`/dashboard/analitika?period=${period}`), [period])
  const monthly = useAsync(() => get('/dashboard/kvarovi-po-mjesecu').then(asArray), [])

  const setPeriod = (value) => {
    setPeriodState(value)
    try {
      localStorage.setItem(PERIOD_KEY, value)
    } catch {
      // Remembering the period is a convenience only.
    }
  }

  useEffect(() => {
    document.title = `${t('analytics.title')} · ${t('app.name')}`
  }, [t])

  const d = data.data
  const s = d?.sazetak
  const p = d?.prethodno
  const duration = (minutes) => (minutes === null || minutes === undefined ? t('analytics.none') : format.duration(minutes))
  const percent = (value) => (value === null || value === undefined ? t('analytics.none') : `${format.number(value)} %`)

  return (
    <div>
      <PageHeader
        title={t('analytics.title')}
        meta={d ? t('analytics.range', { from: format.date(d.od), to: format.date(d.do) }) : ' '}
        actions={
          <Segmented
            label={t('dashboard.periodLabel')}
            value={period}
            onChange={setPeriod}
            options={PERIODS.map((value) => ({ value, label: t(`analytics.periods.${value}`) }))}
          />
        }
      />

      {data.error && !d ? (
        <div className="surface mb-6"><ErrorState error={data.error} onRetry={data.reload} /></div>
      ) : !s ? (
        <div className="surface mb-6"><LoadingRows rows={3} /></div>
      ) : (
        <section aria-label={t('analytics.title')} className="surface mb-3 overflow-hidden" aria-busy={data.loading}>
          <dl className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-4">
            <Metric label={t('analytics.reported')} value={s.prijavljeno} previous={p.prijavljeno} />
            <Metric label={t('analytics.resolved')} value={s.rijeseno} previous={p.rijeseno} />
            <Metric label={t('analytics.toTake')} value={duration(s.vrijeme_do_preuzimanja_min)} previous={duration(p.vrijeme_do_preuzimanja_min)} />
            <Metric label={t('analytics.toResolve')} value={duration(s.vrijeme_do_rjesenja_min)} previous={duration(p.vrijeme_do_rjesenja_min)} />
            <Metric label={t('analytics.repair')} value={duration(s.vrijeme_popravka_min)} previous={duration(p.vrijeme_popravka_min)} />
            <Metric
              label={t('analytics.onTime')}
              value={percent(s.sla_postotak)}
              sub={s.rijeseno ? t('analytics.onTimeOf', { n: s.sla_u_roku, total: s.rijeseno }) : undefined}
              previous={percent(p.sla_postotak)}
            />
            <Metric
              label={t('analytics.downtime')}
              value={s.zastoj_evidentiran ? format.duration(s.zastoj_min) : t('analytics.none')}
              sub={s.rijeseno ? t('analytics.downtimeOf', { n: s.zastoj_evidentiran, total: s.rijeseno }) : undefined}
              previous={p.zastoj_evidentiran ? format.duration(p.zastoj_min) : t('analytics.none')}
            />
            <Metric
              label={t('analytics.cost')}
              value={format.moneyRound(s.trosak_rada + s.trosak_dijelova)}
              sub={t('analytics.costSplit', { work: format.moneyRound(s.trosak_rada), parts: format.moneyRound(s.trosak_dijelova) })}
              previous={format.moneyRound(p.trosak_rada + p.trosak_dijelova)}
            />
          </dl>
        </section>
      )}

      <details className="mb-6 text-sm text-ink-2">
        <summary className="inline-flex min-h-[2.75rem] cursor-pointer items-center font-semibold text-brand">{t('analytics.defsTitle')}</summary>
        <dl className="surface mt-1 grid gap-x-6 gap-y-2 px-5 py-4 md:grid-cols-2">
          {['reported', 'resolved', 'toTake', 'toResolve', 'repair', 'onTime', 'downtime', 'cost'].map((key) => (
            <div key={key}>
              <dt className="font-semibold text-ink">{t(`analytics.${key}`)}</dt>
              <dd>{t(`analytics.defs.${key}`)}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold text-ink">{t('analytics.colMtbf')}</dt>
            <dd>{t('analytics.defs.mtbf')}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">{t('analytics.previous', { value: '…' })}</dt>
            <dd>{t('analytics.defs.previous')}</dd>
          </div>
        </dl>
      </details>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-5">
        <Panel title={t('analytics.machines')} hint={t('analytics.machinesHint')} className="lg:col-span-5">
          {!d ? <LoadingRows rows={3} /> : d.masine.length === 0 ? <Empty /> : (
            <>
              <ul className="divide-y divide-rule md:hidden">
                {d.masine.map((row) => (
                  <li key={row.oprema_id}>
                    <Link to={`/admin/kvarovi?oprema=${row.oprema_id}`} className="block px-5 py-3 hover:bg-brand-wash/50">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{row.naziv}</span>
                        <span className="numeral text-lg">{row.kvarovi}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-x-3 text-meta text-ink-2">
                        <span>{t('analytics.colDowntime')}: {row.zastoj_min ? format.duration(row.zastoj_min) : '—'}</span>
                        <span>{t('analytics.colToResolve')}: {duration(row.vrijeme_do_rjesenja_min)}</span>
                        <span>{t('analytics.colMtbf')}: {row.mtbf_sati === null ? '—' : format.duration(row.mtbf_sati * 60)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <table className="hidden w-full text-[0.9375rem] md:table">
                <thead className="table-head">
                  <tr>
                    <th scope="col" className="w-[34%] px-5 py-2.5 font-semibold">{t('analytics.colMachine')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('analytics.colFaults')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('analytics.colDowntime')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('analytics.colToResolve')}</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">{t('analytics.colMtbf')}</th>
                    <th scope="col" className="px-5 py-2.5 text-right font-semibold">{t('analytics.colCost')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule tabular">
                  {d.masine.map((row) => (
                    <tr key={row.oprema_id} className="hover:bg-brand-wash/50">
                      <td className="max-w-0 px-5 py-2.5">
                        <Link to={`/admin/kvarovi?oprema=${row.oprema_id}`} className="block truncate font-semibold text-ink hover:underline">{row.naziv}</Link>
                        {row.lokacija && <span className="block truncate text-meta text-ink-2">{row.lokacija}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{row.kvarovi}</td>
                      <td className="px-4 py-2.5 text-right">{row.zastoj_min ? format.duration(row.zastoj_min) : '—'}</td>
                      <td className="px-4 py-2.5 text-right">{duration(row.vrijeme_do_rjesenja_min)}</td>
                      <td className="px-4 py-2.5 text-right">{row.mtbf_sati === null ? '—' : format.duration(row.mtbf_sati * 60)}</td>
                      <td className="px-5 py-2.5 text-right">{row.trosak ? format.moneyRound(row.trosak) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>

        <Panel title={`${t('dashboard.byMonth')} · ${new Date().getFullYear()}`} className="lg:col-span-3">
          {monthly.error ? <ErrorState error={monthly.error} onRetry={monthly.reload} /> : <MonthlyChart rows={monthly.data || []} />}
        </Panel>


        <Panel title={t('analytics.byStatus')} hint={t('analytics.byStatusHint')} className="lg:col-span-2">
          {!d ? <LoadingRows rows={2} /> : <StatusDonut rows={d.po_statusu || []} />}
        </Panel>

        <Panel title={t('analytics.recurring')} hint={t('analytics.recurringHint', { n: RECURRING_MIN })} className="lg:col-span-3">
          {!d ? <LoadingRows rows={2} /> : d.ponavljanja.length === 0 ? <Empty /> : (
            <ol className="divide-y divide-rule">
              {d.ponavljanja.map((row) => (
                <li key={`${row.oprema_id}-${row.komponenta}`}>
                  <Link to={`/admin/kvarovi?oprema=${row.oprema_id}&q=${encodeURIComponent(row.komponenta || '')}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-brand-wash/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{row.komponenta} · {row.oprema}</span>
                      <span className="block text-meta text-ink-2">{t('analytics.recurringRow', { date: format.date(row.zadnji) })}</span>
                    </span>
                    <span className="numeral shrink-0 text-lg text-urgent">{row.kvarovi}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t('analytics.waiting')} hint={t('analytics.waitingHint')} className="lg:col-span-2">
          {!d ? <LoadingRows rows={2} /> : d.cekanje.length === 0 ? <Empty /> : (
            <BarRows
              rows={d.cekanje.map((row) => ({
                key: row.razlog,
                label: waitingReason(row.razlog),
                value: row.ukupno_min,
                text: row.broj ? t('analytics.waitingRow', { n: row.broj, time: format.duration(row.ukupno_min) }) : '—',
                note: row.trenutno ? t('analytics.waitingNow', { n: row.trenutno }) : null,
                color: WAITING_HEX,
              }))}
            />
          )}
        </Panel>

        <Panel title={t('analytics.parts')} hint={t('analytics.partsHint')} className="lg:col-span-3">
          {!d ? <LoadingRows rows={2} /> : d.dijelovi.length === 0 ? <Empty /> : (
            <ol className="divide-y divide-rule">
              {d.dijelovi.slice(0, 6).map((row) => (
                <li key={`${row.naziv}-${row.sifra}`} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{row.naziv}</span>
                    <span className="block truncate text-meta text-ink-2">{[row.sifra, row.trosak ? format.money(row.trosak) : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="numeral shrink-0 text-lg">{format.number(row.kolicina)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title={t('analytics.byPriority')} className="lg:col-span-2">
          {!d ? <LoadingRows rows={2} /> : (
            <BarRows rows={d.po_prioritetu.map((row) => ({ key: row.prioritet, label: priority(row.prioritet), value: row.broj, text: String(row.broj), color: PRIORITY_HEX[row.prioritet] }))} />
          )}
        </Panel>
      </div>
    </div>
  )
}
