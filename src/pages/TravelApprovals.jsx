/**
 * /src/pages/TravelApprovals.jsx
 * Admin-only: review, approve, or reject travel requests.
 * On approval the backend auto-assigns training + check-in schedule.
 */

import { useEffect, useState } from 'react'
import {
  ClipboardList, CheckCircle2, XCircle, RefreshCw,
  User, MapPin, Calendar, BookOpen, Clock,
  ChevronDown, ChevronUp, Plane, Hotel, FileText, Phone,
} from 'lucide-react'
import Layout from '../components/Layout'
import SeverityBadge from '../components/SeverityBadge'
import { supabase } from '../lib/supabase'

const STATUS_TABS = ['pending', 'approved', 'rejected']

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateShort(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function tripDuration(depart, ret) {
  if (!depart || !ret) return ''
  const days = Math.ceil((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24))
  return `${days} day${days !== 1 ? 's' : ''}`
}

// ── Trip card ─────────────────────────────────────────────────────────────────
function TripCard({ trip, tab, assignments, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const traveller      = trip.profiles
  const completedCount = assignments.filter(a => a.completed).length
  const totalModules   = assignments.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">

      {/* ── Main row ── */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">

          {/* Left: trip info */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-semibold text-gray-900">{trip.trip_name}</span>
              <SeverityBadge severity={trip.risk_level} />
              {tab === 'pending' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700">
                  ⏳ Awaiting approval
                </span>
              )}
              {tab === 'approved' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 border border-green-200 text-green-700">
                  ✓ Approved
                </span>
              )}
              {tab === 'rejected' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 border border-red-200 text-red-700">
                  ✗ Rejected
                </span>
              )}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1">
                <User size={11} />
                {traveller?.full_name || traveller?.email || 'Unknown traveller'}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={11} />
                {trip.departure_city} → {trip.arrival_city}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {fmtDateShort(trip.depart_date)} — {fmtDateShort(trip.return_date)}
                <span className="text-gray-400 ml-1">({tripDuration(trip.depart_date, trip.return_date)})</span>
              </span>
              {trip.submitted_at && (
                <span className="flex items-center gap-1">
                  <Clock size={11} />
                  Submitted {fmtDate(trip.submitted_at)}
                </span>
              )}
            </div>

            {/* Rejection reason */}
            {tab === 'rejected' && trip.approval_notes && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-700">
                  <span className="font-semibold">Reason: </span>{trip.approval_notes}
                </p>
              </div>
            )}

            {/* Approval notes */}
            {tab === 'approved' && trip.approval_notes && (
              <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                <p className="text-xs text-blue-700">
                  <span className="font-semibold">Notes: </span>{trip.approval_notes}
                </p>
              </div>
            )}

            {/* Training progress (approved) */}
            {tab === 'approved' && totalModules > 0 && (
              <div className="mt-1">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={11} className="text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Pre-travel Training</span>
                  <span className="text-[10px] text-gray-400">{completedCount}/{totalModules} modules complete</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${totalModules ? Math.round(completedCount / totalModules * 100) : 0}%`,
                      background: completedCount === totalModules ? '#AACC00' : '#0118A1',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: actions or status */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            {tab === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={onReject}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <XCircle size={13} /> Reject
                </button>
                <button
                  onClick={onApprove}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg transition-colors"
                  style={{ background: '#AACC00', color: '#0118A1' }}
                >
                  <CheckCircle2 size={13} /> Approve
                </button>
              </div>
            )}
            {tab === 'approved' && (
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Approved</p>
                <p className="text-xs font-semibold text-green-700">{fmtDate(trip.approved_at)}</p>
              </div>
            )}
            {tab === 'rejected' && (
              <div className="text-right">
                <p className="text-[10px] text-gray-400">Rejected</p>
                <p className="text-xs font-semibold text-red-600">{fmtDate(trip.approved_at)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 flex items-center gap-1 text-[11px] text-[#0118A1] font-medium hover:underline"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Hide details' : 'View full trip details'}
        </button>
      </div>

      {/* ── Expanded details panel ── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Flight */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plane size={10} /> Flight Details
            </p>
            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Flight No.</span>
                <span className="font-medium">{trip.flight_number || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">From</span>
                <span className="font-medium">{trip.departure_city || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">To</span>
                <span className="font-medium">{trip.arrival_city || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Depart</span>
                <span className="font-medium">{fmtDate(trip.depart_date)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Return</span>
                <span className="font-medium">{fmtDate(trip.return_date)}</span>
              </div>
            </div>
          </div>

          {/* Accommodation */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Hotel size={10} /> Accommodation
            </p>
            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Hotel</span>
                <span className="font-medium">{trip.hotel_name || '—'}</span>
              </div>
            </div>
          </div>

          {/* Traveller */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User size={10} /> Traveller
            </p>
            <div className="space-y-1 text-xs text-gray-700">
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Name</span>
                <span className="font-medium">{traveller?.full_name || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-400 w-24 shrink-0">Email</span>
                <span className="font-medium">{traveller?.email || '—'}</span>
              </div>
            </div>
          </div>

          {/* Purpose / meetings */}
          {trip.meetings && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={10} /> Purpose / Meetings
              </p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{trip.meetings}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TravelApprovals() {
  const [trips, setTrips]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('pending')
  const [actionTrip, setActionTrip] = useState(null)
  const [actionType, setActionType] = useState(null)
  const [notes, setNotes]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast]           = useState({ msg: '', type: 'success' })
  const [trainingMap, setTrainingMap] = useState({})

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 6000)
  }

  const loadTrips = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('itineraries')
      .select('*, profiles:user_id(full_name, email, role)')
      .order('submitted_at', { ascending: false, nullsLast: true })

    if (error) console.error('load trips error:', error)
    const allTrips = data || []
    setTrips(allTrips)

    // Load training assignments for approved trips
    const approvedIds = allTrips.filter(t => t.approval_status === 'approved').map(t => t.id)
    if (approvedIds.length) {
      const { data: asgs } = await supabase
        .from('trip_training_assignments')
        .select('*')
        .in('trip_id', approvedIds)
      if (asgs) {
        const map = {}
        for (const a of asgs) {
          if (!map[a.trip_id]) map[a.trip_id] = []
          map[a.trip_id].push(a)
        }
        setTrainingMap(map)
      }
    }

    setLoading(false)
  }

  useEffect(() => { loadTrips() }, [])

  const openAction = (trip, type) => {
    setActionTrip(trip)
    setActionType(type)
    setNotes('')
  }

  const submitAction = async () => {
    setSubmitting(true)
    const { data: { session } } = await supabase.auth.getSession()

    try {
      const res = await fetch('/api/travel-approval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action:  actionType,
          trip_id: actionTrip.id,
          notes,
        }),
      })

      const result = await res.json()

      if (res.ok) {
        showToast(
          actionType === 'approve'
            ? `Trip approved — ${result.modules} training module${result.modules !== 1 ? 's' : ''} assigned, ${result.checkins} check-in${result.checkins !== 1 ? 's' : ''} scheduled`
            : 'Trip rejected',
          'success'
        )
      } else {
        showToast(`Error: ${result.error || 'Unknown error'}`, 'error')
      }
    } catch (err) {
      showToast(`Network error: ${err.message}`, 'error')
    }

    setSubmitting(false)
    setActionTrip(null)
    await loadTrips()
  }

  const counts = Object.fromEntries(
    STATUS_TABS.map(t => [t, trips.filter(x => (x.approval_status || 'pending') === t).length])
  )
  const filtered = trips.filter(t => (t.approval_status || 'pending') === tab)

  return (
    <Layout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Travel Approvals</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review travel requests and manage pre-travel requirements
          </p>
        </div>
        <button onClick={loadTrips}
          className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Toast */}
      {toast.msg && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border flex items-center gap-2 ${
          toast.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          {toast.type === 'error' ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        {STATUS_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-[#0118A1] text-white shadow-sm' : 'text-gray-600 hover:text-[#0118A1]'
            }`}>
            {t}
            {counts[t] > 0 && (
              <span className={`text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1 ${
                tab === t
                  ? 'bg-white text-[#0118A1]'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                {counts[t]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ClipboardList size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400 text-sm font-medium">No {tab} requests</p>
          {tab === 'pending' && (
            <p className="text-gray-300 text-xs mt-1">
              Travellers will appear here once they submit a trip for approval
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(trip => (
            <TripCard
              key={trip.id}
              trip={trip}
              tab={tab}
              assignments={trainingMap[trip.id] || []}
              onApprove={() => openAction(trip, 'approve')}
              onReject={() => openAction(trip, 'reject')}
            />
          ))}
        </div>
      )}

      {/* Action Modal */}
      {actionTrip && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <h2 className={`text-lg font-bold mb-0.5 ${actionType === 'approve' ? 'text-gray-900' : 'text-red-700'}`}>
              {actionType === 'approve' ? '✓ Approve Trip' : '✗ Reject Trip'}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              <span className="font-medium text-gray-700">{actionTrip.trip_name}</span>
              {' · '}{actionTrip.departure_city} → {actionTrip.arrival_city}
            </p>

            {actionType === 'approve' && (
              <div className="mb-4 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wide">On approval, the system will:</p>
                <ul className="text-xs text-blue-700 space-y-1">
                  <li className="flex items-start gap-2">
                    <BookOpen size={11} className="shrink-0 mt-0.5" />
                    Assign required training modules ({actionTrip.risk_level} risk level)
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={11} className="shrink-0 mt-0.5" />
                    Generate a randomised check-in schedule for the trip
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock size={11} className="shrink-0 mt-0.5" />
                    Schedule arrival check-in for {new Date(actionTrip.depart_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </li>
                </ul>
              </div>
            )}

            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              {actionType === 'reject' ? 'Reason for rejection' : 'Notes for traveller'}
              {actionType === 'reject' && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0118A1]/20 resize-none"
              placeholder={
                actionType === 'approve'
                  ? 'Any conditions or guidance for the traveller…'
                  : 'Explain why the request cannot be approved…'
              }
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setActionTrip(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                disabled={submitting || (actionType === 'reject' && !notes.trim())}
                className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl transition-colors disabled:opacity-50 ${
                  actionType === 'approve'
                    ? 'bg-[#AACC00] text-[#0118A1] hover:bg-[#99bb00]'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {submitting
                  ? 'Processing…'
                  : actionType === 'approve' ? 'Approve Trip' : 'Reject Trip'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
