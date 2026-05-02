export default async function handler(req, res) {
  const { flight } = req.query
  if (!flight) return res.status(400).json({ error: 'flight parameter required' })

  const apiKey = process.env.FLIGHTAWARE_API_KEY

  if (!apiKey) {
    // Mock response for development — replace with real key in Vercel env vars
    return res.json({
      ident: flight.toUpperCase(),
      status: 'Scheduled',
      scheduledDeparture: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      estimatedArrival: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
      departureDelay: 0,
      arrivalDelay: 0,
      cancelled: false,
      _mock: true,
    })
  }

  try {
    const response = await fetch(
      `https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(flight)}`,
      { headers: { 'x-apikey': apiKey } }
    )

    if (!response.ok) {
      return res.status(response.status).json({ error: `FlightAware error ${response.status}` })
    }

    const data = await response.json()
    const latest = data.flights?.[0]
    if (!latest) return res.status(404).json({ error: 'Flight not found' })

    res.json({
      ident: latest.ident,
      status: latest.status,
      origin: latest.origin?.name,
      destination: latest.destination?.name,
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
  } catch {
    res.status(500).json({ error: 'Internal error fetching flight data' })
  }
}
