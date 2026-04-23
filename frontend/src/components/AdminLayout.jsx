import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Wrench, ClipboardList, Users, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/oprema', icon: Wrench, label: 'Oprema' },
  { to: '/admin/odrzavanje', icon: ClipboardList, label: 'Održavanje' },
  { to: '/admin/radnici', icon: Users, label: 'Radnici' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const ime = localStorage.getItem('ime') || ''
  const prezime = localStorage.getItem('prezime') || ''

  const logout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-blue-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <span className="text-blue-800 font-black text-sm">AP</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Adix Paper</h1>
            <p className="text-blue-300 text-xs">Admin panel</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label, end }) => (
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

      <div className="p-4 border-t border-blue-700">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-700 mb-2">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
            {ime[0]}{prezime[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{ime} {prezime}</p>
            <p className="text-blue-300 text-xs">Administrator</p>
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
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-blue-800 flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-blue-800 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
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
    </div>
  )
}
