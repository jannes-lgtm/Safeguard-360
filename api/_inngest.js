/**
 * Inngest client + durable background functions
 *
 * Functions defined here run outside Vercel's 300s limit.
 * scan-all.js fans out one `safeguard360/scan.country` event per
 * destination country; each fires an independent retryable job here.
 */

import { Inngest } from 'inngest'
import { comprehensiveRiskScan, fetchGDACS, fetchUSGS, fetchHealthOutbreaks, fetchWeatherAlerts } from './_claudeSynth.js'
import { notifyAlert } from './_notify.js'

export const inngest = new Inngest({ id: 'safeguard360' })

// ── Supabase REST helpers ─────────────────────────────────────────────────────

function sbHeaders(key) {
  return {
    'apikey':        key,
    'Authorization': `Bearer ${key}`,
    'Content-Type':  'application/json',
  }
}

async function sbGet(baseUrl, key, table, qs) {
  const url = `${baseUrl}/rest/v1/${table}?${new URLSearchParams(qs)}`
  const res  = await fetch(url, { headers: sbHeaders(key) })
  if (!res.ok) throw new Error(`Supabase GET ${table} → ${res.status}`)
  return res.json()
}

async function sbUpsert(baseUrl, key, table, rows) {
  if (!rows.length) return []
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method:  'POST',
    headers: { ...sbHeaders(key), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body:    JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Supabase upsert ${table} → ${res.status}: ${text}`)
  }
  return res.json().catch(() => [])
}

function gdacsSeverity(level) {
  if (level === 'Red')    return 'Critical'
  if (level === 'Orange') return 'High'
  return 'Medium'
}

function quakeSeverity(mag) {
  if (mag >= 7) return 'Critical'
  if (mag >= 6) return 'High'
  return 'Medium'
}

// In-memory dedup for notifications — resets on cold start, but good enough
// for preventing duplicate SMS/email within a single function lifecycle
const notifiedAt  = {}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

// ── scan-country function ─────────────────────────────────────────────────────
//
// Triggered by scan-all.js for each destination country.
// Broken into named steps so Inngest can checkpoint between them —
// if one step fails it retries only that step, not the whole country.

export const scanCountry = inngest.createFunction(
  {
    id:       'scan-country',
    name:     'Scan Country',
    retries:  2,
    triggers: [{ event: 'safeguard360/scan.country' }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const { country, trips, supabaseUrl, serviceKey, aiKey, today } = event.data

    // ── Step 1: Fetch external data feeds ────────────────────────────────────
    const feeds = await step.run('fetch-feeds', async () => {
      const firstCity = trips[0]?.arrival_city || null
      const [gdacsEvents, quakes, health, weatherAlerts] = await Promise.all([
        fetchGDACS(country).catch(() => []),
        fetchUSGS(country).catch(() => []),
        fetchHealthOutbreaks(country).catch(() => []),
        fetchWeatherAlerts(firstCity, country).catch(() => []),
      ])
      const internalAlerts = await sbGet(supabaseUrl, serviceKey, 'alerts', {
        status:  'eq.Active',
        country: `ilike.%${country}%`,
        select:  'id,title,description,severity,alert_type,country,source,date_issued',
      }).catch(() => [])
      return { gdacsEvents, quakes, health, weatherAlerts, internalAlerts }
    })

    // ── Step 2: AI synthesis (separate step — expensive, retriable alone) ────
    const aiScan = aiKey
      ? await step.run('ai-synthesis', async () => {
          return comprehensiveRiskScan(
            country,
            trips[0]?.arrival_city,
            { fcdo: null, gdacs: feeds.gdacsEvents, usgs: feeds.quakes, iss: null, health: feeds.health },
            aiKey
          ).catch(() => null)
        })
      : null

    // ── Step 3: Build alert rows ──────────────────────────────────────────────
    const allRows = await step.run('build-rows', async () => {
      const rows = []
      for (const trip of trips) {
        for (const ev of feeds.gdacsEvents) {
          const p = ev.properties || {}
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type:   'disaster', severity: gdacsSeverity(p.alertlevel),
            title:        p.eventname || `${p.eventtype || 'Disaster'} in ${country}`,
            description:  p.description || null,
            source:       'GDACS', source_url: p.url?.report || 'https://gdacs.org',
            country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key:    `gdacs-${p.eventid || p.eventId}-${trip.id}`,
            event_date:   p.fromdate ? new Date(p.fromdate).toISOString() : null,
          })
        }
        for (const q of feeds.quakes) {
          const p = q.properties || {}
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type:   'earthquake', severity: quakeSeverity(p.mag || 0),
            title:        `M${(p.mag || 0).toFixed(1)} Earthquake – ${p.place || country}`,
            description:  `Magnitude ${p.mag} earthquake near ${p.place || country}.`,
            source:       'USGS', source_url: p.url || 'https://earthquake.usgs.gov',
            country, arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key:    `usgs-${q.id}-${trip.id}`,
            event_date:   p.time ? new Date(p.time).toISOString() : null,
          })
        }
        for (const wa of feeds.weatherAlerts || []) {
          if (!['Critical', 'High', 'Medium'].includes(wa.severity)) continue
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type:   'weather', severity: wa.severity,
            title:        wa.title,
            description:  [wa.description, wa.end ? `Active until ${new Date(wa.end).toLocaleDateString('en-GB')}` : null].filter(Boolean).join(' — '),
            source:       wa.source || 'OpenWeatherMap', country,
            arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key:    `weather-${wa.title.toLowerCase().replace(/\s+/g,'-').slice(0,40)}-${trip.id}-${today}`,
            event_date:   wa.start || new Date().toISOString(),
          })
        }
        for (const al of feeds.internalAlerts) {
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type:   al.alert_type || 'security', severity: al.severity || 'Medium',
            title:        al.title, description: al.description || null,
            source:       al.source || 'SafeGuard360', country,
            arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key:    `alert-${al.id}-${trip.id}`,
            event_date:   al.date_issued ? new Date(al.date_issued).toISOString() : null,
          })
        }
        if (aiScan) {
          rows.push({
            itinerary_id: trip.id, user_id: trip.user_id,
            alert_type:   'ai_brief', severity: aiScan.overall_severity || 'Medium',
            title:        `AI Risk Brief: ${trip.arrival_city || country}`,
            description:  JSON.stringify({
              summary:         aiScan.summary,
              key_risks:       aiScan.key_risks,
              recommendations: aiScan.recommendations,
            }),
            source:       'Claude AI', country,
            arrival_city: trip.arrival_city, trip_name: trip.trip_name,
            dedup_key:    `ai-brief-${trip.id}-${today}`,
            event_date:   new Date().toISOString(),
          })
          for (const risk of aiScan.risks || []) {
            const titleKey = (risk.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30)
            rows.push({
              itinerary_id: trip.id, user_id: trip.user_id,
              alert_type:   risk.category || 'security', severity: risk.severity || 'Medium',
              title:        risk.title,
              description:  risk.description + (risk.recommendation ? ` — ${risk.recommendation}` : ''),
              source:       'Claude AI', country,
              arrival_city: trip.arrival_city, trip_name: trip.trip_name,
              dedup_key:    `ai-risk-${titleKey}-${trip.id}-${today}`,
              event_date:   new Date().toISOString(),
            })
          }
        }
      }
      return rows
    })

    // ── Step 4: Upsert to Supabase ────────────────────────────────────────────
    const inserted = await step.run('upsert-alerts', async () => {
      if (!allRows.length) return []
      return sbUpsert(supabaseUrl, serviceKey, 'trip_alerts', allRows).catch(e => {
        console.error(`[scan-country] upsert error (${country}):`, e.message)
        return []
      })
    })

    // ── Step 5: Notify users (only if Resend is configured) ──────────────────
    if (inserted.length && process.env.RESEND_API_KEY) {
      await step.run('notify-users', async () => {
        const fiveMinAgo = Date.now() - 5 * 60 * 1000
        const byUserTrip = {}

        for (const a of inserted) {
          if (a.alert_type === 'ai_brief') continue
          if (!['Critical', 'High'].includes(a.severity)) continue
          if (!a.created_at || new Date(a.created_at).getTime() < fiveMinAgo) continue
          const lastNotified = notifiedAt[a.user_id] || 0
          if (Date.now() - lastNotified < CACHE_TTL_MS) continue
          const key = `${a.user_id}:${a.itinerary_id}`
          if (!byUserTrip[key]) {
            byUserTrip[key] = { userId: a.user_id, tripName: a.trip_name, city: a.arrival_city, alerts: [] }
          }
          byUserTrip[key].alerts.push(a)
        }

        for (const { userId, tripName, city, alerts } of Object.values(byUserTrip)) {
          try {
            const [authRes, profRes] = await Promise.all([
              fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
                headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
                signal:  AbortSignal.timeout(4000),
              }),
              fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=phone,whatsapp_number`, {
                headers: sbHeaders(serviceKey),
              }),
            ])
            const authUser     = authRes.ok ? await authRes.json() : null
            const [prof]       = profRes.ok ? await profRes.json() : [{}]
            const userEmail    = authUser?.email || null
            const userPhone    = prof?.phone || null
            const userWhatsApp = prof?.whatsapp_number || null
            if (!userEmail && !userPhone && !userWhatsApp) continue
            await notifyAlert({ userEmail, userPhone, userWhatsApp, alerts, tripName, city })
            notifiedAt[userId] = Date.now()
          } catch (e) {
            console.error(`[scan-country] notify error for ${userId}:`, e.message)
          }
        }
      })
    }

    return { country, rows: allRows.length, inserted: inserted.length }
  }
)
