import axios from 'axios'
import { readSession } from '../auth/session'

export const api = axios.create({ baseURL: '/api', timeout: 20000 })

let unauthorizedHandler = null

/** Registered by AuthProvider: called when an authenticated request comes back 401. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler
}

/** For requests made outside axios (the live stream): end the session like a 401 would. */
export function reportUnauthorized() {
  if (unauthorizedHandler) unauthorizedHandler()
}

api.interceptors.request.use((config) => {
  const token = readSession()?.token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login')
    if (error.response?.status === 401 && !isLogin && unauthorizedHandler) unauthorizedHandler()
    return Promise.reject(error)
  },
)

export function errorKind(error) {
  if (!error?.response) return 'network'
  const status = error.response.status
  if (status === 401) return 'session'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'notFound'
  if (status === 422) return 'validation'
  if (status >= 500) return 'server'
  return 'client'
}

/** A message a person can act on, in the current language. */
export function errorMessage(error, i18n) {
  const kind = errorKind(error)
  const detail = error?.response?.data?.detail
  if (kind === 'network') return i18n.t('errors.network')
  if (kind === 'server') return i18n.t('errors.server')
  if (kind === 'validation' && Array.isArray(detail)) return i18n.t('errors.validation')
  if (typeof detail === 'string' && detail && detail !== 'Not Found') return i18n.backend(detail)
  if (kind === 'session') return i18n.t('errors.session')
  if (kind === 'forbidden') return i18n.t('errors.forbidden')
  if (kind === 'notFound') return i18n.t('errors.notFound')
  return i18n.t('errors.server')
}

/** Maps a FastAPI 422 response to { fieldName: message } for inline display. */
export function fieldErrors(error, i18n) {
  const detail = error?.response?.data?.detail
  if (error?.response?.status !== 422 || !Array.isArray(detail)) return {}
  const result = {}
  for (const item of detail) {
    const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null
    if (!field || result[field]) continue
    const type = item.type || ''
    const max = item.ctx?.max_length
    if (type === 'missing' || type.includes('too_short') || type === 'string_type') result[field] = i18n.t('errors.required')
    else if (type.includes('too_long') && max) result[field] = i18n.t('errors.tooLong', { n: max })
    else if (type.includes('greater_than')) result[field] = i18n.t('errors.positive')
    else result[field] = i18n.t('errors.validation')
  }
  return result
}

const isIOS = () => typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))

/**
 * Saves a binary API response as a file. On iPhone/iPad it goes through the share sheet (Print,
 * Save to Files, AirDrop): a download link there replaces the app with a viewer and, in the
 * installed app, leaves a blank page behind. Resolves 'shared' | 'cancelled' | 'downloaded'.
 * When iOS refuses to share because the tap is too long ago (a slow download), it rejects with
 * { code: 'needs-tap', file } so the caller can offer one more tap (see useFileExport).
 */
export async function downloadFile(path, filename) {
  const response = await api.get(path, { responseType: 'blob', timeout: 60000 })
  if (isIOS() && typeof File !== 'undefined') {
    const file = new File([response.data], filename, { type: response.data.type || 'application/octet-stream' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return 'shared'
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled'
        if (error?.name === 'NotAllowedError') throw Object.assign(new Error('needs-tap'), { code: 'needs-tap', file })
        // Anything else: fall back to the plain download below.
      }
    }
  }
  const href = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
  return 'downloaded'
}
