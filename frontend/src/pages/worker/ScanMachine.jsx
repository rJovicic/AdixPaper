import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CameraOff, ListChecks, X } from 'lucide-react'
import { useI18n } from '../../i18n'
import { useAuth } from '../../auth/AuthProvider'
import { createQrReader, labelPath, scanSupported } from '../../lib/qr'

const SCAN_EVERY_MS = 200

/**
 * Full-screen camera view that reads a machine's QR label inside the app. Workers land on the
 * report form with that machine chosen, leads on its faults (both via /m/:id).
 */
export default function ScanMachine() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const home = user?.rola === 'radnik' ? '/radnik' : '/admin'
  const manual = user?.rola === 'radnik' ? '/radnik/prijava' : '/admin/oprema'
  const video = useRef(null)
  const [problem, setProblem] = useState(scanSupported() ? '' : 'unsupported')
  const [starting, setStarting] = useState(true)
  const [foreign, setForeign] = useState(false)

  useEffect(() => {
    document.title = `${t('scan.title')} · ${t('app.name')}`
  }, [t])

  useEffect(() => {
    if (!scanSupported()) return undefined
    let stream = null
    let timer = null
    let stopped = false
    let busy = false

    const start = async () => {
      try {
        const [media, read] = await Promise.all([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
          createQrReader(),
        ])
        stream = media
        if (stopped || !video.current) {
          media.getTracks().forEach((track) => track.stop())
          return
        }
        video.current.srcObject = media
        await video.current.play().catch(() => {})
        setStarting(false)
        timer = window.setInterval(async () => {
          if (busy || stopped || !video.current || video.current.readyState < 2) return
          busy = true
          try {
            const text = await read(video.current)
            if (!text) return
            const path = labelPath(text)
            if (path) {
              stopped = true
              window.clearInterval(timer)
              navigator.vibrate?.(40)
              navigate(path, { replace: true })
            } else {
              setForeign(true)
            }
          } catch {
            // A frame that cannot be decoded; try the next one.
          } finally {
            busy = false
          }
        }, SCAN_EVERY_MS)
      } catch (error) {
        setStarting(false)
        setProblem(error?.name === 'NotAllowedError' ? 'denied' : 'camera')
      }
    }
    start()
    return () => {
      stopped = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [navigate])

  return (
    <div className="fixed inset-0 z-[65] flex flex-col bg-ink text-stock">
      <div className="flex items-center gap-2 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link to={home} className="btn-icon text-stock hover:bg-white/10 hover:text-stock" aria-label={t('common.close')}>
          <X size={22} aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-semibold">{t('scan.title')}</h1>
      </div>

      <div className="relative mx-4 flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
        {problem ? (
          <div role="alert" className="max-w-xs px-6 py-10 text-center">
            <CameraOff size={32} aria-hidden="true" className="mx-auto mb-3 text-brand-on-deep" />
            <p className="font-semibold">{t(`scan.${problem}Title`)}</p>
            <p className="mt-1 text-sm text-brand-on-deep">{t(`scan.${problem}Body`)}</p>
          </div>
        ) : (
          <>
            <video ref={video} muted playsInline autoPlay aria-label={t('scan.camera')} className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden="true" className="relative aspect-square w-[min(68vw,18rem)] rounded-lg border-[3px] border-stock/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />
          </>
        )}
      </div>

      <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {!problem && (
          <p role="status" className="text-center text-sm text-brand-on-deep">
            {starting ? t('scan.starting') : foreign ? t('scan.foreign') : t('scan.hint')}
          </p>
        )}
        <Link to={manual} className="btn-lg flex w-full items-center justify-center gap-2 rounded bg-white/10 font-semibold text-stock hover:bg-white/15">
          <ListChecks size={19} aria-hidden="true" /> {user?.rola === 'radnik' ? t('scan.manual') : t('scan.manualLead')}
        </Link>
      </div>
    </div>
  )
}
