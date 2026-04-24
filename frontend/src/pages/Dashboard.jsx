import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, TrendingUp, Wrench, Zap } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import api from '../api/axios'
import { SlaBadge } from '../utils/sla'

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#6b7280', '#10b981']

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors[color]}`}>
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
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data)).catch(() => {})
    api.get('/kvarovi').then(r => setKvarovi(Array.isArray(r.data) ? r.data.filter(k => k.status !== 'Riješeno').slice(0, 8) : []))
    api.get('/dashboard/kvarovi-po-mjesecu').then(r => setChartData(Array.isArray(r.data) ? r.data : []))
    api.get('/dashboard/kvarovi-po-statusu').then(r => setStatusData(Array.isArray(r.data) ? r.data : []))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">Pregled stanja kvarova i održavanja</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={AlertTriangle} label="Otvoreni kvarovi" value={stats.otvoreni_kvarovi} color="yellow" />
          <StatCard icon={Zap} label="Hitni kvarovi" value={stats.hitni_kvarovi} color="red" />
          <StatCard icon={Clock} label="Kvarovi danas" value={stats.kvarovi_danas} color="blue" />
          <StatCard icon={CheckCircle} label="Riješeni ovaj mj." value={stats.rijeseni_ovaj_mjesec} color="green" />
          <StatCard icon={TrendingUp} label="Trošak mj. (€)" value={(stats.ukupni_troskovi_ovaj_mjesec ?? 0).toFixed(0)} color="purple" />
          <StatCard icon={Wrench} label="Oprema" value={stats.ukupno_opreme} sub={`${stats.neispravna_oprema} neispravnih`} color="blue" />
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
                  <th className="text-left pb-3 font-medium hidden md:table-cell">Oprema</th>
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
