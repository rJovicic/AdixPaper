// In-app QR scanning, only where the browser can decode QR codes itself (BarcodeDetector:
// Android Chrome, ChromeOS, macOS). iOS Safari has none; there the phone's camera app opens the label.
export function scanSupported() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia)
}

/**
 * The machine id in a scanned label, or null. Labels encode `<origin>/m/<id>`; the origin may be
 * PUBLIC_URL rather than this page's, so only the path is trusted and nothing outside the app is opened.
 */
export function machineIdFromCode(text) {
  try {
    const url = new URL(String(text).trim(), window.location.origin)
    const match = /^\/m\/(\d{1,9})\/?$/.exec(url.pathname)
    return match ? match[1] : null
  } catch {
    return null
  }
}
