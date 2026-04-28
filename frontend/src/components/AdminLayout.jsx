import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, Wrench, Users, LogOut, Menu, X, Bell } from 'lucide-react'
import { useCallback, useRef, useState, useEffect } from 'react'
import { subscribeToPush } from '../utils/push'
import api from '../api/axios'
import BrandLogo from './BrandLogo'
import { clearSession, getStoredUser, roleLabel, saveSession } from '../utils/auth'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/kvarovi', icon: AlertTriangle, label: 'Kvarovi' },
  { to: '/admin/oprema', icon: Wrench, label: 'Oprema' },
  { to: '/admin/radnici', icon: Users, label: 'Radnici', adminOnly: true },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [toast, setToast] = useState(null)
  const [user, setUser] = useState(() => getStoredUser())
  const lastSeenKvarId = useRef(null)
  const notifiedKvarIds = useRef(new Set())
  const ime = user.ime || user.username || 'Korisnik'
  const prezime = user.prezime || ''
  const rola = user.rola || ''
  const displayName = `${ime} ${prezime}`.trim()
  const initials = `${ime[0] || 'K'}${prezime[0] || ''}`.toUpperCase()
  const visibleNavItems = navItems.filter(item => !item.adminOnly || rola === 'admin')

  useEffect(() => {
    api.get('/auth/me')
      .then(({ data }) => setUser(saveSession({ ...data, access_token: localStorage.getItem('token') })))
      .catch(() => {
        clearSession()
        navigate('/login', { replace: true })
      })

    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setPushEnabled(!!sub)
        })
      })
    }
  }, [navigate])

  const showKvarNotification = useCallback((kvar, count) => {
    const kvarId = Number(kvar.id) || 0
    if (kvarId && notifiedKvarIds.current.has(kvarId)) return
    if (kvarId) notifiedKvarIds.current.add(kvarId)

    const oprema = kvar.oprema?.naziv || 'Oprema'
    const title = count > 1 ? `${count} nova kvara` : 'Novi kvar'
    const body = `${oprema}: ${kvar.naslov}`
    const url = `/admin/kvarovi/${kvar.id}`

    setToast({ title, body, url })
    window.setTimeout(() => setToast(current => current?.url === url ? null : current), 9000)

    if (document.visibilityState === 'visible') return
    if (!('Notification' in window) || Notification.permission !== 'granted') return

    try {
      const notification = new Notification(title, { body, tag: `kvar-${kvar.id}` })
      notification.onclick = () => {
        window.focus()
        navigate(url)
        notification.close()
      }
    } catch {
      // Browser moze odbiti foreground Notification; in-app toast je primarni signal.
    }
  }, [navigate])

  useEffect(() => {
    if (!['admin', 'voditelj'].includes(rola)) return
    if (!('EventSource' in window)) return

    const token = localStorage.getItem('token')
    if (!token) return

    const source = new EventSource(`/api/kvarovi/stream?token=${encodeURIComponent(token)}`)
    source.onmessage = event => {
      try {
        const data = JSON.parse(event.data)
        if (data.type !== 'new_kvar') return
        lastSeenKvarId.current = Math.max(lastSeenKvarId.current || 0, Number(data.id) || 0)
        showKvarNotification(data, 1)
      } catch {
        // Ako stream vrati ping ili neispravan payload, ignoriramo ga.
      }
    }

    return () => source.close()
  }, [rola, showKvarNotification])

  useEffect(() => {
    if (!['admin', 'voditelj'].includes(rola)) return

    let active = true
    let timer

    const checkNewKvarovi = async () => {
      try {
        const { data } = await api.get('/kvarovi')
        const kvarovi = Array.isArray(data) ? data : []
        const latestId = kvarovi.reduce((max, kvar) => Math.max(max, Number(kvar.id) || 0), 0)

        if (lastSeenKvarId.current === null) {
          lastSeenKvarId.current = latestId
          return
        }

        const novi = kvarovi
          .filter(kvar => {
            const id = Number(kvar.id) || 0
            const status = String(kvar.status || '').toLowerCase()
            return id > lastSeenKvarId.current && status === 'novo'
          })
          .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))

        if (novi.length > 0 && active) {
          const kvar = novi[0]
          lastSeenKvarId.current = latestId
          showKvarNotification(kvar, novi.length)
        } else {
          lastSeenKvarId.current = Math.max(lastSeenKvarId.current, latestId)
        }
      } catch {
        // Ako kratko padne mreza ili auth refresh, polling samo preskace taj krug.
      }
    }

    checkNewKvarovi()
    timer = window.setInterval(checkNewKvarovi, 15000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [rola, showKvarNotification])

  const togglePush = async () => {
    try {
      if (pushEnabled) {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
        setPushEnabled(false)
      } else {
        await subscribeToPush()
        setPushEnabled(true)
      }
    } catch (e) {
      alert('Greška s push notifikacijama: ' + e.message)
    }
  }

  const logout = () => {
    clearSession()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-blue-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden p-1">
            <BrandLogo />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Adix Paper</h1>
            <p className="text-blue-300 text-xs">{roleLabel(rola)} panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibleNavItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                isActive
                  ? 'bg-white text-blue-800 shadow-md'
                  : 'text-blue-100 hover:bg-blue-700 hover:text-white'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-blue-700 space-y-2">
        <button
          onClick={togglePush}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-colors text-sm ${
            pushEnabled
              ? 'bg-green-600 text-white'
              : 'text-blue-200 hover:text-white hover:bg-blue-700'
          }`}
        >
          <Bell size={16} />
          {pushEnabled ? 'Notifikacije: ON' : 'Uključi notifikacije'}
        </button>

        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-700">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-blue-300 text-xs">{roleLabel(rola)}</p>
          </div>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2 text-blue-200 hover:text-white hover:bg-blue-700 rounded-xl transition-colors">
          <LogOut size={18} />
          <span className="text-sm">Odjava</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden lg:flex w-64 bg-blue-800 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-blue-800 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-gray-100">
            <Menu size={20} />
          </button>
          <span className="font-semibold text-gray-800">Adix Paper</span>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {toast && (
        <div className="fixed right-4 top-4 z-[60] w-[min(360px,calc(100vw-2rem))] rounded-lg border border-blue-100 bg-white shadow-xl">
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <AlertTriangle size={18} />
            </div>
            <button
              onClick={() => {
                navigate(toast.url)
                setToast(null)
              }}
              className="min-w-0 flex-1 text-left"
            >
              <p className="font-semibold text-gray-900">{toast.title}</p>
              <p className="mt-1 text-sm text-gray-600">{toast.body}</p>
            </button>
            <button onClick={() => setToast(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
