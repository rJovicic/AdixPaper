import { useEffect, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api/client'
import { asArray, useAsync } from '../../lib/useAsync'
import { useI18n } from '../../i18n'
import { ErrorState, PageHeader } from '../../components/ui/States'

const get = (path) => api.get(path).then((response) => response.data)

function Panel({ title, children, action }) {
  return (
    <section className="surface flex flex-col" aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

function RankList({ rows, empty }) {
  if (!rows.length) return <p className="px-5 py-6 text-ink-3">{empty}</p>
  return (
    <ol className="divide-y divide-rule">
      {rows.map((row, index) => (
        <li key={`${row.title}-${index}`} className="flex items-center gap-3 px-5 py-2.5">
          <span className="numeral w-5 shrink-0 text-ink-3">{index + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{row.title}</span>
            {row.meta && <span className="block truncate text-meta text-ink-2">{row.meta}</span>}
          </span>
          <span className="numeral shrink-0 text-lg text-ink">{row.value}</span>
        </li>
      ))}
    </ol>
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
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-rule-strong" />{t('dashboard.reportedSeries')}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-brand" />{t('dashboard.resolvedSeries')}</span>
      </div>
      <div className="h-56" role="img" aria-label={`${t('dashboard.byMonth')}: ${data.map((row) => `${row.mjesec} ${row.ukupno}/${row.rijeseno}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgb(214 218 224)" />
            <XAxis dataKey="mjesec" tickLine={false} axisLine={{ stroke: 'rgb(214 218 224)' }} tick={{ fill: 'rgb(71 78 89)', fontSize: 12 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'rgb(71 78 89)', fontSize: 12 }} width={40} />
            <Tooltip cursor={{ fill: 'rgb(231 237 247 / 0.6)' }} contentStyle={{ borderRadius: 5, border: '1px solid rgb(214 218 224)', fontSize: 13 }} />
            <Bar dataKey="ukupno" name={t('dashboard.reportedSeries')} fill="rgb(133 140 151)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="rijeseno" name={t('dashboard.resolvedSeries')} fill="rgb(42 89 162)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function Analytics() {
  const { t, format } = useI18n()
  const stats = useAsync(() => get('/dashboard/stats'), [])
  const monthly = useAsync(() => get('/dashboard/kvarovi-po-mjesecu').then(asArray), [])
  const machines = useAsync(() => get('/dashboard/top-oprema').then(asArray), [])
  const components = useAsync(() => get('/dashboard/top-komponente').then(asArray), [])
  const parts = useAsync(() => get('/dashboard/utrosak-dijelova').then(asArray), [])

  useEffect(() => {
    document.title = `${t('analytics.title')} · ${t('app.name')}`
  }, [t])

  const s = stats.data

  return (
    <div>
      <PageHeader title={t('analytics.title')} meta={t('analytics.meta')} />
      {stats.error && <div className="surface mb-6"><ErrorState error={stats.error} onRetry={stats.reload} /></div>}
      <section aria-labelledby="month-title" className="surface mb-6 flex flex-col overflow-hidden md:flex-row">
        <h2 id="month-title" className="flex items-center border-b border-rule bg-ground/50 px-5 py-3 text-base font-semibold md:border-b-0 md:border-r">{t('dashboard.month')}</h2>
        <dl className="grid flex-1 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            [t('dashboard.resolvedMonth'), s ? String(s.rijeseni_ovaj_mjesec) : '–'],
            [t('dashboard.avgResolution'), s ? format.duration(s.prosjecno_vrijeme_rjesavanja_min) : '–'],
            [t('dashboard.cost'), s ? format.moneyRound(s.ukupni_troskovi_ovaj_mjesec) : '–'],
            [t('dashboard.partsCost'), s ? format.moneyRound(s.rezervni_dijelovi_ovaj_mjesec) : '–'],
            [t('dashboard.downtime'), s ? format.duration(s.zastoj_ovaj_mjesec_min) : '–'],
          ].map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5 border-b border-r border-rule px-4 py-2.5 lg:border-b-0">
              <dt className="text-meta leading-snug text-ink-2">{label}</dt>
              <dd className="whitespace-nowrap font-semibold tabular text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <Panel title={`${t('dashboard.byMonth')} · ${new Date().getFullYear()}`}>
            {monthly.error ? <ErrorState error={monthly.error} onRetry={monthly.reload} /> : <MonthlyChart rows={monthly.data || []} />}
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Panel title={t('dashboard.topMachines')}>
            {machines.error ? <ErrorState error={machines.error} onRetry={machines.reload} /> : (
              <RankList
                empty={t('dashboard.noData')}
                rows={(machines.data || []).slice(0, 6).map((row) => ({ title: row.naziv, meta: [row.lokacija, row.ukupni_troskovi > 0 ? format.money(row.ukupni_troskovi) : null].filter(Boolean).join(' · '), value: row.broj_kvarova }))}
              />
            )}
            {s && <p className="border-t border-rule px-5 py-2.5 text-meta text-ink-2">{t('dashboard.machinesLine', { n: s.ukupno_opreme, broken: s.neispravna_oprema })}</p>}
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-3">
          <Panel title={t('dashboard.topComponents')}>
            {components.error ? <ErrorState error={components.error} onRetry={components.reload} /> : (
              <RankList empty={t('dashboard.noData')} rows={(components.data || []).slice(0, 6).map((row) => ({ title: row.naziv, meta: row.oprema, value: row.broj_kvarova }))} />
            )}
          </Panel>
        </div>
        <div className="min-w-0 lg:col-span-2">
          <Panel title={t('dashboard.partsUsage')}>
            {parts.error ? <ErrorState error={parts.error} onRetry={parts.reload} /> : (
              <RankList
                empty={t('dashboard.noData')}
                rows={(parts.data || []).slice(0, 6).map((row) => ({ title: row.naziv, meta: row.sifra, value: format.number(row.kolicina) }))}
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
