import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function devApiPlugin(env) {
  return {
    name: 'dev-api',
    configureServer(server) {

      // ── Proxy all /api/* routes to the Netlify function handlers ──────────────
      // Uses Vite's ssrLoadModule so any function in /api/*.js works automatically
      // in dev without extra config — add a new function, it just works.
      server.middlewares.use('/api/', async (req, res) => {
        const url   = new URL(req.url, 'http://localhost')
        // req.url is relative to the /api/ mount point, so pathname is e.g. "/country-risk"
        const name  = url.pathname.replace(/^\/+/, '')   // "country-risk"

        // Skip routes handled by the inline flight-status middleware below
        if (name === 'flight-status') return

        try {
          // Inject all .env vars into process.env for the function
          Object.assign(process.env, env)

          const mod     = await server.ssrLoadModule(`/api/${name}.js`)
          const handler = mod.default
          if (typeof handler !== 'function') throw new Error(`No default export in ${route}.js`)

          const query   = Object.fromEntries(url.searchParams)
          const shimReq = { ...req, query, url: req.url }
          const shimRes = {
            statusCode: 200,
            _headers: { 'Content-Type': 'application/json' },
            status(code)    { this.statusCode = code; return this },
            setHeader(k, v) { this._headers[k] = v; return this },
            json(data) {
              res.statusCode = this.statusCode
              Object.entries(this._headers).forEach(([k, v]) => res.setHeader(k, v))
              res.end(JSON.stringify(data))
            },
            send(data) { this.json(data) },
          }

          await handler(shimReq, shimRes)
        } catch (e) {
          console.error(`[dev-api] ${route} error:`, e.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e.message }))
        }
      })

      // ── Flight status (kept inline for mock fallback support) ─────────────────
      server.middlewares.use('/api/flight-status', async (req, res) => {
        const qs = new URLSearchParams(req.url.split('?')[1] ?? '')
        const flight = qs.get('flight')
        res.setHeader('Content-Type', 'application/json')
        if (!flight) { res.statusCode = 400; res.end(JSON.stringify({ error: 'flight required' })); return }

        if (apiKey) {
          try {
            const r = await fetch(
              `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flight)}`,
              { headers: { 'x-apikey': apiKey } }
            )
            if (!r.ok) { res.statusCode = r.status; res.end(JSON.stringify({ error: `FlightAware error ${r.status}` })); return }
            const data = await r.json()
            const f = data.flights?.[0]
            if (!f) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Flight not found' })); return }
            res.end(JSON.stringify({
              ident: f.ident, status: f.status,
              origin: f.origin?.name, destination: f.destination?.name,
              scheduledDeparture: f.scheduled_out, estimatedDeparture: f.estimated_out,
              actualDeparture: f.actual_out, scheduledArrival: f.scheduled_in,
              estimatedArrival: f.estimated_in, actualArrival: f.actual_in,
              departureDelay: f.departure_delay, arrivalDelay: f.arrival_delay,
              cancelled: f.cancelled, diverted: f.diverted, aircraftType: f.aircraft_type,
            }))
          } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: e.message })) }
          return
        }

        res.end(JSON.stringify({
          ident: flight.toUpperCase(), status: 'En Route/On Time',
          origin: 'O.R. Tambo International', destination: 'Murtala Muhammed International',
          scheduledDeparture: new Date(Date.now() - 3600000).toISOString(),
          estimatedArrival: new Date(Date.now() + 10800000).toISOString(),
          departureDelay: 0, arrivalDelay: 0, cancelled: false, _mock: true,
        }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApiPlugin(env)],
    server: {
      port: 5174,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    },
  }
})
