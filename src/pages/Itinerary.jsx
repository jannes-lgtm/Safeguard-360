import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Plane, Hotel, AlertTriangle, Pencil, Trash2,
  CheckCircle2, BookOpen, Lock, ChevronDown, ChevronUp,
  Sparkles, Send, Upload, Plus, X, Edit3,
} from 'lucide-react'
import Layout from '../components/Layout'
import SeverityBadge from '../components/SeverityBadge'
import FlightStatus from '../components/FlightStatus'
import CountryRisk from '../components/CountryRisk'
import ItineraryUpload from '../components/ItineraryUpload'
import { supabase } from '../lib/supabase'
import { toIcao, isKnownIata } from '../lib/airlineCodes'
import { resolveCountry } from '../lib/cityToCountry'

const HIGH_RISK_CRITICAL = ['lagos', 'kinshasa', 'mogadishu', 'kabul', 'juba', 'khartoum', 'tripoli', 'baghdad']
const HIGH_RISK_HIGH     = ['nairobi', 'kampala', 'harare', 'lusaka', 'moscow', 'kyiv', 'tehran', 'karachi']

function getRiskLevel(city) {
  const c = city.toLowerCase().trim()
  if (HIGH_RISK_CRITICAL.some(r => c === r || c.startsWith(r + ' ') || c.endsWith(' ' + r))) return 'Critical'
  if (HIGH_RISK_HIGH.some(r => c === r || c.startsWith(r + ' ') || c.endsWith(' ' + r))) return 'High'
  return 'Medium'
}

const emptyForm = {
  trip_name: '', flight_number: '', departure_city: '', arrival_city: '',
  depart_date: '', return_date: '', hotel_name: '', meetings: '', checkin_interval_days: 1,
}

const FIELD_LABELS = {
  trip_name: 'Trip name', departure_city: 'From', arrival_city: 'To',
  depart_date: 'Departs', return_date: 'Returns',
  flight_number: 'Flight', hotel_name: 'Hotel', meetings: 'Notes',
}
const REQUIRED_FIELDS = ['trip_name', 'departure_city', 'arrival_city', 'depart_date', 'return_date']
const AI_GREETING = "Hi! I'm your trip planning assistant. Let's get your trip set up. Where are you heading, and when do you depart?"

function parseTripData(text) {
  const idx = text.lastIndexOf('<<TRIP_DATA:')
  if (idx === -1) return null
  const end = text.lastIndexOf('>>')
  if (end === -1 || end <= idx) return null
  try { return JSON.parse(text.slice(idx + 12, end)) } catch { return null }
}

function stripTripData(text) {
  const idx = text.lastIndexOf('<<TRIP_DATA:')
  return (idx === -1 ? text : text.slice(0, idx)).trim()
}

function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

const STATUS_STYLE = {
  Active:    { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
  Upcoming:  { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
  Completed: { bg: '#F9FAFB', text: '#6B7280', border: '#E5E7EB', dot: '#9CA3AF' },
}

const inputCls = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

export default function Itinerary() {
  const navigate                      = useNavigate()
  const [trips, setTrips]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [submitting, setSubmitting]   = useState(false)
  const [toast, setToast]             = useState('')
  const [userId, setUserId]           = useState(null)
  const [session, setSession]         = useState(null)
  const [profile, setProfile]         = useState(null)
  const [editingId, setEditingId]     = useState(null)
  const [deletingId, setDeletingId]   = useState(null)
  const [tripAlertMap, setTripAlertMap]       = useState({})
  const [showUpload, setShowUpload]           = useState(false)
  const [trainingMap, setTrainingMap]         = useState({})
  const [debriefSet, setDebriefSet]           = useState(new Set())
  const [expandedTraining, setExpandedTraining] = useState({})
  const [form, setForm]               = useState(emptyForm)

  // panel / mode
  const [showForm, setShowForm]       = useState(false)
  const [planMode, setPlanMode]       = useState('ai')   // 'ai' | 'manual'
  const [activeTab, setActiveTab]     = useState('Flight')

  // AI planner
  const [aiMessages, setAiMessages]     = useState([{ role: 'assistant', text: AI_GREETING }])
  const [aiInput, setAiInput]           = useState('')
  const [aiThinking, setAiThinking]     = useState(false)
  const [detectedFields, setDetectedFields] = useState({})
  const [aiReady, setAiReady]           = useState(false)
  const aiBottomRef = useRef(null)

  useEffect(() => { loadTrips() }, [])

  useEffect(() => {
    if (aiMessages.length > 1) aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const loadTrips = async ({ silent = false } = {}) => {
    setLoadError(null)
    if (!silent) setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setSession(session)
      const uid = session.user.id
      setUserId(uid)

      const { data: trips, error: tripsError } = await supabase
        .from('itineraries').select('*').eq('user_id', uid).order('depart_date', { ascending: true })
      if (tripsError) setLoadError('Could not load your trips. Please refresh.')
      setTrips(trips || [])

      const { data: taData } = await supabase
        .from('trip_alerts').select('id, itinerary_id, alert_type, severity, title, is_read')
        .eq('user_id', uid).eq('is_read', false).order('severity', { ascending: false })
      if (taData) {
        const map = {}
        for (const ta of taData) {
          if (!map[ta.itinerary_id]) map[ta.itinerary_id] = []
          map[ta.itinerary_id].push(ta)
        }
        setTripAlertMap(map)
      }

      const tripIds = (trips || []).map(t => t.id)
      if (tripIds.length) {
        const { data: asgs } = await supabase
          .from('trip_training_assignments').select('*').in('trip_id', tripIds).order('module_order', { ascending: true })
        if (asgs) {
          const tmap = {}
          for (const a of asgs) {
            if (!tmap[a.trip_id]) tmap[a.trip_id] = []
            tmap[a.trip_id].push(a)
          }
          setTrainingMap(tmap)
        }
      }

      if (tripIds.length) {
        const { data: debriefs } = await supabase
          .from('trip_debriefs')
          .select('trip_id')
          .in('trip_id', tripIds)
          .eq('user_id', uid)
        setDebriefSet(new Set((debriefs || []).map(d => d.trip_id)))
      }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', uid).single()
      setProfile(prof || null)
    } catch {
      setLoadError('Something went wrong loading your trips.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault()
    setSubmitting(true)

    const riskLevel  = getRiskLevel(form.arrival_city)
    const now        = new Date()
    const departDate = new Date(form.depart_date)
    const returnDate = new Date(form.return_date)
    let status = 'Upcoming'
    if (now >= departDate && now <= returnDate) status = 'Active'
    else if (now > returnDate) status = 'Completed'

    const tripData = {
      trip_name: form.trip_name, flight_number: form.flight_number,
      departure_city: form.departure_city, arrival_city: form.arrival_city,
      depart_date: form.depart_date, return_date: form.return_date,
      hotel_name: form.hotel_name, meetings: form.meetings,
      risk_level: riskLevel, status,
      checkin_interval_days: Number(form.checkin_interval_days) || 1,
    }

    const { data: { session } } = await supabase.auth.getSession()
    const currentUserId = session?.user?.id
    const isSolo        = profile?.role === 'solo'
    let savedTripId     = null

    if (editingId) {
      const { error } = await supabase.from('itineraries').update(tripData).eq('id', editingId)
      if (error) { setSubmitting(false); return }
    } else {
      const approvalFields = isSolo
        ? { approval_status: 'approved', approval_required: false, submitted_at: new Date().toISOString() }
        : { approval_status: 'pending',  approval_required: true,  submitted_at: new Date().toISOString() }
      const { data: inserted, error } = await supabase.from('itineraries')
        .insert({ ...tripData, user_id: currentUserId, ...approvalFields }).select('id').single()
      if (error) { setSubmitting(false); return }
      savedTripId = inserted?.id

      if (isSolo && savedTripId) {
        const intervalDays = Number(form.checkin_interval_days) || 1
        const checkins = [{
          trip_id: savedTripId, user_id: currentUserId, checkin_type: 'arrival',
          due_at: departDate.toISOString(), window_hours: 24, label: 'Arrival check-in', completed: false,
        }]
        const cursor = new Date(departDate)
        cursor.setDate(cursor.getDate() + intervalDays)
        let count = 1
        while (cursor < returnDate) {
          checkins.push({
            trip_id: savedTripId, user_id: currentUserId, checkin_type: 'scheduled',
            due_at: new Date(cursor).toISOString(), window_hours: 12, label: `Check-in ${count}`, completed: false,
          })
          cursor.setDate(cursor.getDate() + intervalDays)
          count++
        }
        const lastDue  = checkins[checkins.length - 1]?.due_at
        const returnMs = returnDate.getTime()
        if (!lastDue || Math.abs(new Date(lastDue).getTime() - returnMs) > 12 * 3600 * 1000) {
          checkins.push({
            trip_id: savedTripId, user_id: currentUserId, checkin_type: 'return',
            due_at: returnDate.toISOString(), window_hours: 12, label: 'Return check-in', completed: false,
          })
        }
        await supabase.from('scheduled_checkins').insert(checkins)
        try {
          const { data: { session: s } } = await supabase.auth.getSession()
          if (s?.access_token) {
            await fetch('/api/notify-trip-contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
              body: JSON.stringify({ trip_id: savedTripId }),
            })
          }
        } catch {}
      }

      if (!isSolo && savedTripId) {
        try {
          const { data: { session: s } } = await supabase.auth.getSession()
          if (s?.access_token) {
            await fetch('/api/notify-trip-submitted', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
              body: JSON.stringify({ trip_id: savedTripId }),
            })
          }
        } catch (notifyErr) {
          console.warn('[notify-trip-submitted] Failed silently:', notifyErr)
        }
      }
    }

    const msg = editingId ? 'Trip updated successfully.'
      : isSolo  ? 'Trip saved! Your check-in schedule has been created. Stay safe.'
      : 'Trip submitted for approval. We\'ll monitor your journey and alert you to any disruptions.'

    setToast(msg)
    resetPanel()
    await loadTrips()
    setTimeout(() => setToast(''), 5000)
    setSubmitting(false)
  }

  const handleDelete = async (tripId) => {
    const { error } = await supabase.from('itineraries').delete().eq('id', tripId)
    if (!error) {
      setDeletingId(null)
      setToast('Trip deleted.')
      await loadTrips()
      setTimeout(() => setToast(''), 4000)
    }
  }

  const startEdit = (trip) => {
    setEditingId(trip.id)
    setForm({
      trip_name: trip.trip_name || '', flight_number: trip.flight_number || '',
      departure_city: trip.departure_city || '', arrival_city: trip.arrival_city || '',
      depart_date: trip.depart_date || '', return_date: trip.return_date || '',
      hotel_name: trip.hotel_name || '', meetings: trip.meetings || '',
      checkin_interval_days: trip.checkin_interval_days || 1,
    })
    setPlanMode('manual')
    setShowForm(true)
    setTimeout(() => document.getElementById('trip-form')?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const resetPanel = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(false)
    setAiMessages([{ role: 'assistant', text: AI_GREETING }])
    setDetectedFields({})
    setAiReady(false)
    setAiInput('')
  }

  const openNewTrip = () => {
    setEditingId(null)
    setForm(emptyForm)
    setPlanMode('ai')
    setShowForm(true)
    setAiMessages([{ role: 'assistant', text: AI_GREETING }])
    setDetectedFields({})
    setAiReady(false)
    setAiInput('')
  }

  // AI planner
  const sendToAI = async () => {
    const text = aiInput.trim()
    if (!text || aiThinking) return
    setAiInput('')
    const userMsg = { role: 'user', text }
    const history = [...aiMessages, userMsg]
    setAiMessages(history)
    setAiThinking(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          message: text,
          history,
          context: { mode: 'trip', userId, name: profile?.full_name },
        }),
      })
      const data = await res.json()
      const rawText     = data.reply || ''
      const tripData    = parseTripData(rawText)
      const displayText = stripTripData(rawText)

      setAiMessages(prev => [...prev, { role: 'assistant', text: displayText }])

      if (tripData) {
        setDetectedFields(prev => {
          const merged = { ...prev }
          Object.entries(tripData).forEach(([k, v]) => { if (v) merged[k] = v })
          setForm(f => ({ ...f, ...merged }))
          setAiReady(REQUIRED_FIELDS.every(k => merged[k]))
          return merged
        })
      }
    } catch {
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I had trouble connecting. Please try again.' }])
    }
    setAiThinking(false)
  }

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <Layout>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {profile?.role === 'solo' ? 'My Trips' : 'My Itinerary'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {profile?.role === 'solo' ? 'Plan your trips and track your safety on the go' : 'View and manage your travel plans'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#0118A1] text-[#0118A1] hover:bg-[#EEF1FF] transition-colors">
            <Upload size={14} /> Upload
          </button>
          <button onClick={openNewTrip}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: '#0118A1' }}>
            <Plus size={14} /> Plan a trip
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-2xl text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      {/* ── Trip planner panel ── */}
      {showForm && (
        <div id="trip-form" className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Panel header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                {editingId ? 'Edit trip' : 'Plan a new trip'}
              </h2>
              {!editingId && (
                <p className="text-xs text-gray-400 mt-0.5">Use AI to fill in your details, or enter them manually</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!editingId && (
                <div className="flex items-center bg-gray-100 rounded-xl p-1">
                  <button onClick={() => setPlanMode('ai')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${planMode === 'ai' ? 'bg-white text-[#0118A1] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Sparkles size={11} /> AI Planner
                  </button>
                  <button onClick={() => setPlanMode('manual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${planMode === 'manual' ? 'bg-white text-[#0118A1] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    <Edit3 size={11} /> Manual
                  </button>
                </div>
              )}
              <button onClick={resetPanel} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── AI Planner ── */}
          {planMode === 'ai' && !editingId && (
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">

              {/* Chat */}
              <div className="flex flex-col" style={{ height: 440 }}>
                <div className="px-5 py-3 flex items-center justify-between shrink-0"
                  style={{ background: 'linear-gradient(135deg,#0118A1,#0A3D6B)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.12)' }}>
                      <Sparkles size={13} color="#AACC00" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white leading-none">AI Trip Planner</p>
                      <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Powered by Safeguard 360</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#AACC00] animate-pulse" />
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>Active</span>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: '#F8F9FC' }}>
                  {aiMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {m.role === 'assistant' && (
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5" style={{ background: '#EEF1FF' }}>
                          <Sparkles size={10} color="#0118A1" />
                        </div>
                      )}
                      {m.role === 'assistant' ? (
                        <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm text-xs text-gray-800 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: `<p style="margin:0">${mdToHtml(m.text)}</p>` }} />
                      ) : (
                        <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-xs text-white leading-relaxed"
                          style={{ background: '#0118A1' }}>
                          {m.text}
                        </div>
                      )}
                    </div>
                  ))}
                  {aiThinking && (
                    <div className="flex justify-start">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mr-2" style={{ background: '#EEF1FF' }}>
                        <Sparkles size={10} color="#0118A1" />
                      </div>
                      <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-sm bg-white border border-gray-100 shadow-sm flex items-center gap-1 h-9">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                  <div ref={aiBottomRef} />
                </div>

                {/* Input */}
                <div className="p-3 border-t border-gray-100 bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent"
                      placeholder="Type your answer…"
                      value={aiInput}
                      onChange={e => setAiInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendToAI()}
                      disabled={aiThinking}
                    />
                    <button onClick={sendToAI} disabled={!aiInput.trim() || aiThinking}
                      className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40"
                      style={{ background: '#0118A1' }}>
                      <Send size={14} color="white" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Detected fields + submit */}
              <div className="flex flex-col p-5 bg-white" style={{ minHeight: 440 }}>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Detected trip details</p>
                  {Object.keys(detectedFields).length > 0 && (
                    <button onClick={() => { setDetectedFields({}); setForm(emptyForm); setAiReady(false) }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                  )}
                </div>

                {Object.keys(detectedFields).length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#EEF1FF' }}>
                      <MapPin size={20} color="#0118A1" />
                    </div>
                    <p className="text-sm font-semibold text-gray-400">Chat with the AI planner</p>
                    <p className="text-xs text-gray-300 mt-1">Trip details will appear here as you chat</p>
                  </div>
                ) : (
                  <div className="flex-1 space-y-1.5">
                    {Object.entries(FIELD_LABELS).map(([key, label]) => {
                      const val = detectedFields[key]
                      const required = REQUIRED_FIELDS.includes(key)
                      return (
                        <div key={key} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                          <span className="text-xs font-semibold text-gray-400 w-20 shrink-0">{label}</span>
                          {val ? (
                            <>
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: '#EEF1FF', color: '#0118A1' }}>{val}</span>
                              {required && <CheckCircle2 size={12} className="text-green-500 shrink-0 ml-auto" />}
                            </>
                          ) : (
                            <span className="text-xs italic text-gray-200">{required ? 'Required' : 'Optional'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Check-in frequency for solo */}
                {profile?.role === 'solo' && Object.keys(detectedFields).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Check-in frequency</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[{ label: 'Daily', v: 1 }, { label: 'Every 2 days', v: 2 }, { label: 'Every 3 days', v: 3 }, { label: 'Weekly', v: 7 }].map(opt => (
                        <button key={opt.v} type="button"
                          onClick={() => setForm(p => ({ ...p, checkin_interval_days: opt.v }))}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
                          style={form.checkin_interval_days === opt.v
                            ? { background: '#0118A1', color: '#fff', borderColor: '#0118A1' }
                            : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit */}
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {aiReady ? (
                    <button onClick={handleSubmit} disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                      style={{ background: '#AACC00', color: '#0118A1' }}>
                      {submitting
                        ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />Saving…</>
                        : <><CheckCircle2 size={15} />{profile?.role === 'solo' ? 'Save trip' : 'Submit for approval'}</>}
                    </button>
                  ) : (
                    <div className="w-full py-3 rounded-xl text-xs text-gray-400 text-center border border-dashed border-gray-200 bg-gray-50">
                      {Object.keys(detectedFields).length === 0
                        ? 'Tell the AI about your trip to get started'
                        : `Still need: ${REQUIRED_FIELDS.filter(k => !detectedFields[k]).map(k => FIELD_LABELS[k]).join(', ')}`}
                    </div>
                  )}
                  {Object.keys(detectedFields).length > 0 && !aiReady && (
                    <button onClick={() => setPlanMode('manual')}
                      className="w-full mt-2 text-xs py-1 transition-colors hover:underline"
                      style={{ color: '#0118A1' }}>
                      Switch to manual entry →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Manual form ── */}
          {(planMode === 'manual' || editingId) && (
            <div className="p-6">
              {!editingId && (
                <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
                  {['Flight', 'Hotel', 'Meeting', 'Ground transport'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      style={activeTab === tab ? { color: '#0118A1' } : {}}>
                      {tab}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                {/* Flight / edit mode */}
                {(activeTab === 'Flight' || editingId) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Trip name *</label>
                      <input className={inputCls} placeholder="e.g. Lagos Board Meeting" {...f('trip_name')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Flight number</label>
                      <input className={inputCls} placeholder="e.g. BA001 or BAW001" {...f('flight_number')} />
                      {form.flight_number && isKnownIata(form.flight_number) && (
                        <p className="mt-1 text-xs text-blue-600">Will track as ICAO <strong>{toIcao(form.flight_number)}</strong></p>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>Departure city *</label>
                      <input className={inputCls} placeholder="e.g. Johannesburg" {...f('departure_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Arrival city *</label>
                      <input className={inputCls} placeholder="e.g. Lagos" {...f('arrival_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Departure date *</label>
                      <input type="date" className={inputCls} {...f('depart_date')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Return date *</label>
                      <input type="date" className={inputCls} {...f('return_date')} required />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Hotel name</label>
                      <input className={inputCls} placeholder="e.g. Eko Hotel & Suites" {...f('hotel_name')} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Notes</label>
                      <textarea className={`${inputCls} h-20 resize-none`} placeholder="Meeting details, contacts…" {...f('meetings')} />
                    </div>
                    {profile?.role === 'solo' && (
                      <div className="md:col-span-2">
                        <label className={labelCls}>Check-in frequency</label>
                        <div className="flex flex-wrap gap-2">
                          {[{ label: 'Daily', v: 1 }, { label: 'Every 2 days', v: 2 }, { label: 'Every 3 days', v: 3 }, { label: 'Every 4 days', v: 4 }, { label: 'Weekly', v: 7 }].map(opt => (
                            <button key={opt.v} type="button"
                              onClick={() => setForm(p => ({ ...p, checkin_interval_days: opt.v }))}
                              className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors"
                              style={form.checkin_interval_days === opt.v
                                ? { background: '#0118A1', color: '#fff', borderColor: '#0118A1' }
                                : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'Hotel' && !editingId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Trip name *</label>
                      <input className={inputCls} placeholder="e.g. Nairobi Conference" {...f('trip_name')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Hotel name *</label>
                      <input className={inputCls} placeholder="e.g. Radisson Blu" {...f('hotel_name')} required />
                    </div>
                    <div>
                      <label className={labelCls}>City *</label>
                      <input className={inputCls} placeholder="e.g. Nairobi" {...f('arrival_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Check-in date *</label>
                      <input type="date" className={inputCls} {...f('depart_date')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Check-out date *</label>
                      <input type="date" className={inputCls} {...f('return_date')} required />
                    </div>
                  </div>
                )}

                {activeTab === 'Meeting' && !editingId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Trip name *</label>
                      <input className={inputCls} placeholder="e.g. Accra Client Visit" {...f('trip_name')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Meeting city *</label>
                      <input className={inputCls} placeholder="e.g. Accra" {...f('arrival_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Departure city *</label>
                      <input className={inputCls} placeholder="e.g. Cape Town" {...f('departure_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Meeting date *</label>
                      <input type="date" className={inputCls} {...f('depart_date')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Return date *</label>
                      <input type="date" className={inputCls} {...f('return_date')} required />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Meeting details</label>
                      <textarea className={`${inputCls} h-20 resize-none`} placeholder="Who, where, purpose…" {...f('meetings')} />
                    </div>
                  </div>
                )}

                {activeTab === 'Ground transport' && !editingId && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Trip name *</label>
                      <input className={inputCls} placeholder="e.g. Durban Road Trip" {...f('trip_name')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Departure city *</label>
                      <input className={inputCls} placeholder="e.g. Durban" {...f('departure_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Destination city *</label>
                      <input className={inputCls} placeholder="e.g. Pietermaritzburg" {...f('arrival_city')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Departure date *</label>
                      <input type="date" className={inputCls} {...f('depart_date')} required />
                    </div>
                    <div>
                      <label className={labelCls}>Return date *</label>
                      <input type="date" className={inputCls} {...f('return_date')} required />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Notes</label>
                      <textarea className={`${inputCls} h-20 resize-none`} placeholder="Driver, vehicle, route…" {...f('meetings')} />
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center gap-3">
                  <button type="submit" disabled={submitting}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                    style={{ background: '#AACC00', color: '#0118A1' }}>
                    {submitting
                      ? <><div className="w-4 h-4 border-2 border-[#0118A1] border-t-transparent rounded-full animate-spin" />Saving…</>
                      : editingId ? 'Update trip' : profile?.role === 'solo' ? 'Save trip' : 'Submit for approval'}
                  </button>
                  <button type="button" onClick={resetPanel} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── Trip list ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-gray-900">Your trips</h2>
          <span className="text-xs text-gray-400">{trips.length} trip{trips.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="flex items-center gap-2 py-4">
            <span className="text-sm text-red-600">{loadError}</span>
            <button onClick={loadTrips} className="text-sm font-semibold hover:underline" style={{ color: '#0118A1' }}>Retry</button>
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#EEF1FF' }}>
              <Plane size={22} color="#0118A1" />
            </div>
            <p className="text-sm font-semibold text-gray-500">No trips yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">Click "Plan a trip" to add your first one</p>
            <button onClick={openNewTrip}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: '#0118A1' }}>
              <Plus size={12} /> Plan a trip
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map(trip => {
              const sc = STATUS_STYLE[trip.status] || STATUS_STYLE.Completed
              return (
                <div key={trip.id} className="rounded-2xl border border-gray-100 overflow-hidden">
                  {/* Risk banner */}
                  {(trip.risk_level === 'Critical' || trip.risk_level === 'High') && (
                    <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold"
                      style={{ background: '#FFF7ED', borderBottom: '1px solid #FED7AA', color: '#92400E' }}>
                      <AlertTriangle size={12} /> Elevated risk destination — check Alerts for details
                    </div>
                  )}

                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full mt-2 shrink-0" style={{ background: sc.dot }} />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-sm text-gray-900">{trip.trip_name}</span>
                            <SeverityBadge severity={trip.risk_level} />
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                              style={{ background: sc.bg, color: sc.text, borderColor: sc.border }}>
                              {trip.status}
                            </span>
                            {trip.approval_required !== false && trip.approval_status === 'pending' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">⏳ Pending approval</span>
                            )}
                            {trip.approval_required !== false && trip.approval_status === 'approved' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700">✓ Approved</span>
                            )}
                            {trip.approval_status === 'rejected' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700">✗ Rejected</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <MapPin size={11} className="text-gray-400 shrink-0" />
                            <span>{trip.departure_city}</span>
                            <span className="text-gray-300">→</span>
                            <span className="font-semibold text-gray-700">{trip.arrival_city}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">{trip.depart_date} — {trip.return_date}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        {trip.flight_number && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Plane size={10} />
                            <span className="font-mono">{trip.flight_number}</span>
                          </div>
                        )}
                        {trip.hotel_name && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Hotel size={10} />
                            <span>{trip.hotel_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <button onClick={() => startEdit(trip)}
                            className="text-xs text-gray-400 hover:text-[#0118A1] transition-colors flex items-center gap-1">
                            <Pencil size={10} /> Edit
                          </button>
                          <span className="text-gray-200">|</span>
                          {deletingId === trip.id ? (
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className="text-red-500 font-semibold">Delete?</span>
                              <button onClick={() => handleDelete(trip.id)} className="text-red-500 font-bold underline text-xs">Yes</button>
                              <button onClick={() => setDeletingId(null)} className="text-gray-400 underline text-xs">No</button>
                            </span>
                          ) : (
                            <button onClick={() => setDeletingId(trip.id)}
                              className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1">
                              <Trash2 size={10} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Flight + country risk */}
                    {(trip.flight_number || trip.arrival_city) && (
                      <div className="pt-3 border-t border-gray-100 flex flex-col gap-1.5">
                        {trip.flight_number && <FlightStatus flightNumber={trip.flight_number} tripName={trip.trip_name} profile={profile} />}
                        {trip.arrival_city && resolveCountry(trip.arrival_city) && (
                          <CountryRisk country={resolveCountry(trip.arrival_city)} tripName={trip.trip_name} profile={profile} />
                        )}
                      </div>
                    )}

                    {/* Rejection reason */}
                    {trip.approval_status === 'rejected' && trip.approval_notes && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                          <span className="font-bold">Rejected: </span>{trip.approval_notes}
                        </div>
                      </div>
                    )}

                    {/* Pre-travel training */}
                    {trip.approval_status === 'approved' && trainingMap[trip.id]?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <button onClick={() => setExpandedTraining(p => ({ ...p, [trip.id]: !p[trip.id] }))}
                          className="w-full flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <BookOpen size={10} />
                            Pre-travel Training ({trainingMap[trip.id].filter(a => a.completed).length}/{trainingMap[trip.id].length})
                          </span>
                          {expandedTraining[trip.id] ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                          <div className="h-1.5 rounded-full transition-all" style={{
                            width: `${Math.round(trainingMap[trip.id].filter(a => a.completed).length / trainingMap[trip.id].length * 100)}%`,
                            background: trainingMap[trip.id].every(a => a.completed) ? '#AACC00' : '#0118A1',
                          }} />
                        </div>
                        {expandedTraining[trip.id] && (
                          <div className="space-y-1">
                            {trainingMap[trip.id].map(mod => (
                              <div key={mod.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs ${mod.completed ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                                {mod.completed ? <CheckCircle2 size={11} className="text-green-500 shrink-0" /> : <Lock size={11} className="text-gray-300 shrink-0" />}
                                <span className={mod.completed ? 'line-through text-green-600' : ''}>{mod.module_name}</span>
                                {!mod.completed && mod.required_before_travel && (
                                  <span className="ml-auto text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg">Required</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Trip alerts */}
                    {tripAlertMap[trip.id]?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
                          Trip Alerts ({tripAlertMap[trip.id].length})
                        </p>
                        <div className="space-y-1">
                          {tripAlertMap[trip.id].slice(0, 3).map(ta => (
                            <div key={ta.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs ${
                              ta.severity === 'Critical' ? 'bg-red-50 border-l-2 border-red-400' :
                              ta.severity === 'High'     ? 'bg-amber-50 border-l-2 border-amber-400' :
                              'bg-yellow-50 border-l-2 border-yellow-300'
                            }`}>
                              <span>{ta.alert_type === 'disaster' ? '🌋' : ta.alert_type === 'earthquake' ? '🔴' : ta.alert_type === 'flight' ? '✈️' : ta.alert_type === 'weather' ? '⛈️' : ta.alert_type === 'security' ? '🛡️' : '⚠️'}</span>
                              <span className="text-gray-700 truncate">{ta.title}</span>
                              <span className={`ml-auto text-[10px] font-bold shrink-0 ${ta.severity === 'Critical' ? 'text-red-600' : ta.severity === 'High' ? 'text-amber-600' : 'text-yellow-600'}`}>{ta.severity}</span>
                            </div>
                          ))}
                          {tripAlertMap[trip.id].length > 3 && (
                            <p className="text-[10px] text-gray-400 pl-1">+{tripAlertMap[trip.id].length - 3} more — check Dashboard</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Post-travel debrief CTA */}
                    {trip.status === 'Completed' && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {debriefSet.has(trip.id) ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                            <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                            Debrief submitted
                          </span>
                        ) : (
                          <button
                            onClick={() => navigate(`/debrief/${trip.id}`)}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all"
                            style={{ background: '#AACC00', color: '#0118A1', minHeight: 44 }}
                          >
                            Complete post-travel debrief →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showUpload && (
        <ItineraryUpload
          onClose={() => setShowUpload(false)}
          onSaved={() => {
            setShowUpload(false)
            setToast('Itinerary uploaded — trips added successfully.')
            loadTrips()
            setTimeout(() => setToast(''), 5000)
          }}
          userId={userId}
          session={session}
          profile={profile}
        />
      )}
    </Layout>
  )
}
