import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { I18nProvider } from './i18n'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { homeForRole } from './auth/session'
import { ToastProvider } from './components/ui/Toast'
import RequireRole from './components/RequireRole'
import WorkerShell from './components/WorkerShell'
import UpdateBanner from './components/UpdateBanner'
import { LoadingRows } from './components/ui/States'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import MachineLink from './pages/MachineLink'
import MyFaults from './pages/worker/MyFaults'
import ReportFault from './pages/worker/ReportFault'
import WorkerFault from './pages/worker/WorkerFault'

// Lead/admin screens (and the chart library) load only for leads, keeping the worker's phone bundle small.
// After a deploy an old tab may request page files that no longer exist; reload once to get the new version.
const lazyPage = (load) => lazy(() => load().then(
  (module) => {
    sessionStorage.removeItem('adix.reloaded')
    return module
  },
  (error) => {
    if (sessionStorage.getItem('adix.reloaded')) throw error
    sessionStorage.setItem('adix.reloaded', '1')
    window.location.reload()
    return new Promise(() => {})
  },
))
const AdminShell = lazyPage(() => import('./components/AdminShell'))
const Dashboard = lazyPage(() => import('./pages/admin/Dashboard'))
const Faults = lazyPage(() => import('./pages/admin/Faults'))
const Analytics = lazyPage(() => import('./pages/admin/Analytics'))
const FaultDetail = lazyPage(() => import('./pages/admin/FaultDetail'))
const Machines = lazyPage(() => import('./pages/admin/Machines'))
const SpareParts = lazyPage(() => import('./pages/admin/SpareParts'))
const Users = lazyPage(() => import('./pages/admin/Users'))

const pageFallback = <div className="surface mx-auto mt-8 max-w-3xl"><LoadingRows rows={4} /></div>

function Home() {
  const { user } = useAuth()
  return <Navigate to={user ? homeForRole(user.rola) : '/login'} replace />
}

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={pageFallback}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/m/:id" element={<RequireRole><MachineLink /></RequireRole>} />
              <Route path="/radnik" element={<RequireRole roles={['radnik']}><WorkerShell /></RequireRole>}>
                <Route index element={<MyFaults />} />
                <Route path="prijava" element={<ReportFault />} />
                <Route path="kvar/:id" element={<WorkerFault />} />
              </Route>
              <Route path="/admin" element={<RequireRole roles={['admin', 'voditelj']}><AdminShell /></RequireRole>}>
                <Route index element={<Dashboard />} />
                <Route path="kvarovi" element={<Faults />} />
                <Route path="kvarovi/:id" element={<FaultDetail />} />
                <Route path="oprema" element={<Machines />} />
                <Route path="rezervni-dijelovi" element={<SpareParts />} />
                <Route path="analize" element={<Analytics />} />
                <Route path="korisnici" element={<RequireRole roles={['admin']}><Users /></RequireRole>} />
                <Route path="radnici" element={<Navigate to="/admin/korisnici" replace />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
            <UpdateBanner />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </I18nProvider>
  )
}
