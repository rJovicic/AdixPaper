import { api } from '../api/client'

const MAX_EDGE = 1600

/**
 * A phone photo is 3–8 MB; the server keeps at most 1600 px anyway. Shrinking before upload saves
 * mobile data and time on the floor. Falls back to the original file wherever the browser cannot
 * decode it (the server still validates and re-encodes).
 */
export async function shrinkPhoto(file) {
  try {
    if (typeof createImageBitmap !== 'function') return file
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export async function uploadPhoto(faultId, file) {
  const body = new FormData()
  body.append('datoteka', await shrinkPhoto(file))
  const { data } = await api.post(`/kvarovi/${faultId}/prilozi`, body, { timeout: 60000 })
  return data
}
