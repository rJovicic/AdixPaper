import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Wrench, AlertTriangle, CheckCircle, Clock, TrendingUp, Users, Euro, Activity } from 'lucide-react'
import api from '../api/axios'

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

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
      <div className={`p-3 rounded-xl ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [troskovi, setTroskovi] = useState([])
  const [vrste, setVrste] = useState([])
  const [topKvarovi, setTopKvarovi] = useState([])
  const [aktivnost, setAktivnost] = useState([])

  useEffect(() => {
    api.get('/dashboard/stats').then(r => setStats(r.data))
    api.get('/dashboard/troskovi-po-mjesecu').then(r => setTroskovi(r.data))
    api.get('/dashboard/odrzavanje-po-vrsti').then(r => setVrste(r.data))
    api.get('/dashboard/top-kvarovi').then(r => setTopKvarovi(r.data))
    api.get('/dashboard/aktivnost-radnika').then(r => setAktivnost(r.data))
  }, [])

  if (!stats) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm">Pregled stanja sustava - {new Date().toLocaleDateString('hr-HR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Wrench} label="Ukupno opreme" value={stats.ukupno_opreme} sub={`${stats.aktivna_oprema} aktivno`} color="blue" />
        <StatCard icon={AlertTriangle} label="Neispravno" value={stats.neispravna_oprema} sub={`${stats.na_servisu} na servisu`} color="red" />
        <StatCard icon={Activity} label="Održavanja ovaj mj." value={stats.odrzavanja_ovaj_mjesec} sub={`Ukupno: ${stats.ukupno_odrzavanja}`} color="green" />
        <StatCard icon={Users} label="Aktivni radnici" value={stats.broj_radnika} color="purple" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={Euro} label="Troškovi ovaj mj." value={`${stats.ukupni_troskovi_ovaj_mjesec.toFixed(2)} €`} color="yellow" />
        <StatCard icon={TrendingUp} label="Troškovi ove god." value={`${stats.ukupni_troskovi_godina.toFixed(2)} €`} color="blue" />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Troškovi po mjesecu ({new Date().getFullYear()})</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={troskovi}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mjesec" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `${v.toFixed(2)} €`} />
              <Bar dataKey="troskovi" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Troškovi (€)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Vrste održavanja</h3>
          {vrste.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={vrste} dataKey="broj" nameKey="vrsta" cx="50%" cy="50%" outerRadius={90} label={({ vrsta, percent }) => `${vrsta} ${(percent * 100).toFixed(0)}%`}>
                  {vrste.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-16">Nema podataka</p>}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Top 10 opreme po kvarovima</h3>
          {topKvarovi.length > 0 ? (
            <div className="space-y-2">
              {topKvarovi.map((k, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                    <div>
                      <p className="font-medium text-sm text-gray-800">{k.naziv}</p>
                      <p className="text-xs text-gray-400">{k.lokacija || '—'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">{k.broj_kvarova} kvarova</p>
                    <p className="text-xs text-gray-400">{k.ukupni_troskovi.toFixed(2)} €</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-gray-400 text-center py-8">Nema podataka</p>}
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Aktivnost radnika (ova godina)</h3>
          {aktivnost.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={aktivnost} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="ime" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="broj_odrzavanja" fill="#10b981" radius={[0, 4, 4, 0]} name="Broj održavanja" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-gray-400 text-center py-16">Nema podataka</p>}
        </div>
      </div>
    </div>
  )
}
