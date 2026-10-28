import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowLeft, CameraOff, ListChecks } from 'lucide-react'
import { useI18n } from '../../i18n'
import { machineIdFromCode, scanSupported } from '../../lib/qr'

const SCAN_EVERY_MS = 250

/** Camera view that reads a machine's QR label and opens the report form with that machine chosen. */
export default function ScanMachine() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const video = useRef(null)
  const [problem, setProblem] = useState(scanSupported() ? '' : 'unsupported')
  const [foreign, setForeign] = useState(false)

  useEffect(() => {
    document.title = `${t('scan.title')} · ${t('app.name')}`
  }, [t])

  useEffect(() => {
    if (!scanSupported()) return undefined
    let stream = null
    let timer = null
    let stopped = false
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(async (media) => {
        stream = media
        if (stopped || !video.current) return
        video.current.srcObject = media
        await video.current.play().catch(() => {})
        timer = window.setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return
          try {
            const codes = await detector.detect(video.current)
            if (!codes.length) return
            const id = machineIdFromCode(codes[0].rawValue)
            if (id) {
              stopped = true
              window.clearInterval(timer)
              navigate(`/radnik/prijava?oprema=${id}`, { replace: true })
            } else {
              setForeign(true)
            }
          } catch {
            // A frame that cannot be decoded; try the next one.
          }
        }, SCAN_EVERY_MS)
      })
      .catch((error) => setProblem(error?.name === 'NotAllowedError' ? 'denied' : 'camera'))
    return () => {
      stopped = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [navigate])

  return (
    <div className="-mx-4 -mt-5 flex min-h-[calc(100dvh-3.5rem)] flex-col bg-ink text-stock">
      <div className="flex items-center gap-2 px-2 py-2">
        <Link to="/radnik" className="btn-icon text-stock hover:bg-white/10 hover:text-stock" aria-label={t('fault.backToMine')}>
          <ArrowLeft size={20} aria-hidden="true" />
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
            <video ref={video} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden="true" className="relative aspect-square w-[min(68vw,18rem)] rounded-lg border-[3px] border-stock/90 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]" />
          </>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        {!problem && (
          <p role="status" className="text-center text-sm text-brand-on-deep">
            {foreign ? t('scan.foreign') : t('scan.hint')}
          </p>
        )}
        <Link to="/radnik/prijava" className="btn-lg flex w-full items-center justify-center gap-2 rounded bg-white/10 font-semibold text-stock hover:bg-white/15">
          <ListChecks size={19} aria-hidden="true" /> {t('scan.manual')}
        </Link>
      </div>
    </div>
  )
}
