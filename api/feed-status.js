// Returns live status for all built-in feeds based on configured env vars
// Called by Intel Feeds page on load to override hardcoded statuses

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const has = (key) => !!process.env[key]

  res.json({
    // ── Always active — no API key needed ───────────────────────────────────
    gdacs:               'active',
    usgs:                'active',
    eonet:               'active',
    'open-meteo':        'active',
    ucdp:                'active',
    flightaware:         'active',
    'state-dept':        'active',
    fcdo:                'active',
    saps:                'active',

    // Disease & Health — public RSS feeds, always active
    'who-outbreak':      'active',
    'cdc-travel-health': 'active',
    'ecdc-threats':      'active',
    promed:              'active',

    // Security — public RSS feeds, always active
    'african-arguments': 'active',
    osac:                'active',

    // Conflict — public API/RSS, always active
    gdelt:               'active',

    // ── Require API keys ─────────────────────────────────────────────────────
    whatsapp:       has('TWILIO_ACCOUNT_SID')     ? 'active' : 'pending_key',
    eskomsepush:    has('ESKOMSEPUSH_API_KEY')    ? 'active' : 'pending_key',
    acled:          (has('ACLED_API_KEY') && has('ACLED_EMAIL')) ? 'active' : 'pending_key',
    openweathermap: has('OPENWEATHERMAP_API_KEY') ? 'active' : 'pending_key',
    'ocha-hapi':    has('OCHA_HAPI_API_KEY')      ? 'active' : 'pending_key',
    aisstream:      has('AISSTREAM_API_KEY')       ? 'active' : 'pending_key',
    'nasa-firms':   has('NASA_FIRMS_API_KEY')     ? 'active' : 'pending_key',
    healthmap:      has('HEALTHMAP_API_KEY')       ? 'active' : 'pending_key',

    // ── Partnership / enterprise — must be manually negotiated ───────────────
    // (not listed here so they fall back to 'partnership' status in the UI)
  })
}
