import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/Dashboard'
import Kvarovi from './pages/Kvarovi'
import KvarDetalji from './pages/KvarDetalji'
import Oprema from './pages/Oprema'
import Radnici from './pages/Radnici'
import RadnikView from './pages/RadnikView'
import api from './api/axios'
import { clearSession, getStoredUser, hasRole, homeForRole, saveSession } from './utils/auth'

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token')
  const [status, setStatus] = useState(token ? 'checking' : 'logged-out')
  const [user, setUser] = useState(() => getStoredUser())

  useEffect(() => {
    let active = true
    if (!token) {
      setStatus('logged-out')
      return
    }

    const stored = getStoredUser()
    if (stored.rola) {
      setUser(stored)
      setStatus('ready')
      return
    }

    api.get('/auth/me')
      .then(({ data }) => {
        if (!active) return
        const syncedUser = saveSession({ ...data, access_token: token })
        setUser(syncedUser)
        setStatus('ready')
      })
      .catch(() => {
        if (!active) return
        clearSession()
        setStatus('logged-out')
      })

    return () => { active = false }
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  if (status === 'checking') return <div className="min-h-screen grid place-items-center text-gray-400">Provjera prijave...</div>
  if (status === 'logged-out') return <Navigate to="/login" replace />
  if (!hasRole(user, allowedRoles)) return <Navigate to={homeForRole(user.rola)} replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin', 'voditelj']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="kvarovi" element={<Kvarovi />} />
          <Route path="kvarovi/:id" element={<KvarDetalji />} />
          <Route path="oprema" element={<Oprema />} />
          <Route path="radnici" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <Radnici />
            </ProtectedRoute>
          } />
        </Route>
        <Route path="/radnik" element={
          <ProtectedRoute allowedRoles={['radnik']}>
            <RadnikView />
          </ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
