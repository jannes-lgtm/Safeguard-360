/**
 * Billing.jsx — In-app subscription management page
 * Accessible by org_admin, admin, developer roles.
 * Shows current plan, usage summary, upgrade path, and Stripe portal link.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CreditCard, Users, ArrowUpRight, CheckCircle2,
  AlertTriangle, ChevronRight, ExternalLink, Zap,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { PLANS, getPlan, seatLimit } from '../data/plans'

/* ─── Plan upgrade card (compact, in-app style) ─────────────────────── */
function UpgradePlanCard({ plan, current, onUpgrade, loading }) {
  const isCurrent    = plan.key === current
  const isEnterprise = plan.key === 'enterprise'

  return (
    <div className={`rounded-[8px] border p-4 flex flex-col gap-3 transition-shadow ${
      isCurrent
        ? 'border-[#1E2461] bg-[#1E2461]/5'
        : 'border-gray-200 bg-white hover:shadow-sm'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-[9px] font-black tracking-[0.18em] uppercase ${isCurrent ? 'text-[#1E2461]' : 'text-gray-400'}`}>
            {plan.name}
          </span>
          {isCurrent && (
            <span className="ml-2 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[#1E2461] text-white">
              Active
            </span>
          )}
        </div>
        <span className="text-xs font-bold text-gray-500">
          {plan.price != null ? `$${plan.price}/mo` : 'Custom'}
        </span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">{plan.tagline}</p>

      <p className="text-[10px] text-gray-400">
        {plan.travellers != null
          ? `${plan.travellers === 1 ? '1 traveller seat' : `Up to ${plan.travellers} seats`}`
          : 'Unlimited seats'}
      </p>

      {!isCurrent && (
        <button
          onClick={() => onUpgrade(plan)}
          disabled={loading === plan.key}
          className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 rounded-[6px] text-xs font-bold transition-colors disabled:opacity-50"
          style={
            isEnterprise
              ? { border: '1px solid #1E2461', color: '#1E2461', background: 'transparent' }
              : { background: '#1E2461', color: 'white' }
          }>
          {loading === plan.key ? 'Redirecting…'
            : isEnterprise ? 'Contact Sales'
            : 'Upgrade'} <ChevronRight size={11} />
        </button>
      )}
    </div>
  )
}

/* ─── Usage stat pill ───────────────────────────────────────────────── */
function UsageStat({ label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-[8px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ─── Main Billing page ─────────────────────────────────────────────── */
export default function Billing() {
  const [searchParams]  = useSearchParams()
  const [org, setOrg]   = useState(null)
  const [profile, setProfile] = useState(null)
  const [travellers, setTravellers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(null)
  const [portalLoading, setPortalLoading]   = useState(false)
  const [toast, setToast]  = useState(null)

  const success   = searchParams.get('success') === '1'
  const cancelled = searchParams.get('cancelled') === '1'
  const newPlan   = searchParams.get('plan')

  useEffect(() => {
    if (success) showToast('success', `Subscription activated${newPlan ? ` — ${newPlan.toUpperCase()} plan` : ''}`)
    if (cancelled) showToast('warn', 'Checkout cancelled — no changes were made.')
  }, [success, cancelled])

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 5000)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return setLoading(false)

      const { data: prof } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', session.user.id)
        .single()

      setProfile(prof)

      if (prof?.org_id) {
        const [{ data: orgData }, { count }] = await Promise.all([
          supabase.from('organisations')
            .select('id, name, subscription_plan, billing_status, max_travellers, stripe_customer_id, subscription_current_period_end')
            .eq('id', prof.org_id)
            .single(),
          supabase.from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', prof.org_id)
            .in('role', ['traveller', 'solo']),
        ])
        setOrg(orgData)
        setTravellers(count || 0)
      }
      setLoading(false)
    }
    init()
  }, [])

  const handleUpgrade = async (plan) => {
    if (plan.key === 'enterprise') {
      window.location.href = '/pricing#enterprise'
      return
    }
    setUpgradeLoading(plan.key)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan:      plan.key,
          orgId:     org.id,
          returnUrl: window.location.origin + '/billing',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout failed')
      window.location.href = data.url
    } catch (e) {
      showToast('error', e.message)
      setUpgradeLoading(null)
    }
  }

  const openBillingPortal = async () => {
    setPortalLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/billing-portal', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.origin + '/billing' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open billing portal')
      window.location.href = data.url
    } catch (e) {
      showToast('error', e.message)
    } finally {
      setPortalLoading(false)
    }
  }

  const planData    = getPlan(org?.subscription_plan) || null
  const seats       = org ? seatLimit(org.subscription_plan) : null
  const seatsUsed   = travellers
  const seatsLeft   = seats != null ? seats - seatsUsed : null
  const nearLimit   = seatsLeft != null && seatsLeft <= 2
  const isAdmin     = profile?.role === 'admin' || profile?.role === 'developer'
  const isOrgAdmin  = profile?.role === 'org_admin' || isAdmin

  const billingStatusColor = {
    active:   'text-green-600 bg-green-50',
    trialing: 'text-blue-600 bg-blue-50',
    past_due: 'text-amber-600 bg-amber-50',
    canceled: 'text-red-600 bg-red-50',
    inactive: 'text-gray-500 bg-gray-100',
  }

  return (
    <Layout>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 rounded-[8px] shadow-lg text-sm font-medium max-w-sm ${
          toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
          toast.type === 'warn'    ? 'bg-amber-50 border border-amber-200 text-amber-800' :
                                     'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 size={15} className="text-green-600 shrink-0" />
            : <AlertTriangle size={15} className="shrink-0" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your plan, seats, and payment details</p>
        </div>
        {isOrgAdmin && org?.stripe_customer_id && (
          <button
            onClick={openBillingPortal}
            disabled={portalLoading}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 font-medium px-4 py-2.5 rounded-[6px] text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
            {portalLoading ? 'Opening…' : (<><CreditCard size={14} />Manage Billing<ExternalLink size={12}/></>)}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-[8px] animate-pulse" />)}
        </div>
      ) : !org ? (
        <div className="bg-white rounded-[8px] border border-gray-200 p-8 text-center">
          <p className="text-gray-500 text-sm">No organisation found. Please complete onboarding first.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">

          {/* Current plan status */}
          <div className="bg-white rounded-[8px] border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.06)] p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400 mb-1">Current Plan</p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-black text-gray-900">
                    {planData?.name || org.subscription_plan?.toUpperCase() || 'No plan'}
                  </h2>
                  {org.billing_status && (
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${billingStatusColor[org.billing_status] || billingStatusColor.inactive}`}>
                      {org.billing_status}
                    </span>
                  )}
                </div>
                {planData && (
                  <p className="text-sm text-gray-500 mt-0.5">{planData.tagline}</p>
                )}
                {org.subscription_current_period_end && (
                  <p className="text-xs text-gray-400 mt-2">
                    Renews {new Date(org.subscription_current_period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
              {planData?.price != null && (
                <div className="text-right">
                  <p className="text-2xl font-black text-gray-900">${planData.price}</p>
                  <p className="text-xs text-gray-400">per month</p>
                </div>
              )}
            </div>
          </div>

          {/* Near-limit warning */}
          {nearLimit && seatsLeft >= 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-[8px] px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {seatsLeft === 0 ? 'Seat limit reached' : `${seatsLeft} seat${seatsLeft > 1 ? 's' : ''} remaining`}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {seatsLeft === 0
                    ? 'Upgrade your plan to add more travellers.'
                    : 'You\'re close to your traveller seat limit. Consider upgrading before adding more users.'}
                </p>
              </div>
            </div>
          )}

          {/* Usage stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <UsageStat
              label="Traveller seats used"
              value={`${seatsUsed}${seats != null ? ` / ${seats}` : ''}`}
              sub={seats == null ? 'Unlimited' : seatsLeft != null ? `${seatsLeft} remaining` : null}
            />
            <UsageStat
              label="Plan limit"
              value={seats != null ? seats : '∞'}
              sub={planData?.name || 'Current plan'}
            />
            <UsageStat
              label="Organisation"
              value={org.name?.split(' ').slice(0, 2).join(' ')}
              sub={org.is_active ? 'Active' : 'Inactive'}
            />
          </div>

          {/* Upgrade / plan selection */}
          {isOrgAdmin && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">Available plans</h3>
                <a href="/pricing" target="_blank"
                  className="text-xs text-[#1E2461] hover:underline flex items-center gap-1">
                  Full plan comparison <ArrowUpRight size={11} />
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {PLANS.map(plan => (
                  <UpgradePlanCard
                    key={plan.key}
                    plan={plan}
                    current={org.subscription_plan}
                    onUpgrade={handleUpgrade}
                    loading={upgradeLoading}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Billing portal link */}
          {isOrgAdmin && org.stripe_customer_id && (
            <div className="bg-gray-50 border border-gray-200 rounded-[8px] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CreditCard size={14} className="text-gray-400" />
                <span className="text-sm text-gray-600">Manage payment method, view invoices, or cancel subscription</span>
              </div>
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="text-xs font-semibold text-[#1E2461] hover:underline flex items-center gap-1 disabled:opacity-50">
                Open billing portal <ExternalLink size={11} />
              </button>
            </div>
          )}

          {/* No subscription yet */}
          {!org.stripe_customer_id && isOrgAdmin && (
            <div className="bg-[#1E2461]/5 border border-[#1E2461]/20 rounded-[8px] px-4 py-4 flex items-start gap-3">
              <Zap size={15} className="text-[#1E2461] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-[#1E2461]">No active subscription</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  Select a plan above to activate your subscription and unlock full platform capabilities.
                </p>
                <a href="/pricing" target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0118A1] hover:underline">
                  View pricing page <ArrowUpRight size={11} />
                </a>
              </div>
            </div>
          )}

        </div>
      )}
    </Layout>
  )
}
