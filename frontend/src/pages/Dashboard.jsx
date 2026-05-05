import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, Factory, Gauge, PackageSearch, TrendingUp, Wrench, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import api from '../api/axios'
import { SlaBadge } from '../utils/sla'

const PIE_COLORS = ['#f59e0b', '#2563eb', '#6b7280', '#10b981', '#ef4444']

function durationLabel(minutes = 0) {
  if (!minutes) return '0m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

function moneyLabel(value = 0) {
  return `${Number(value || 0).toFixed(0)} €`
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    red: 'bg-red-50 text-red-700 ring-red-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    yellow: 'bg-amber-50 text-amber-700 ring-amber-100',
    purple: 'bg-violet-50 text-violet-700 ring-violet-100',
    zinc: 'bg-zinc-100 text-zinc-800 ring-zinc-200',
  }
  return (
    <div className="card flex items-center gap-4 border-gray-100 bg-white/95 shadow-sm">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${colors[color]}`}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export function PrioritetBadge({ prioritet }) {
  const map = {
    Hitno: 'bg-red-100 text-red-700',
    Normalno: 'bg-blue-100 text-blue-700',
    Nisko: 'bg-gray-100 text-gray-600'
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[prioritet] || ''}`}>{prioritet}</span>
}

export function StatusBadge({ status }) {
  const map = {
    'Novo': 'bg-yellow-100 text-yellow-700',
    'U rješavanju': 'bg-blue-100 text-blue-700',
    'Na čekanju': 'bg-gray-100 text-gray-600',
    'Riješeno': 'bg-green-100 text-green-700'
  }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] || ''}`}>{status}</span>
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [kvarovi, setKvarovi] = useState([])
  const [chartData, setChartData] = useState([])
  const [statusData, setStatusData] = useState([])
  const [topOprema, setTopOprema] = useState([])
  const [priorityData, setPriorityData] = useState([])
  const [topKomponente, setTopKomponente] = useState([])
  const [partsUsage, setPartsUsage] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {})
    api.get('/kvarovi').then(r => setKvarovi(Array.isArray(r.data) ? r.data.filter(k => k.status !== 'Riješeno').slice(0, 8) : []))
    api.get('/dashboard/kvarovi-po-mjesecu').then(r => setChartData(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/kvarovi-po-statusu').then(r => setStatusData(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/top-oprema').then(r => setTopOprema(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/kvarovi-po-prioritetu').then(r => setPriorityData(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/top-komponente').then(r => setTopKomponente(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/utrosak-dijelova').then(r => setPartsUsage(Array.isArray(r.data) ? r.data : []))
  }, [])

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-zinc-950 px-5 py-5 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Production maintenance command</p>
            <h1 className="mt-2 text-2xl font-bold">Dashboard održavanja</h1>
            <p className="text-sm text-zinc-400">Kvarovi, zastoji, SLA i utrošak dijelova u jednom operativnom pogledu.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xl font-bold">{stats?.ukupno_kvarova ?? 0}</p>
              <p className="text-xs text-zinc-400">Ukupno</p>
            </div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-4 py-3">
              <p className="text-xl font-bold text-amber-200">{stats?.otvoreni_kvarovi ?? 0}</p>
              <p className="text-xs text-zinc-400">Aktivno</p>
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-4 py-3">
              <p className="text-xl font-bold text-emerald-200">{stats?.rijeseni_kvarovi ?? 0}</p>
              <p className="text-xs text-zinc-400">Zatvoreno</p>
            </div>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={AlertTriangle} label="Otvoreni kvarovi" value={stats.otvoreni_kvarovi} color="yellow" />
          <StatCard icon={Gauge} label="U rješavanju" value={stats.u_rjesavanju_kvarovi ?? 0} color="blue" />
          <StatCard icon={Zap} label="Hitni kvarovi" value={stats.hitni_kvarovi} color="red" />
          <StatCard icon={AlertTriangle} label="SLA kasni" value={stats.sla_kasni ?? 0} color="red" />
          <StatCard icon={Clock} label="SLA uskoro" value={stats.sla_uskoro ?? 0} color="yellow" />
          <StatCard icon={Clock} label="Zastoj ukupno" value={durationLabel(stats.ukupni_zastoj_min)} color="zinc" />
          <StatCard icon={CheckCircle} label="Riješeni ovaj mj." value={stats.rijeseni_ovaj_mjesec} color="green" />
          <StatCard icon={CheckCircle} label="Prosjek rješ." value={durationLabel(stats.prosjecno_vrijeme_rjesavanja_min)} color="green" />
          <StatCard icon={TrendingUp} label="Trošak mj." value={moneyLabel(stats.ukupni_troskovi_ovaj_mjesec)} color="purple" />
          <StatCard icon={PackageSearch} label="Rezervni dijelovi mj." value={moneyLabel(stats.rezervni_dijelovi_ovaj_mjesec)} color="zinc" />
          <StatCard icon={Factory} label="Mašine" value={stats.ukupno_opreme} sub={`${stats.neispravna_oprema} neispravnih`} color="blue" />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card">
          <h2 className="font-semibold text-gray-800 mb-4">Kvarovi po mjesecima ({new Date().getFullYear()})</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="mjesec" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="ukupno" name="Ukupno" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                <Bar dataKey="rijeseno" name="Riješeno" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Nema podataka za grafikon</div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Status kvarova</h2>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="broj" nameKey="status" cx="50%" cy="45%" outerRadius={72} label={({ status, broj }) => `${broj}`}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 text-sm">Nema podataka</div>
          )}
          <div className="mt-2 space-y-1">
            {statusData.map((s, i) => (
              <div key={s.status} className="flex items-center gap-2 text-xs text-gray-600">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {s.status}: <span className="font-semibold">{s.broj}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-800">Prioritet kvarova</h2>
          <div className="space-y-3">
            {priorityData.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Nema podataka</p> : priorityData.map(item => {
              const total = priorityData.reduce((sum, row) => sum + row.broj, 0) || 1
              const pct = Math.round((item.broj / total) * 100)
              return (
                <div key={item.prioritet}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">{item.prioritet}</span>
                    <span className="text-gray-500">{item.broj}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100">
                    <div className="h-2 rounded-full bg-zinc-900" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-800">Komponente pod pritiskom</h2>
          <div className="space-y-3">
            {topKomponente.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Nema komponenti s kvarovima</p> : topKomponente.slice(0, 6).map(item => (
              <div key={`${item.oprema}-${item.naziv}`} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{item.naziv}</p>
                  <p className="truncate text-xs text-gray-500">{item.oprema || '—'}</p>
                </div>
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-700">{item.broj_kvarova}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-semibold text-gray-800">Utrošak dijelova</h2>
          <div className="space-y-3">
            {partsUsage.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Još nema strukturiranog utroška</p> : partsUsage.slice(0, 6).map(item => (
              <div key={`${item.dobavljac}-${item.naziv}`} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{item.naziv}</p>
                  <p className="truncate text-xs text-gray-500">{item.dobavljac}{item.sifra ? ` · ${item.sifra}` : ''}</p>
                </div>
                <span className="text-sm font-semibold text-gray-800">{Number(item.kolicina || 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Mašine s najviše kvarova</h2>
          <button onClick={() => navigate('/admin/oprema')} className="text-sm text-blue-600 hover:underline">
            Mašine →
          </button>
        </div>
        {topOprema.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Nema dovoljno podataka za rang listu</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left pb-3 font-medium">Mašina</th>
                  <th className="text-left pb-3 font-medium hidden md:table-cell">Lokacija</th>
                  <th className="text-left pb-3 font-medium">Kvarovi</th>
                  <th className="text-left pb-3 font-medium">Trošak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topOprema.slice(0, 6).map((item, index) => (
                  <tr key={`${item.naziv}-${index}`}>
                    <td className="py-3 font-medium text-gray-900">{item.naziv}</td>
                    <td className="py-3 text-gray-500 hidden md:table-cell">{item.lokacija || '-'}</td>
                    <td className="py-3 text-gray-700">{item.broj_kvarova}</td>
                    <td className="py-3 text-gray-700">{(item.ukupni_troskovi ?? 0).toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Otvoreni kvarovi</h2>
          <button onClick={() => navigate('/admin/kvarovi')} className="text-sm text-blue-600 hover:underline">
            Svi kvarovi →
          </button>
        </div>
        {kvarovi.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Nema otvorenih kvarova</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="text-left pb-3 font-medium">Naslov</th>
                  <th className="text-left pb-3 font-medium hidden md:table-cell">Mašina</th>
                  <th className="text-left pb-3 font-medium">Prioritet</th>
                  <th className="text-left pb-3 font-medium hidden sm:table-cell">Status</th>
                  <th className="text-left pb-3 font-medium">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {kvarovi.map(k => (
                  <tr
                    key={k.id}
                    onClick={() => navigate(`/admin/kvarovi/${k.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 font-medium text-gray-900">{k.naslov}</td>
                    <td className="py-3 text-gray-500 hidden md:table-cell">{k.oprema?.naziv || '-'}</td>
                    <td className="py-3"><PrioritetBadge prioritet={k.prioritet} /></td>
                    <td className="py-3 hidden sm:table-cell"><StatusBadge status={k.status} /></td>
                    <td className="py-3"><SlaBadge kvar={k} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
