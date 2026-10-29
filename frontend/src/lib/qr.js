// In-app QR scanning: wherever the browser offers a camera. The browser's own decoder
// (BarcodeDetector: Android Chrome, ChromeOS, macOS) is used where it reads QR codes; elsewhere,
// iPhone above all, a small JavaScript decoder (jsQR) loads the first time the scanner opens.
// Scanning inside the app keeps people in the installed app: iOS always opens a QR link from the
// camera app in Safari, never in a home-screen app.
export function scanSupported() {
  return typeof window !== 'undefined' && window.isSecureContext !== false && Boolean(navigator.mediaDevices?.getUserMedia)
}

const MAX_SCAN_WIDTH = 640 // decoding a full camera frame is slow on phones; QR labels survive downscaling

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.()
    if (formats && !formats.includes('qr_code')) return null
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  } catch {
    return null
  }
}

async function scriptDetector() {
  const { default: jsQR } = await import('jsqr')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    const scale = Math.min(1, MAX_SCAN_WIDTH / (video.videoWidth || MAX_SCAN_WIDTH))
    const width = Math.max(1, Math.round(video.videoWidth * scale))
    const height = Math.max(1, Math.round(video.videoHeight * scale))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    context.drawImage(video, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null
  }
}

/** A function that reads one video frame and returns the QR text in it, or null. */
export async function createQrReader() {
  return (await nativeDetector()) || scriptDetector()
}

/**
 * The in-app path a scanned label points at, or null for anything that is not one of ours.
 * Current labels encode `<origin>/q/<identifier>` (a machine or a component); older machine labels
 * `<origin>/m/<id>`. The origin may be PUBLIC_URL rather than this page's, so only the path is
 * trusted, rebuilt from the matched parts, and nothing outside the app is ever opened.
 */
export function labelPath(text) {
  try {
    const url = new URL(String(text).trim(), window.location.origin)
    const token = /^\/q\/([A-Za-z0-9_-]{8,32})\/?$/.exec(url.pathname)
    if (token) return `/q/${token[1]}`
    const id = /^\/m\/(\d{1,9})\/?$/.exec(url.pathname)
    return id ? `/m/${id[1]}` : null
  } catch {
    return null
  }
}
