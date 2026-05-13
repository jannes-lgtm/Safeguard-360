/**
 * /src/pages/ControlRoom.jsx
 * Developer/Operator view — live console for all incoming assistance requests.
 * Accessible only to role = 'developer'.
 */

import { useEffect, useState, useRef } from 'react'
import {
  Headphones, RefreshCw, MapPin, Clock, User, Send,
  CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Phone, Mail, MessageSquare, Circle, Filter,
} from 'lucide-react'
import Layout from '../components/Layout'
import W3WAddress from '../components/W3WAddress'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const TYPE_LABELS = {
  medical:           { label: 'Medical',            icon: '🏥' },
  security:          { label: 'Security',           icon: '🛡️' },
  evacuation:        { label: 'Evacuation',         icon: '🚨' },
  travel_disruption: { label: 'Travel Disruption',  icon: '✈️' },
  lost_documents:    { label: 'Lost Documents',     icon: '📄' },
  accommodation:     { label: 'Accommodation',      icon: '🏨' },
  legal:             { label: 'Legal',              icon: '⚖️' },
  other:             { label: 'Other',              icon: '💬' },
}

const SEVERITY_STYLE = {
  critical: { bg: 'bg-red-50',    border: 'border-red-400',   badge: 'bg-red-100 text-red-700 border-red-300',    dot: 'bg-red-500',    label: 'Critical' },
  high:     { bg: 'bg-amber-50',  border: 'border-amber-400', badge: 'bg-amber-100 text-amber-700 border-amber-300', dot: 'bg-amber-500', label: 'High' },
  medium:   { bg: 'bg-blue-50',   border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700 border-blue-200',  dot: 'bg-blue-500',   label: 'Medium' },
  low:      { bg: 'bg-gray-50',   border: 'border-gray-200',  badge: 'bg-gray-100 text-gray-600 border-gray-200',  dot: 'bg-gray-400',   label: 'Low' },
}

const STATUS_STYLE = {
  pending:     { label: 'Pending',     color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  in_progress: { label: 'In Progress', color: 'text-blue-600',   bg: 'bg-blue-50   border-blue-200' },
  resolved:    { label: 'Resolved',    color: 'text-green-600',  bg: 'bg-green-50  border-green-200' },
  cancelled:   { label: 'Cancelled',   color: 'text-gray-500',   bg: 'bg-gray-50   border-gray-200' },
}

function timeAgo(d) {
  if (!d) return '—'
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// ── Request card ──────────────────────────────────────────────────────────────
function RequestCard({ req, onUpdate }) {
  const [open, setOpen]         = useState(req.severity === 'critical')
  const [response, setResponse] = useState('')
  const [saving, setSaving]     = useState(false)
  const [messages, setMessages] = useState([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  const sev  = SEVERITY_STYLE[req.severity]  || SEVERITY_STYLE.medium
  const stat = STATUS_STYLE[req.status]      || STATUS_STYLE.pending
  const type = TYPE_LABELS[req.request_type] || TYPE_LABELS.other

  const loadMessages = async () => {
    if (!open) return
    setLoadingMsgs(true)
    const { data } = await supabase
      .from('control_room_messages')
      .select('*')
      .eq('request_id', req.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    setLoadingMsgs(false)
  }

  useEffect(() => { if (open) loadMessages() }, [open])

  const sendResponse = async (newStatus) => {
    setSaving(true)
    const now = new Date().toISOString()

    const updates = { status: newStatus, updated_at: now }
    if (newStatus === 'in_progress' && !req.assigned_to) updates.assigned_to = 'Operator'
    if (newStatus === 'resolved') updates.resolved_at = now
    if (response.trim()) updates.response_notes = response.trim()

    await supabase.from('control_room_requests').update(updates).eq('id', req.id)

    if (response.trim()) {
      await supabase.from('control_room_messages').insert({
        request_id: req.id,
        sender_role: 'operator',
        message: response.trim(),
      })
    }

    setSaving(false)
    setResponse('')
    await loadMessages()
    onUpdate()
  }

  return (
    <div className={`rounded-xl border-l-4 overflow-hidden shadow-sm ${sev.bg} ${sev.border}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(p => !p)}
      >
        {/* Severity dot */}
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot}`} />

        {/* Type + title */}
        <span className="text-base shrink-0">{type.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 truncate">{type.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sev.badge}`}>
              {sev.label}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${stat.bg} ${stat.color}`}>
              {stat.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {req.profiles?.full_name || req.profiles?.email || 'Unknown'}
            {req.arrival_city && ` · ${req.arrival_city}`}
            {req.country && ` · ${req.country}`}
          </p>
        </div>

        {/* Time */}
        <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(req.created_at)}</span>
        {open ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-black/5 bg-white/60 px-5 py-4 space-y-4">

          {/* Description */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-gray-800 leading-relaxed">{req.description}</p>
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Requester</p>
              <p className="text-gray-700 font-medium">{req.profiles?.full_name || '—'}</p>
              <p className="text-gray-400">{req.profiles?.email || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Location</p>
              {req.latitude && req.longitude
                ? <W3WAddress lat={req.latitude} lng={req.longitude} />
                : <p className="text-gray-400 italic text-xs">No GPS</p>
              }
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Trip</p>
              <p className="text-gray-700">{req.trip_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Raised</p>
              <p className="text-gray-700">{fmtTime(req.created_at)}</p>
            </div>
            {req.contact_detail && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Contact</p>
                <p className="text-gray-700">{req.contact_detail} ({req.contact_method})</p>
              </div>
            )}
            {req.assigned_to && (
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Assigned To</p>
                <p className="text-gray-700">{req.assigned_to}</p>
              </div>
            )}
          </div>

          {/* Message thread */}
          {messages.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Thread</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {messages.map(m => (
                  <div key={m.id} className={`flex gap-2 ${m.sender_role === 'operator' ? 'flex-row-reverse' : ''}`}>
                    <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                      m.sender_role === 'operator'
                        ? 'bg-[#0118A1] text-white rounded-tr-none'
                        : 'bg-gray-100 text-gray-800 rounded-tl-none'
                    }`}>
                      <p>{m.message}</p>
                      <p className={`text-[9px] mt-1 ${m.sender_role === 'operator' ? 'text-white/60 text-right' : 'text-gray-400'}`}>
                        {timeAgo(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response input */}
          {req.status !== 'resolved' && req.status !== 'cancelled' && (
            <div>
              <textarea
                value={response}
                onChange={e => setResponse(e.target.value)}
                rows={2}
                placeholder="Type a response to the traveller…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 resize-none bg-white"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {req.status === 'pending' && (
                  <button onClick={() => sendResponse('in_progress')} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#0118A1] text-white rounded-lg hover:bg-[#0118A1]/90 disabled:opacity-50">
                    <Send size={11} /> Accept & Respond
                  </button>
                )}
                {req.status === 'in_progress' && (
                  <button onClick={() => sendResponse('in_progress')} disabled={saving || !response.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#0118A1] text-white rounded-lg hover:bg-[#0118A1]/90 disabled:opacity-50">
                    <Send size={11} /> Send
                  </button>
                )}
                <button onClick={() => sendResponse('resolved')} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle2 size={11} /> Resolve
                </button>
              </div>
            </div>
          )}

          {req.status === 'resolved' && (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-100">
              <CheckCircle2 size={13} /> Resolved {fmtTime(req.resolved_at)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ControlRoom() {
  const [requests, setRequests]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('active')  // active | all | resolved
  const [profile, setProfile]     = useState(null)  // current user role + org

  // Load current user profile once
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase
        .from('profiles')
        .select('role, org_id, full_name, organisations(name)')
        .eq('id', user.id)
        .single()
      setProfile(prof || null)
    }
    loadProfile()
  }, [])

  const loadRequests = async () => {
    if (profile === null) return   // wait for profile before querying

    let query = supabase
      .from('control_room_requests')
      .select('*, profiles:user_id(full_name, email)')
      .order('created_at', { ascending: false })

    // Corporate admin: scope to their org only
    if (profile?.role === 'admin' && profile?.org_id) {
      query = query.eq('org_id', profile.org_id)
    }

    if (filter === 'active') query = query.in('status', ['pending', 'in_progress'])
    if (filter === 'resolved') query = query.in('status', ['resolved', 'cancelled'])

    const { data, error } = await query
    if (error) console.error('Control room load error:', error)
    setRequests(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (profile !== null) loadRequests()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, profile])

  useEffect(() => {
    // Real-time subscription with reconnection on error/timeout
    let channel
    let reconnectTimer

    function subscribe() {
      channel = supabase
        .channel('control-room')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'control_room_requests',
        }, () => {
          loadRequests()
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[ControlRoom] realtime channel lost (%s) — reconnecting in 5s', status)
            supabase.removeChannel(channel)
            reconnectTimer = setTimeout(() => { loadRequests(); subscribe() }, 5000)
          }
        })
    }

    subscribe()
    // Fallback poll every 2 min in case WebSocket stays silently stale
    const poll = setInterval(loadRequests, 120_000)

    return () => {
      clearTimeout(reconnectTimer)
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  // Counts
  const pending    = requests.filter(r => r.status === 'pending').length
  const inProgress = requests.filter(r => r.status === 'in_progress').length
  const critical   = requests.filter(r => r.severity === 'critical' && r.status !== 'resolved').length

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: BRAND_BLUE }}>
              <Headphones size={20} color="white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {profile?.role === 'admin' ? 'Assistance Requests' : 'Live Control Room'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-gray-500">
                  {profile?.role === 'admin'
                    ? `${profile?.organisations?.name || 'Your organisation'} · staff assistance requests`
                    : '24/7 Global Monitoring Active'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={loadRequests}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending',     value: pending,    color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200' },
          { label: 'In Progress', value: inProgress, color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200' },
          { label: 'Critical',    value: critical,   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { key: 'active',   label: 'Active' },
          { key: 'all',      label: 'All' },
          { key: 'resolved', label: 'Resolved' },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-[#0118A1] text-white shadow-sm' : 'text-gray-600 hover:text-[#0118A1]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Request list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl border animate-pulse" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <Headphones size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">No {filter === 'resolved' ? 'resolved' : 'active'} requests</p>
          <p className="text-gray-300 text-xs mt-1">All travellers are safe</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <RequestCard key={req.id} req={req} onUpdate={loadRequests} />
          ))}
        </div>
      )}
    </Layout>
  )
}
