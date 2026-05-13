/**
 * api/create-checkout-session.js
 *
 * Creates a Stripe Checkout session for self-serve plans (solo, team, operations).
 * Called by the Billing page when user clicks "Upgrade / Subscribe".
 *
 * POST body: { plan: 'solo' | 'team' | 'operations', orgId: string, returnUrl: string }
 * Auth:      Bearer token (Supabase JWT) — must belong to org admin or developer
 */

import Stripe from 'stripe'
import { getSupabaseAdmin } from './_supabase.js'

const PRICE_IDS = {
  solo:       process.env.STRIPE_SOLO_PRICE_ID,
  team:       process.env.STRIPE_TEAM_PRICE_ID,
  operations: process.env.STRIPE_OPS_PRICE_ID,
}

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

    // Verify user identity
    const { data: { user }, error: authErr } = await sb.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data: profile } = await sb.from('profiles').select('role, org_id').eq('id', user.id).single()
    if (!profile) return res.status(403).json({ error: 'Profile not found' })

    const allowedRoles = ['admin', 'developer', 'org_admin']
    if (!allowedRoles.includes(profile.role)) {
      return res.status(403).json({ error: 'Insufficient role — org admin required' })
    }

    const { plan, orgId, returnUrl } = req.body
    if (!plan || !PRICE_IDS[plan]) {
      return res.status(400).json({ error: `Unknown plan: ${plan}. Valid: solo, team, operations` })
    }
    if (!PRICE_IDS[plan]) {
      return res.status(500).json({ error: `Stripe price ID not configured for plan: ${plan}` })
    }

    // Resolve org — admins can pass any orgId; org_admin must own it
    const targetOrgId = orgId || profile.org_id
    if (!targetOrgId) return res.status(400).json({ error: 'orgId required' })

    if (profile.role === 'org_admin' && targetOrgId !== profile.org_id) {
      return res.status(403).json({ error: 'Cannot manage billing for another organisation' })
    }

    const { data: org } = await sb.from('organisations').select('id, name, stripe_customer_id').eq('id', targetOrgId).single()
    if (!org) return res.status(404).json({ error: 'Organisation not found' })

    const client = stripe()
    let customerId = org.stripe_customer_id

    // Create Stripe customer if we don't have one yet
    if (!customerId) {
      const customer = await client.customers.create({
        email:    user.email,
        name:     org.name,
        metadata: { org_id: targetOrgId, created_by: user.id },
      })
      customerId = customer.id
      await sb.from('organisations').update({ stripe_customer_id: customerId }).eq('id', targetOrgId)
    }

    const origin = returnUrl || process.env.APP_URL || 'https://www.risk360.co'

    const session = await client.checkout.sessions.create({
      customer:             customerId,
      mode:                 'subscription',
      payment_method_types: ['card'],
      line_items: [
        { price: PRICE_IDS[plan], quantity: 1 },
      ],
      subscription_data: {
        metadata: { org_id: targetOrgId, plan },
      },
      success_url: `${origin}/billing?success=1&plan=${plan}`,
      cancel_url:  `${origin}/billing?cancelled=1`,
      allow_promotion_codes: true,
      metadata: { org_id: targetOrgId, plan },
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('[create-checkout-session]', err)
    return res.status(500).json({ error: err.message })
  }
}
