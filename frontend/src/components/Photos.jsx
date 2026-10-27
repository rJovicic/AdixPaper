import { useEffect, useRef, useState } from 'react'
import { Camera, ImageOff, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../api/client'
import { asArray, useAsync } from '../lib/useAsync'
import { uploadPhoto } from '../lib/photo'
import { useI18n } from '../i18n'
import { useToast } from './ui/Toast'
import Dialog from './ui/Dialog'
import ConfirmDialog from './ui/ConfirmDialog'

export const MAX_PHOTOS = 6

/** Photos need the session token, so they are fetched as blobs rather than linked by URL. */
function usePhotoUrl(faultId, photoId) {
  const [state, setState] = useState({ url: null, failed: false })
  useEffect(() => {
    let url = null
    let cancelled = false
    api.get(`/kvarovi/${faultId}/prilozi/${photoId}`, { responseType: 'blob', timeout: 30000 })
      .then((response) => {
        url = URL.createObjectURL(response.data)
        if (!cancelled) setState({ url, failed: false })
      })
      .catch(() => !cancelled && setState({ url: null, failed: true }))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [faultId, photoId])
  return state
}

function Thumb({ faultId, photo, onOpen }) {
  const { t } = useI18n()
  const { url, failed } = usePhotoUrl(faultId, photo.id)
  return (
    <button
      type="button"
      onClick={() => url && onOpen({ ...photo, url })}
      className="group relative aspect-[4/3] w-full overflow-hidden rounded border border-rule bg-ground"
      aria-label={t('photos.open', { name: photo.naziv })}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
      ) : failed ? (
        <span className="flex h-full items-center justify-center text-ink-3"><ImageOff size={20} aria-hidden="true" /></span>
      ) : (
        <span className="block h-full animate-pulse bg-ground motion-reduce:animate-none" aria-hidden="true" />
      )}
    </button>
  )
}

/**
 * The fault's photos with "add" for people allowed to attach (reporter, leads).
 * `canDelete(photo)` decides per photo; the server enforces the same rule.
 */
export default function Photos({ faultId, canAdd = false, canDelete = () => false, onChanged, className = '' }) {
  const i18n = useI18n()
  const { t } = i18n
  const toast = useToast()
  const input = useRef(null)
  const photos = useAsync(() => api.get(`/kvarovi/${faultId}/prilozi`).then((response) => asArray(response.data)), [faultId])
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const list = photos.data || []
  const full = list.length >= MAX_PHOTOS

  const add = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadPhoto(faultId, file)
      await photos.reload()
      onChanged?.()
      toast.success(t('photos.added'))
    } catch (error) {
      toast.error(`${t('photos.failed')} ${errorMessage(error, i18n)}`)
    } finally {
      setUploading(false)
    }
  }

  const remove = async () => {
    try {
      await api.delete(`/kvarovi/${faultId}/prilozi/${removing.id}`)
      setViewing(null)
      await photos.reload()
      onChanged?.()
      toast.success(t('photos.removed'))
    } catch (error) {
      toast.error(errorMessage(error, i18n))
      throw error
    }
  }

  if (!canAdd && list.length === 0) return null

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="field-label">{t('photos.title')}{list.length > 0 && <span className="tabular text-ink-3"> · {list.length}</span>}</h2>
        {canAdd && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={add} />
            <button type="button" className="btn-secondary btn-sm" disabled={uploading || full} onClick={() => input.current?.click()}>
              <Camera size={16} aria-hidden="true" />
              {uploading ? t('photos.uploading') : t('photos.add')}
            </button>
          </>
        )}
      </div>
      {photos.error ? (
        <p className="mt-2 text-sm text-ink-2">{errorMessage(photos.error, i18n)}</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">{t('photos.empty')}</p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {list.map((photo) => <li key={photo.id}><Thumb faultId={faultId} photo={photo} onOpen={setViewing} /></li>)}
        </ul>
      )}
      {full && canAdd && <p className="mt-2 text-meta text-ink-3">{t('photos.limit', { n: MAX_PHOTOS })}</p>}

      {viewing && (
        <Dialog
          title={viewing.naziv}
          description={viewing.korisnik ? `${viewing.korisnik.ime} ${viewing.korisnik.prezime} · ${i18n.format.dateTime(viewing.kreiran)}` : i18n.format.dateTime(viewing.kreiran)}
          size="lg"
          onClose={() => setViewing(null)}
          footer={canDelete(viewing) ? (
            <button type="button" className="btn-secondary text-urgent" onClick={() => setRemoving(viewing)}>
              <Trash2 size={16} aria-hidden="true" /> {t('photos.remove')}
            </button>
          ) : undefined}
        >
          <img src={viewing.url} alt={t('photos.alt', { name: viewing.naziv })} className="mx-auto max-h-[70dvh] w-auto rounded" />
        </Dialog>
      )}
      {removing && (
        <ConfirmDialog
          title={t('photos.removeTitle')}
          body={t('photos.removeBody')}
          confirmLabel={t('photos.remove')}
          onConfirm={remove}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  )
}
