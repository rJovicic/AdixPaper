const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')

const port = Number(process.env.PORT || 3000)
const distDir = path.join(__dirname, 'dist')
const apiUrl = process.env.VITE_API_URL || process.env.BACKEND_URL || ''

function getBackendTarget(reqUrl) {
  if (!apiUrl) return null

  const parsed = new URL(apiUrl)
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

function proxyApi(req, res) {
  const target = getBackendTarget(req.url)
  if (!target) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ detail: 'VITE_API_URL nije postavljen na frontend servisu.' }))
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
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ detail: `Backend API nije dostupan: ${error.message}` }))
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
      res.writeHead(200, { 'content-type': contentType(finalPath) })
    })
    .pipe(res)
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
  if (req.url.startsWith('/api/')) {
    proxyApi(req, res)
    return
  }

  serveStatic(req, res)
}).listen(port, '0.0.0.0', () => {
  console.log(`Frontend running on port ${port}`)
  console.log(apiUrl ? `Proxying /api to ${apiUrl}` : 'VITE_API_URL/BACKEND_URL is not set')
})
