import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { homeForRole } from '../auth/session'

export default function RequireRole({ roles, children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.rola)) return <Navigate to={homeForRole(user.rola)} replace />
  return children
}
