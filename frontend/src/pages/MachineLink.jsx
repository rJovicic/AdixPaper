import { Navigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'

/**
 * Target of a machine's QR label (/m/:id). Workers land on the report form with the
 * machine chosen; leads and admins on that machine's faults.
 */
export default function MachineLink() {
  const { id } = useParams()
  const { user } = useAuth()
  const machineId = /^\d+$/.test(id || '') ? id : ''
  if (user?.rola === 'radnik') return <Navigate to={machineId ? `/radnik/prijava?oprema=${machineId}` : '/radnik'} replace />
  return <Navigate to={machineId ? `/admin/kvarovi?oprema=${machineId}` : '/admin'} replace />
}
