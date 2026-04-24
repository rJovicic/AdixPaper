import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminLayout from './components/AdminLayout'
import Dashboard from './pages/Dashboard'
import Kvarovi from './pages/Kvarovi'
import KvarDetalji from './pages/KvarDetalji'
import Oprema from './pages/Oprema'
import Radnici from './pages/Radnici'
import RadnikView from './pages/RadnikView'

function ProtectedRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem('token')
  const rola = localStorage.getItem('rola')
  if (!token) return <Navigate to="/login" replace />
  if (adminOnly && rola === 'radnik') return <Navigate to="/radnik" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly>
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="kvarovi" element={<Kvarovi />} />
          <Route path="kvarovi/:id" element={<KvarDetalji />} />
          <Route path="oprema" element={<Oprema />} />
          <Route path="radnici" element={<Radnici />} />
        </Route>
        <Route path="/radnik" element={
          <ProtectedRoute>
            <RadnikView />
          </ProtectedRoute>
        } />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
