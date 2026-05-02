export default async function handler(req, res) {
  const { flight } = req.query
  if (!flight) return res.status(400).json({ error: 'flight parameter required' })

  const apiKey = process.env.FLIGHTAWARE_API_KEY

  if (!apiKey) {
    return res.json({
      ident: flight.toUpperCase(),
      status: 'Scheduled',
      scheduledDeparture: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      estimatedArrival: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      departureDelay: 0,
      arrivalDelay: 0,
      _mock: true,
    })
  }

  // Try the flight number as-is first, then strip spaces
  const clean = flight.toUpperCase().replace(/\s/g, '')

  async function fetchFlight(ident) {
    const r = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`,
      { headers: { 'x-apikey': apiKey } }
    )
    if (!r.ok) return null
    const data = await r.json()
    return data.flights?.length ? data.flights : null
  }

  try {
    // Try original (may be IATA like LX283), FlightAware accepts both IATA and ICAO
    let flights = await fetchFlight(clean)

    if (!flights) {
      return res.status(404).json({ error: `Flight ${clean} not found. Check the flight number and try again.` })
    }

    // Pick the most relevant flight — prefer upcoming/active over completed
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Sort by scheduled departure, prefer today or future flights
    const sorted = flights
      .filter(f => f.scheduled_out) // must have a departure time
      .sort((a, b) => {
        const aDate = new Date(a.scheduled_out)
        const bDate = new Date(b.scheduled_out)
        const aDiff = Math.abs(aDate - now)
        const bDiff = Math.abs(bDate - now)
        // Prefer upcoming over past
        const aFuture = aDate >= now
        const bFuture = bDate >= now
        if (aFuture && !bFuture) return -1
        if (!aFuture && bFuture) return 1
        return aDiff - bDiff
      })

    const latest = sorted[0] ?? flights[0]

    res.json({
      ident: latest.ident ?? clean,
      status: latest.status ?? 'Unknown',
      origin: latest.origin?.name ?? latest.origin?.code ?? null,
      destination: latest.destination?.name ?? latest.destination?.code ?? null,
      scheduledDeparture: latest.scheduled_out,
      estimatedDeparture: latest.estimated_out,
      actualDeparture: latest.actual_out,
      scheduledArrival: latest.scheduled_in,
      estimatedArrival: latest.estimated_in,
      actualArrival: latest.actual_in,
      departureDelay: latest.departure_delay,
      arrivalDelay: latest.arrival_delay,
      cancelled: latest.cancelled,
      diverted: latest.diverted,
      aircraftType: latest.aircraft_type,
    })
  } catch (e) {
    res.status(500).json({ error: 'Internal error fetching flight data' })
  }
}
