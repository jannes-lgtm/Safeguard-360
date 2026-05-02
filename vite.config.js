import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function devApiPlugin(apiKey) {
  return {
    name: 'dev-api',
    configureServer(server) {
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
    plugins: [react(), devApiPlugin(env.FLIGHTAWARE_API_KEY)],
    server: { port: 5174 },
  }
})
