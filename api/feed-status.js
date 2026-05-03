// Returns live status for all built-in feeds based on configured env vars
// Called by Intel Feeds page on load to override hardcoded statuses

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  res.json({
    eskomsepush:    !!process.env.ESKOMSEPUSH_API_KEY    ? 'active' : 'pending_key',
    acled:          (!!process.env.ACLED_API_KEY && !!process.env.ACLED_EMAIL) ? 'active' : 'pending_key',
    openweathermap: !!process.env.OPENWEATHERMAP_API_KEY ? 'active' : 'pending_key',
  })
}
