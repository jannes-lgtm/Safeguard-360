/**
 * api/stripe-webhook.js
 *
 * Stripe webhook handler — receives events from Stripe and keeps the
 * organisations table in sync.
 *
 * Events handled:
 *   checkout.session.completed        → activate subscription
 *   customer.subscription.updated     → plan change / renewal
 *   customer.subscription.deleted     → cancellation / lapse
 *   invoice.payment_failed            → mark billing_status = 'past_due'
 *   invoice.payment_succeeded         → clear past_due flag
 *
 * Env vars required:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET   (from `stripe listen --forward-to` or Stripe dashboard)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import Stripe from 'stripe'
import { getSupabaseAdmin } from './_supabase.js'

/** Map Stripe metadata plan → seat limits */
const SEAT_LIMITS = {
  solo:       1,
  team:       15,
  operations: 40,
  enterprise: null, // handled manually
}

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
  return new Stripe(key, { apiVersion: '2024-04-10' })
}

async function findOrgByCustomer(sb, customerId) {
  const { data } = await sb
    .from('organisations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return data?.id || null
}

async function syncSubscription(sb, subscription, orgIdOverride = null) {
  const customerId = subscription.customer
  const orgId      = orgIdOverride || await findOrgByCustomer(sb, customerId)
  if (!orgId) {
    console.warn('[stripe-webhook] No org found for customer', customerId)
    return
  }

  const plan        = subscription.metadata?.plan || 'unknown'
  const status      = subscription.status // active, past_due, canceled, etc.
  const periodEnd   = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null

  const maxTravellers = SEAT_LIMITS[plan] ?? 1

  await sb.from('organisations').update({
    subscription_plan:               plan,
    stripe_subscription_id:          subscription.id,
    billing_status:                  status === 'active' ? 'active' : status,
    subscription_current_period_end: periodEnd,
    max_travellers:                  maxTravellers,
    is_active:                       status === 'active' || status === 'trialing',
  }).eq('id', orgId)

  console.log(`[stripe-webhook] syncSubscription → org=${orgId} plan=${plan} status=${status}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const sig    = req.headers['stripe-signature']
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    // Vercel serverless supplies raw body as Buffer when you disable bodyParser
    // We need the raw body for signature verification
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
    const client  = stripeClient()
    event = client.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message)
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` })
  }

  const sb = getSupabaseAdmin()

  try {
    switch (event.type) {
      // ── Checkout completed ─────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break

        const plan     = session.metadata?.plan
        const orgId    = session.metadata?.org_id
        const subId    = session.subscription

        if (!orgId || !plan || !subId) {
          console.warn('[stripe-webhook] checkout.session.completed missing metadata', session.id)
          break
        }

        // Fetch full subscription object
        const client   = stripeClient()
        const sub      = await client.subscriptions.retrieve(subId)
        await syncSubscription(sb, sub, orgId)

        // Also persist customer ID (may already be set from checkout creation, belt+suspenders)
        await sb.from('organisations').update({
          stripe_customer_id: session.customer,
        }).eq('id', orgId)

        break
      }

      // ── Subscription updated (plan change, renewal, trial end) ─────
      case 'customer.subscription.updated': {
        await syncSubscription(sb, event.data.object)
        break
      }

      // ── Subscription cancelled / deleted ──────────────────────────
      case 'customer.subscription.deleted': {
        const sub      = event.data.object
        const customerId = sub.customer
        const orgId    = await findOrgByCustomer(sb, customerId)
        if (orgId) {
          await sb.from('organisations').update({
            billing_status:                  'canceled',
            is_active:                       false,
            subscription_current_period_end: null,
          }).eq('id', orgId)
          console.log(`[stripe-webhook] subscription.deleted → org=${orgId} deactivated`)
        }
        break
      }

      // ── Payment failed ─────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object
        const customerId = invoice.customer
        const orgId      = await findOrgByCustomer(sb, customerId)
        if (orgId) {
          await sb.from('organisations').update({ billing_status: 'past_due' }).eq('id', orgId)
          console.log(`[stripe-webhook] payment_failed → org=${orgId} marked past_due`)
        }
        break
      }

      // ── Payment succeeded (clears past_due) ───────────────────────
      case 'invoice.payment_succeeded': {
        const invoice    = event.data.object
        const customerId = invoice.customer
        const orgId      = await findOrgByCustomer(sb, customerId)
        if (orgId) {
          await sb.from('organisations').update({ billing_status: 'active' }).eq('id', orgId)
        }
        break
      }

      default:
        // Unhandled event — Stripe requires 200 response anyway
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[stripe-webhook] Handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}

// Vercel: disable auto body parsing so we get raw body for Stripe signature verification
export const config = { api: { bodyParser: false } }
