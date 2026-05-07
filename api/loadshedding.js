// EskomSePush API — load shedding status and area schedules
// Docs: https://documenter.getpostman.com/view/1296288/UzQuNk3E
// Sign up for free API key: https://eskomsepush.gumroad.com/l/api
// Env var: ESKOMSEPUSH_API_KEY (free tier: 50 calls/day)

const CACHE_TTL = 15 * 60 * 1000 // 15 min cache — preserve free tier quota
let statusCache = null
let statusCacheTime = 0

async function fetchESP(path, apiKey) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const r = await fetch(`https://developer.sepush.co.za/business/2.0${path}`, {
      headers: { Token: apiKey },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!r.ok) return null
    return await r.json()
  } catch {
    clearTimeout(timeout)
    return null
  }
}

async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ESKOMSEPUSH_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Load shedding service not configured' })

  const { area } = req.query

  // Return cached national status if fresh
  const cacheExpired = !statusCache || Date.now() - statusCacheTime > CACHE_TTL

  if (cacheExpired) {
    const data = await fetchESP('/status', apiKey)
    if (data) {
      statusCache = data
      statusCacheTime = Date.now()
    }
  }

  // National stage
  const stage = statusCache?.status?.capetown?.stage ?? statusCache?.status?.national?.stage ?? null
  const stageNum = stage ? parseInt(stage.replace('Stage ', '').trim()) : 0

  // Area-specific schedule (optional)
  let areaSchedule = null
  if (area) {
    areaSchedule = await fetchESP(`/area?id=${encodeURIComponent(area)}`, apiKey)
  }

  // Next outage window (if area provided)
  let nextOutage = null
  if (areaSchedule?.schedule?.days?.length) {
    const today = areaSchedule.schedule.days[0]
    const now = new Date()
    const todayStages = today?.stages?.[stageNum - 1] ?? []
    for (const window of todayStages) {
      const [start] = window.split('-')
      const [h, m] = start.split(':').map(Number)
      const windowTime = new Date()
      windowTime.setHours(h, m, 0, 0)
      if (windowTime > now) {
        nextOutage = { date: today.date, window }
        break
      }
    }
  }

  res.json({
    stage: stageNum,
    active: stageNum > 0,
    severity: stageNum === 0 ? 'None' : stageNum <= 2 ? 'Low' : stageNum <= 4 ? 'Moderate' : 'High',
    message: stageNum === 0
      ? 'No load shedding currently'
      : `Stage ${stageNum} load shedding in effect`,
    nextOutage,
    area: areaSchedule?.info ?? null,
    cached: !cacheExpired,
  })
}

// Search areas — for autocomplete in frontend
export async function searchAreas(query, apiKey) {
  return await fetchESP(`/areas_search?text=${encodeURIComponent(query)}`, apiKey)
}

import { adapt } from './_adapter.js'
export const handler = adapt(_handler)
export default handler
