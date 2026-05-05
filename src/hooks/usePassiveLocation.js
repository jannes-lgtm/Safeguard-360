/**
 * usePassiveLocation.js
 * Silently captures the traveller's GPS position whenever they use the app
 * during an active trip. Fires once per session (throttled by localStorage
 * to max once every 15 minutes). Stores to location_pings table.
 *
 * Legal basis: explicit informed consent via Terms & Conditions (Section 3).
 * Only runs when:
 *   1. User has an active trip (depart_date ≤ today ≤ return_date)
 *   2. User has accepted T&C
 *   3. 15+ minutes have passed since last ping this session
 *   4. Browser geolocation permission is granted
 */

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const PING_INTERVAL_MS = 15 * 60 * 1000   // 15 minutes
const STORAGE_KEY      = 'sg360_last_ping' // localStorage key

export default function usePassiveLocation(profile) {
  useEffect(() => {
    // Don't run if no profile or T&C not accepted
    if (!profile?.id) return
    if (!profile?.terms_accepted_at) return

    // Throttle: only ping once per 15 minutes
    const lastPing = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
    if (Date.now() - lastPing < PING_INTERVAL_MS) return

    // Don't run if browser doesn't support geolocation
    if (!navigator.geolocation) return

    const run = async () => {
      // Check for active trip
      const today = new Date().toISOString().split('T')[0]
      const { data: trip } = await supabase
        .from('itineraries')
        .select('id, org_id, user_id')
        .eq('user_id', profile.id)
        .lte('depart_date', today)
        .gte('return_date', today)
        .limit(1)
        .single()

      // No active trip — don't ping
      if (!trip) return

      // Request position (browser uses cached permission — no prompt shown again)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude, accuracy, altitude, speed } = pos.coords

          await supabase.from('location_pings').insert({
            user_id:   profile.id,
            trip_id:   trip.id,
            org_id:    profile.org_id || null,
            latitude,
            longitude,
            accuracy:  accuracy ? Math.round(accuracy) : null,
            altitude:  altitude || null,
            speed:     speed || null,
            source:    'passive',
          })

          // Record ping time so we don't spam
          localStorage.setItem(STORAGE_KEY, Date.now().toString())
        },
        () => {
          // Silently ignore — user may have denied permission or GPS unavailable
          // We never show an error for passive tracking failures
        },
        {
          enableHighAccuracy: false,  // Battery-friendly for passive use
          timeout: 8000,
          maximumAge: 300000,         // Accept cached position up to 5 min old
        }
      )
    }

    run()
  }, [profile?.id]) // Re-run if profile changes (e.g. after login)
}
