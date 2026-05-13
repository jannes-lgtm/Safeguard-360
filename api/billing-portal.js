/**
 * api/billing-portal.js
 *
 * Creates a Stripe Customer Portal session so org admins can manage
 * their subscription, update payment method, view invoices, or cancel.
 *
 * POST body: { returnUrl?: string }
 * Auth:      Bearer token (Supabase JWT) — org_admin, admin, or developer
 */

import Stripe from 'stripe'
import { getSupabaseAdmin } from './_supabase.js'

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2024-04-10' })
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' })
  }

  try {
    const token = authHeader.slice(7)
    const sb    = getSupabaseAdmin()

    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data: profile } = await sb.from('profiles').select('role, organisation_id').eq('id', user.id).single()
    if (!profile) return res.status(403).json({ error: 'Profile not found' })

    const allowedRoles = ['admin', 'developer', 'org_admin']
    if (!allowedRoles.includes(profile.role)) {
      return res.status(403).json({ error: 'Insufficient role' })
    }

    const orgId = profile.organisation_id
    if (!orgId) return res.status(400).json({ error: 'No organisation linked' })

    const { data: org } = await sb.from('organisations').select('stripe_customer_id').eq('id', orgId).single()
    if (!org?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found — subscribe first.' })
    }

    const origin     = process.env.APP_URL || 'https://www.risk360.co'
    const returnUrl  = (req.body?.returnUrl) || `${origin}/billing`

    const session = await stripe().billingPortal.sessions.create({
      customer:   org.stripe_customer_id,
      return_url: returnUrl,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[billing-portal]', err)
    return res.status(500).json({ error: err.message })
  }
}
