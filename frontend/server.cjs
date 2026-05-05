const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const port = Number(process.env.PORT || 3000)
const distDir = path.join(__dirname, 'dist')
const apiUrl = process.env.BACKEND_URL || process.env.VITE_API_URL || ''
const buildCommit = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'local'

function getBackendTarget(reqUrl) {
  if (!apiUrl) return null

  const parsed = new URL(apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`)
  const basePath = parsed.pathname.replace(/\/$/, '')
  const requestPath = reqUrl.startsWith('/api') ? reqUrl.slice('/api'.length) || '/' : reqUrl
  const targetPath = `${basePath || '/api'}${requestPath}`.replace(/\/{2,}/g, '/')

  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: `${targetPath}${parsed.search || ''}`,
    origin: parsed.origin,
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function health(res) {
  sendJson(res, 200, { status: 'ok' })
}

function version(res) {
  sendJson(res, 200, {
    status: 'ok',
    commit: buildCommit,
    startedAt: new Date().toISOString(),
  })
}

function debugBackend(res) {
  let target
  try {
    target = getBackendTarget('/api/auth/login')
  } catch (error) {
    sendJson(res, 500, {
      configured: Boolean(apiUrl),
      apiUrl,
      error: `Neispravan BACKEND_URL/VITE_API_URL: ${error.message}`,
    })
    return
  }

  if (!target) {
    sendJson(res, 500, {
      configured: false,
      error: 'BACKEND_URL ili VITE_API_URL nije postavljen na frontend servisu.',
    })
    return
  }

  const parsed = new URL(target.origin)
  const client = parsed.protocol === 'https:' ? https : http
  const started = Date.now()
  const req = client.request(
    {
      method: 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: '/health',
      headers: { host: parsed.host },
      timeout: 8000,
    },
    (backendRes) => {
      let body = ''
      backendRes.on('data', chunk => { body += chunk.toString() })
      backendRes.on('end', () => {
        sendJson(res, 200, {
          configured: true,
          apiUrl,
          loginTarget: `${target.origin}${target.path}`,
          healthUrl: `${target.origin}/health`,
          healthStatus: backendRes.statusCode,
          elapsedMs: Date.now() - started,
          body: body.slice(0, 500),
        })
      })
    }
  )

  req.on('timeout', () => req.destroy(new Error('timeout')))
  req.on('error', (error) => {
    sendJson(res, 502, {
      configured: true,
      apiUrl,
      loginTarget: `${target.origin}${target.path}`,
      healthUrl: `${target.origin}/health`,
      error: error.message,
      elapsedMs: Date.now() - started,
    })
  })
  req.end()
}

function proxyApi(req, res) {
  let target
  try {
    target = getBackendTarget(req.url)
  } catch (error) {
    sendJson(res, 500, { detail: `Neispravan BACKEND_URL/VITE_API_URL: ${error.message}` })
    return
  }

  if (!target) {
    sendJson(res, 500, { detail: 'BACKEND_URL ili VITE_API_URL nije postavljen na frontend servisu.' })
    return
  }

  const client = target.protocol === 'https:' ? https : http
  const headers = { ...req.headers, host: new URL(target.origin).host }

  const proxyReq = client.request(
    {
      method: req.method,
      hostname: target.hostname,
      port: target.port,
      path: target.path,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )

  proxyReq.on('error', (error) => {
    sendJson(res, 502, { detail: `Backend API nije dostupan: ${error.message}` })
  })

  req.pipe(proxyReq)
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const requested = urlPath === '/' ? '/index.html' : urlPath
  const filePath = path.normalize(path.join(distDir, requested))
  const safePath = filePath.startsWith(distDir) ? filePath : path.join(distDir, 'index.html')
  const finalPath = fs.existsSync(safePath) && fs.statSync(safePath).isFile()
    ? safePath
    : path.join(distDir, 'index.html')

  fs.createReadStream(finalPath)
    .on('error', () => {
      res.writeHead(404)
      res.end('Not found')
    })
    .on('open', () => {
      res.writeHead(200, {
        'content-type': contentType(finalPath),
        'cache-control': cacheControl(finalPath),
      })
    })
    .pipe(res)
}

function cacheControl(filePath) {
  const ext = path.extname(filePath)
  if (ext === '.html' || path.basename(filePath) === 'sw.js' || path.basename(filePath) === 'manifest.json') {
    return 'no-store, max-age=0'
  }
  return 'public, max-age=31536000, immutable'
}

function contentType(filePath) {
  const ext = path.extname(filePath)
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
  }[ext] || 'application/octet-stream'
}

http.createServer((req, res) => {
  if (req.url === '/health') {
    health(res)
    return
  }

  if (req.url === '/__debug/version') {
    version(res)
    return
  }

  if (req.url === '/__debug/backend') {
    debugBackend(res)
    return
  }

  if (req.url.startsWith('/api/')) {
    proxyApi(req, res)
    return
  }

  serveStatic(req, res)
}).listen(port, '0.0.0.0', () => {
  console.log(`Frontend running on port ${port}`)
  console.log(apiUrl ? `Proxying /api to ${apiUrl}` : 'VITE_API_URL/BACKEND_URL is not set')
})
