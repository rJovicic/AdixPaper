import { useEffect, useState } from 'react'
import { Plus, LogOut, X, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import api from '../api/axios'
import { useNavigate } from 'react-router-dom'
import { PrioritetBadge, StatusBadge } from './Dashboard'
import BrandLogo from '../components/BrandLogo'
import { clearSession, getStoredUser, roleLabel, saveSession } from '../utils/auth'

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const emptyForm = { oprema_id: '', naslov: '', opis: '', prioritet: 'Normalno' }

export default function RadnikView() {
  const [kvarovi, setKvarovi] = useState([])
  const [oprema, setOprema] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(() => getStoredUser())
  const navigate = useNavigate()

  const ime = user.ime || user.username || 'Korisnik'
  const prezime = user.prezime || ''
  const displayName = `${ime} ${prezime}`.trim()

  const load = () => {
    api.get('/kvarovi').then(r => setKvarovi(Array.isArray(r.data) ? r.data : []))
    api.get('/oprema').then(r => setOprema(Array.isArray(r.data) ? r.data : []))
  }

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => setUser(saveSession({ ...data, access_token: localStorage.getItem('token') })))
      .catch(() => {
        clearSession()
        navigate('/login', { replace: true })
      })
    load()
  }, [])

  const save = async () => {
    if (!form.oprema_id || !form.naslov) return alert('Odaberite opremu i unesite naslov')
    setSaving(true)
    try {
      await api.post('/kvarovi', { ...form, oprema_id: parseInt(form.oprema_id) })
      setShowAdd(false)
      setForm(emptyForm)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Greška')
    } finally {
      setSaving(false)
    }
  }

  const logout = () => { clearSession(); navigate('/login') }

  const fmt = (dt) => dt ? new Date(dt).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  const otvoreni = kvarovi.filter(k => k.status !== 'Riješeno')
  const rijeseni = kvarovi.filter(k => k.status === 'Riješeno')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-800 text-white px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center overflow-hidden p-1">
            <BrandLogo />
          </div>
          <div>
            <h1 className="font-bold">Adix Paper</h1>
            <p className="text-blue-200 text-xs">{displayName} · {roleLabel(user.rola)}</p>
          </div>
        </div>
        <button onClick={logout} className="p-2 hover:bg-blue-700 rounded-lg transition-colors">
          <LogOut size={18} />
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-4">
            <AlertTriangle size={20} className="text-yellow-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{otvoreni.length}</p>
            <p className="text-xs text-gray-500">Otvoreni</p>
          </div>
          <div className="card text-center py-4">
            <CheckCircle size={20} className="text-green-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{rijeseni.length}</p>
            <p className="text-xs text-gray-500">Riješeni</p>
          </div>
          <div className="card text-center py-4">
            <Clock size={20} className="text-blue-500 mx-auto mb-1" />
            <p className="text-2xl font-bold text-gray-900">{kvarovi.length}</p>
            <p className="text-xs text-gray-500">Ukupno</p>
          </div>
        </div>

        <button
          onClick={() => { setForm(emptyForm); setShowAdd(true) }}
          className="w-full btn-primary py-4 text-base flex items-center justify-center gap-2"
        >
          <Plus size={20} /> Prijavi kvar
        </button>

        {otvoreni.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-700 mb-3">Moji otvoreni kvarovi</h2>
            <div className="space-y-3">
              {otvoreni.map(k => (
                <div key={k.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{k.naslov}</p>
                      <p className="text-sm text-gray-500">{k.oprema?.naziv || '—'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <PrioritetBadge prioritet={k.prioritet} />
                      <StatusBadge status={k.status} />
                    </div>
                  </div>
                  {k.voditelj && (
                    <p className="text-xs text-gray-400 mt-2">
                      Voditelj: {k.voditelj.ime} {k.voditelj.prezime}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{fmt(k.datum_prijave)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {rijeseni.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-700 mb-3">Riješeni kvarovi</h2>
            <div className="space-y-2">
              {rijeseni.slice(0, 5).map(k => (
                <div key={k.id} className="card opacity-70 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-700 text-sm">{k.naslov}</p>
                      <p className="text-xs text-gray-400">{k.oprema?.naziv || '—'} · {fmt(k.datum_rjesavanja)}</p>
                    </div>
                    <StatusBadge status={k.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="Prijavi kvar" onClose={() => setShowAdd(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Oprema *</label>
              <select className="input" value={form.oprema_id} onChange={e => setForm({ ...form, oprema_id: e.target.value })}>
                <option value="">— Odaberite opremu —</option>
                {oprema.map(o => (
                  <option key={o.id} value={o.id}>{o.naziv}{o.lokacija ? ` (${o.lokacija})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Naslov problema *</label>
              <input className="input" placeholder="Kratki opis kvara..." value={form.naslov}
                onChange={e => setForm({ ...form, naslov: e.target.value })} />
            </div>
            <div>
              <label className="label">Opis (detalji)</label>
              <textarea className="input" rows={3} placeholder="Detaljniji opis..." value={form.opis}
                onChange={e => setForm({ ...form, opis: e.target.value })} />
            </div>
            <div>
              <label className="label">Prioritet</label>
              <select className="input" value={form.prioritet} onChange={e => setForm({ ...form, prioritet: e.target.value })}>
                <option value="Hitno">Hitno — stroj stoji</option>
                <option value="Normalno">Normalno</option>
                <option value="Nisko">Nisko — može čekati</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Slanje...' : 'Pošalji'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary">Odustani</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
