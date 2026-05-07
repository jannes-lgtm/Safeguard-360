/**
 * /src/pages/Assistance.jsx
 * Traveller-facing Live Control Room — submit assistance requests,
 * track status, and message back and forth with operators.
 * Accessible to roles: traveller, solo, admin (when travelling).
 */

import { useEffect, useState } from 'react'
import {
  Headphones, MapPin, Navigation, Send, CheckCircle2,
  Clock, AlertCircle, ChevronDown, ChevronUp, Plus, X,
} from 'lucide-react'
import Layout from '../components/Layout'
import W3WAddress from '../components/W3WAddress'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

const REQUEST_TYPES = [
  { key: 'medical',           label: 'Medical Emergency',   icon: '🏥', desc: 'Illness, injury, hospital' },
  { key: 'security',          label: 'Security Threat',     icon: '🛡️', desc: 'Threat, violence, crime' },
  { key: 'evacuation',        label: 'Evacuation Needed',   icon: '🚨', desc: 'Political unrest, disaster' },
  { key: 'travel_disruption', label: 'Travel Disruption',   icon: '✈️', desc: 'Cancelled flights, stranded' },
  { key: 'lost_documents',    label: 'Lost Documents',      icon: '📄', desc: 'Passport, ID, visa' },
  { key: 'accommodation',     label: 'Accommodation',       icon: '🏨', desc: 'No room, unsafe hotel' },
  { key: 'legal',             label: 'Legal Assistance',    icon: '⚖️', desc: 'Detained, legal trouble' },
  { key: 'other',             label: 'Other',               icon: '💬', desc: 'Any other situation' },
]

const SEVERITY_OPTIONS = [
  { key: 'critical', label: 'Critical', desc: 'Life threatening', color: 'border-red-400 bg-red-50 text-red-700' },
  { key: 'high',     label: 'High',     desc: 'Urgent help needed', color: 'border-amber-400 bg-amber-50 text-amber-700' },
  { key: 'medium',   label: 'Medium',   desc: 'Need assistance soon', color: 'border-blue-400 bg-blue-50 text-blue-700' },
  { key: 'low',      label: 'Low',      desc: 'General query', color: 'border-gray-300 bg-gray-50 text-gray-600' },
]

const STATUS_CONFIG = {
  pending:     { label: 'Awaiting operator',  color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: Clock },
  in_progress: { label: 'Operator connected', color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200',  icon: Headphones },
  resolved:    { label: 'Resolved',           color: 'text-green-600', bg: 'bg-green-50 border-green-200', icon: CheckCircle2 },
  cancelled:   { label: 'Cancelled',          color: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200',  icon: X },
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

// ── Active request card ───────────────────────────────────────────────────────
function ActiveRequestCard({ req, userId, onUpdate }) {
  const [open, setOpen]     = useState(true)
  const [reply, setReply]   = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState([])

  const stat = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
  const StatusIcon = stat.icon
  const type = REQUEST_TYPES.find(t => t.key === req.request_type) || REQUEST_TYPES[7]

  const loadMessages = async () => {
    const { data } = await supabase
      .from('control_room_messages')
      .select('*')
      .eq('request_id', req.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  useEffect(() => { if (open) loadMessages() }, [open])

  const sendReply = async () => {
    if (!reply.trim()) return
    setSending(true)
    await supabase.from('control_room_messages').insert({
      request_id:  req.id,
      sender_id:   userId,
      sender_role: 'traveller',
      message:     reply.trim(),
    })
    setSending(false)
    setReply('')
    loadMessages()
  }

  const cancelRequest = async () => {
    await supabase.from('control_room_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', req.id)
    onUpdate()
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${stat.bg}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={() => setOpen(p => !p)}>
        <span className="text-xl shrink-0">{type.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-900">{type.label}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stat.bg} ${stat.color}`}>
              {stat.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{timeAgo(req.created_at)}</p>
        </div>
        <StatusIcon size={14} className={stat.color} />
        {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-black/5 bg-white/70 px-4 py-4 space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">{req.description}</p>

          {/* Operator response notes */}
          {req.response_notes && (
            <div className="bg-[#0118A1]/5 border border-[#0118A1]/10 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold text-[#0118A1] mb-1 uppercase tracking-wide">Operator response</p>
              <p className="text-sm text-gray-800">{req.response_notes}</p>
            </div>
          )}

          {/* Message thread */}
          {messages.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {messages.map(m => (
                <div key={m.id} className={`flex gap-2 ${m.sender_role === 'traveller' ? 'flex-row-reverse' : ''}`}>
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    m.sender_role === 'traveller'
                      ? 'rounded-tr-none text-white'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                  }`}
                  style={m.sender_role === 'traveller' ? { background: BRAND_BLUE } : {}}>
                    {m.sender_role === 'operator' && (
                      <p className="text-[9px] font-bold text-gray-400 mb-0.5">Control Room</p>
                    )}
                    <p>{m.message}</p>
                    <p className={`text-[9px] mt-0.5 ${m.sender_role === 'traveller' ? 'text-white/60 text-right' : 'text-gray-400'}`}>
                      {timeAgo(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reply input */}
          {req.status !== 'resolved' && req.status !== 'cancelled' && (
            <div className="flex gap-2">
              <input
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendReply()}
                placeholder="Send a message to the control room…"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 bg-white"
              />
              <button onClick={sendReply} disabled={sending || !reply.trim()}
                className="px-3 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ background: BRAND_BLUE }}>
                <Send size={14} />
              </button>
            </div>
          )}

          {req.status === 'pending' && (
            <button onClick={cancelRequest}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              Cancel request
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Assistance() {
  const [profile, setProfile]     = useState(null)
  const [activeTrip, setActiveTrip] = useState(null)
  const [myRequests, setMyRequests] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)

  // Form state
  const [reqType, setReqType]     = useState('')
  const [severity, setSeverity]   = useState('medium')
  const [description, setDescription] = useState('')
  const [contactMethod, setContactMethod] = useState('in_app')
  const [contactDetail, setContactDetail] = useState('')
  const [gpsPos, setGpsPos]       = useState(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]
    const [{ data: prof }, { data: trip }, { data: reqs }] = await Promise.all([
      supabase.from('profiles').select('*, organisations(name)').eq('id', user.id).single(),
      supabase.from('itineraries').select('*')
        .eq('user_id', user.id)
        .lte('depart_date', today)
        .gte('return_date', today)
        .limit(1).single(),
      supabase.from('control_room_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setProfile({ ...prof, id: user.id, email: user.email })
    setActiveTrip(trip || null)
    setMyRequests(reqs || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // Auto-capture GPS
    if (navigator.geolocation) {
      setGpsLoading(true)
      navigator.geolocation.getCurrentPosition(
        p => { setGpsPos(p.coords); setGpsLoading(false) },
        () => setGpsLoading(false),
        { enableHighAccuracy: true, timeout: 8000 }
      )
    }
  }, [])

  const submitRequest = async () => {
    if (!reqType || !description.trim()) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('control_room_requests').insert({
      user_id:        user.id,
      org_id:         profile?.org_id || null,
      request_type:   reqType,
      severity,
      description:    description.trim(),
      latitude:       gpsPos?.latitude || null,
      longitude:      gpsPos?.longitude || null,
      location_label: gpsPos ? `${gpsPos.latitude.toFixed(4)}, ${gpsPos.longitude.toFixed(4)}` : null,
      trip_id:        activeTrip?.id || null,
      trip_name:      activeTrip?.trip_name || null,
      arrival_city:   activeTrip?.arrival_city || null,
      contact_method: contactMethod,
      contact_detail: contactDetail.trim() || null,
      status:         'pending',
    })

    setSubmitting(false)
    setSubmitted(true)
    setShowForm(false)
    setReqType('')
    setSeverity('medium')
    setDescription('')
    setContactDetail('')
    setTimeout(() => setSubmitted(false), 5000)
    await loadData()
  }

  const openRequests = myRequests.filter(r => r.status !== 'resolved' && r.status !== 'cancelled')
  const pastRequests = myRequests.filter(r => r.status === 'resolved' || r.status === 'cancelled')

  return (
    <Layout>
      {/* Hero header */}
      <div className="rounded-2xl p-6 mb-6 text-white"
        style={{ background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #0a24cc 100%)` }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Headphones size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Live Control Room</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-white/70">Operators available 24/7</span>
            </div>
          </div>
        </div>
        <p className="text-sm text-white/70 mb-4">
          Get immediate assistance from our operations team wherever you are in the world.
        </p>
        {activeTrip && (
          <div className="flex items-center gap-2 text-xs text-white/60 bg-white/10 rounded-lg px-3 py-2 w-fit">
            <MapPin size={11} />
            Active trip: <span className="font-semibold text-white/90">{activeTrip.trip_name}</span>
            · {activeTrip.arrival_city}
          </div>
        )}
      </div>

      {/* Success toast */}
      {submitted && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> Request submitted — an operator will respond shortly.
        </div>
      )}

      {/* Open requests */}
      {openRequests.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Your Active Requests</p>
          <div className="space-y-3">
            {openRequests.map(req => (
              <ActiveRequestCard
                key={req.id}
                req={req}
                userId={profile?.id}
                onUpdate={loadData}
              />
            ))}
          </div>
        </div>
      )}

      {/* Request new assistance */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-[#0118A1] hover:text-[#0118A1] transition-colors text-sm font-medium"
        >
          <Plus size={16} /> Request Assistance
        </button>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Request Assistance</h2>
            <button onClick={() => setShowForm(false)}
              className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          {/* Type grid */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              What do you need help with? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {REQUEST_TYPES.map(t => (
                <button key={t.key} onClick={() => setReqType(t.key)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                    reqType === t.key
                      ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}>
                  <span className="text-lg shrink-0">{t.icon}</span>
                  <div>
                    <p className="text-xs font-semibold leading-tight">{t.label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              How urgent? <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SEVERITY_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setSeverity(s.key)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition-all ${
                    severity === s.key ? s.color + ' border-2' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <p className="text-xs font-bold">{s.label}</p>
                  <p className="text-[10px] text-current opacity-70">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              Describe your situation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Tell us what's happening, where you are, and what help you need…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 resize-none"
            />
          </div>

          {/* GPS status */}
          <div className={`rounded-lg p-2.5 ${gpsPos ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
            <div className={`flex items-center gap-2 text-xs ${gpsPos ? 'text-green-700' : 'text-gray-500'}`}>
              <Navigation size={11} />
              {gpsLoading ? 'Capturing location…' :
               gpsPos ? `Location captured (±${Math.round(gpsPos.accuracy || 0)}m) — will be shared with operator` :
               'Location unavailable — request will proceed without GPS'}
            </div>
            {gpsPos && (
              <div className="mt-1.5 ml-4">
                <W3WAddress lat={gpsPos.latitude} lng={gpsPos.longitude} />
              </div>
            )}
          </div>

          {/* Contact preference */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              How should we contact you?
            </label>
            <div className="flex gap-2 flex-wrap">
              {['in_app', 'phone', 'whatsapp', 'email'].map(m => (
                <button key={m} onClick={() => setContactMethod(m)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium capitalize transition-colors ${
                    contactMethod === m
                      ? 'bg-[#0118A1] text-white border-[#0118A1]'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {m === 'in_app' ? 'In-App' : m === 'whatsapp' ? 'WhatsApp' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            {contactMethod !== 'in_app' && (
              <input
                value={contactDetail}
                onChange={e => setContactDetail(e.target.value)}
                placeholder={contactMethod === 'email' ? 'Your email address' : 'Your phone number'}
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20"
              />
            )}
          </div>

          {/* Submit */}
          <button
            onClick={submitRequest}
            disabled={submitting || !reqType || !description.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
            style={{ background: BRAND_GREEN, color: BRAND_BLUE }}
          >
            {submitting ? 'Submitting…' : 'Submit Request — Operators Notified'}
          </button>
        </div>
      )}

      {/* Past requests */}
      {pastRequests.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Past Requests</p>
          <div className="space-y-2">
            {pastRequests.map(req => {
              const type = REQUEST_TYPES.find(t => t.key === req.request_type) || REQUEST_TYPES[7]
              const stat = STATUS_CONFIG[req.status] || STATUS_CONFIG.resolved
              return (
                <div key={req.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <span className="text-base">{type.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{type.label}</p>
                    <p className="text-xs text-gray-400">{timeAgo(req.created_at)}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stat.bg} ${stat.color}`}>
                    {stat.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Layout>
  )
}
