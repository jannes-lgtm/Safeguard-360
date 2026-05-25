/**
 * /api/inngest
 *
 * Inngest serve endpoint — Inngest calls this URL to invoke functions
 * and to register the function manifest.
 *
 * After deploying, sync this app in the Inngest dashboard:
 *   Apps → Add App → https://www.risk360.co/api/inngest
 *
 * Required env vars (set in Vercel):
 *   INNGEST_EVENT_KEY   — from Inngest dashboard → your app → Event Key
 *   INNGEST_SIGNING_KEY — from Inngest dashboard → your app → Signing Key
 */

import { serve } from 'inngest/node'
import { inngest, scanCountry } from './_inngest.js'

export default serve({ client: inngest, functions: [scanCountry] })
