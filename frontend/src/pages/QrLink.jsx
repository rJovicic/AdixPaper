import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { api, errorKind } from '../api/client'
import { useAuth } from '../auth/AuthProvider'
import { homeForRole } from '../auth/session'
import { useI18n } from '../i18n'
import { LoadingRows, ErrorState } from '../components/ui/States'

const TOKEN = /^[A-Za-z0-9_-]{8,32}$/

/** Where a resolved label takes this person: workers straight to the report, leads to the record. */
function destination(target, rola) {
  const machine = target.oprema
  const component = target.komponenta
  if (rola !== 'radnik') return component ? `/admin/oprema/${machine.id}/komponente/${component.id}` : `/admin/oprema/${machine.id}`
  return component ? `/radnik/prijava?oprema=${machine.id}&komponenta=${component.id}` : `/radnik/prijava?oprema=${machine.id}`
}

function Notice({ title, body, children }) {
  return (
    <div className="mx-auto mt-10 max-w-md px-4">
      <div role="alert" className="surface px-5 py-6 text-center">
        <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warn-wash text-warn"><AlertTriangle size={22} /></span>
        <h1 className="mt-3 text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-1 text-ink-2">{body}</p>
        <div className="mt-5 grid gap-2">{children}</div>
      </div>
    </div>
  )
}

/**
 * Target of a machine's or component's QR label (/q/:oznaka). The identifier is looked up on the
 * server; the app only ever navigates to its own paths built from the ids that come back.
 */
export default function QrLink() {
  const { oznaka } = useParams()
  const { user } = useAuth()
  const { t } = useI18n()
  const valid = TOKEN.test(oznaka || '')
  const [state, setState] = useState({ loading: valid, target: null, error: null })

  useEffect(() => {
    if (!valid) return undefined
    let current = true
    api.get(`/qr/${oznaka}`)
      .then((response) => current && setState({ loading: false, target: response.data, error: null }))
      .catch((error) => current && setState({ loading: false, target: null, error }))
    return () => { current = false }
  }, [oznaka, valid])

  const home = homeForRole(user?.rola)
  const manual = user?.rola === 'radnik' ? '/radnik/prijava' : '/admin/oprema'
  const unknown = !valid || errorKind(state.error) === 'notFound'

  if (state.loading) return <div className="surface mx-auto mt-10 max-w-md"><LoadingRows rows={3} /></div>
  if (unknown) {
    return (
      <Notice title={t('qr.unknownTitle')} body={t('qr.unknownBody')}>
        <Link to={manual} className="btn-primary btn-lg w-full">{user?.rola === 'radnik' ? t('qr.chooseManually') : t('qr.toMachines')}</Link>
        <Link to={home} className="btn-secondary w-full">{t('notFound.home')}</Link>
      </Notice>
    )
  }
  if (state.error) return <div className="surface mx-auto mt-10 max-w-md"><ErrorState error={state.error} onRetry={() => window.location.reload()} /></div>

  const { target } = state
  if (user?.rola === 'radnik') {
    // Out of use: say so instead of starting a report the server would refuse.
    if (!target.oprema.aktivna) {
      return (
        <Notice title={t('qr.machineInactiveTitle', { name: target.oprema.naziv })} body={t('qr.machineInactiveBody')}>
          <Link to={home} className="btn-secondary w-full">{t('notFound.home')}</Link>
        </Notice>
      )
    }
    if (target.komponenta && !target.komponenta.aktivna) {
      return (
        <Notice title={t('qr.componentInactiveTitle', { name: target.komponenta.naziv })} body={t('qr.componentInactiveBody', { machine: target.oprema.naziv })}>
          <Link to={`/radnik/prijava?oprema=${target.oprema.id}`} className="btn-primary btn-lg w-full">{t('qr.reportOnMachine', { machine: target.oprema.naziv })}</Link>
          <Link to={home} className="btn-secondary w-full">{t('notFound.home')}</Link>
        </Notice>
      )
    }
  }
  return <Navigate to={destination(target, user?.rola)} replace />
}
