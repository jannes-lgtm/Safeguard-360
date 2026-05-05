import { useEffect, useState } from 'react'
import {
  Clock, CheckCircle2, BookOpen, Award, Lock,
  PlayCircle, AlertTriangle, MapPin, ChevronRight, X,
  Plane, RefreshCw,
} from 'lucide-react'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── ISO 31030 module metadata ─────────────────────────────────────────────────
const MODULE_META = {
  1: {
    desc: 'Understand the principles and framework of ISO 31000 risk management and how it applies to travel duty of care.',
    topics: ['Risk management principles', 'Framework components', 'Leadership and commitment'],
    duration: 30,
  },
  2: {
    desc: 'Learn to identify, assess and evaluate travel risks using ISO 31030 methodology and structured risk registers.',
    topics: ['Risk identification techniques', 'Likelihood & consequence matrix', 'Risk register maintenance'],
    duration: 45,
  },
  3: {
    desc: 'Understand traveller responsibilities before, during and after travel under the ISO 31030 standard.',
    topics: ['Pre-travel requirements', 'In-destination protocols', 'Post-travel reporting'],
    duration: 35,
  },
  4: {
    desc: 'Emergency response planning and escalation procedures aligned with ISO 31030 Section 8.',
    topics: ['Emergency contact protocols', 'Evacuation procedures', 'Crisis communication'],
    duration: 40,
  },
  5: {
    desc: 'Incident reporting obligations and the process for documenting and reviewing travel-related incidents.',
    topics: ['Mandatory reporting thresholds', 'Investigation process', 'Lessons learned'],
    duration: 25,
  },
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const styles = {
    Complete:      { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    'In Progress': { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    'Not Started': { bg: '#F8FAFC', color: '#94A3B8', border: '#E2E8F0' },
  }
  const s = styles[status] || styles['Not Started']
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  )
}

// ── Module completion modal ───────────────────────────────────────────────────
function ModuleModal({ mod, tripAssignments, onClose, onComplete }) {
  const [completing, setCompleting] = useState(false)
  const [done, setDone]             = useState(false)
  const meta = MODULE_META[mod.module_order] || {}

  // Which trips require this module
  const requiredTrips = tripAssignments.filter(
    a => a.module_order === mod.module_order && !a.completed
  )

  const markComplete = async () => {
    setCompleting(true)
    const now = new Date().toISOString()

    // 1. Update training_records
    await supabase
      .from('training_records')
      .update({ completed: true, completed_at: now })
      .eq('id', mod.id)

    // 2. Update all matching trip_training_assignments (same module_order, same user)
    if (requiredTrips.length > 0) {
      await supabase
        .from('trip_training_assignments')
        .update({ completed: true, completed_at: now })
        .in('id', requiredTrips.map(a => a.id))
    }

    setCompleting(false)
    setDone(true)
    setTimeout(() => {
      onComplete()
      onClose()
    }, 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center relative"
          style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}08, ${BRAND_BLUE}14)` }}>
          <button onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1">
            <X size={16} />
          </button>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 text-xl font-black"
            style={{ background: BRAND_BLUE, color: 'white' }}>
            {mod.module_order}
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Module {mod.module_order}
          </p>
          <h3 className="font-bold text-gray-900 text-base leading-snug">{mod.module_name}</h3>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Required for trip banner */}
          {requiredTrips.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                <p className="text-xs font-bold text-amber-800">Required before travel</p>
              </div>
              {requiredTrips.map(a => (
                <div key={a.id} className="flex items-center gap-1.5 text-xs text-amber-700 mt-1">
                  <Plane size={10} />
                  {a.trip_name || 'Upcoming trip'}
                </div>
              ))}
            </div>
          )}

          {/* Description */}
          {meta.desc && (
            <p className="text-sm text-gray-600 leading-relaxed">{meta.desc}</p>
          )}

          {/* Topics */}
          {meta.topics && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Topics covered
              </p>
              <ul className="space-y-1.5">
                {meta.topics.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: BRAND_BLUE, opacity: 0.5 }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Duration */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={11} />
            {meta.duration || mod.duration_minutes || 30} minutes estimated
          </div>

          {/* Content notice */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-blue-800 mb-1">
              Interactive content launching soon
            </p>
            <p className="text-xs text-blue-600 leading-relaxed">
              The full interactive module is being prepared. Once you have reviewed
              the topics and understand the material, you can mark this module as complete.
            </p>
          </div>

          {/* Complete / done state */}
          {done ? (
            <div className="flex items-center justify-center gap-2 py-3 rounded-xl text-green-700 font-bold text-sm"
              style={{ background: '#F0FDF4', border: '1.5px solid #BBF7D0' }}>
              <CheckCircle2 size={16} />
              Module complete!
            </div>
          ) : (
            <button
              onClick={markComplete}
              disabled={completing}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: BRAND_GREEN, color: BRAND_BLUE }}>
              {completing
                ? <><RefreshCw size={14} className="animate-spin" /> Saving…</>
                : <><CheckCircle2 size={14} /> Mark as Complete</>
              }
            </button>
          )}

          <p className="text-[10px] text-gray-400 text-center">
            Completion is recorded with timestamp and synced to your travel requirements.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Trip requirements banner ──────────────────────────────────────────────────
function TripRequirementsBanner({ trips, modules }) {
  if (!trips.length) return null

  return (
    <div className="mb-6 space-y-3">
      {trips.map(trip => {
        const pending   = trip.assignments.filter(a => !a.completed)
        const completed = trip.assignments.filter(a => a.completed)
        const pct       = trip.assignments.length
          ? Math.round(completed.length / trip.assignments.length * 100)
          : 0
        const allDone   = pending.length === 0

        return (
          <div key={trip.id}
            className={`rounded-2xl border p-5 ${
              allDone
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Plane size={13} className={allDone ? 'text-green-600' : 'text-amber-600'} />
                  <p className={`text-sm font-bold ${allDone ? 'text-green-800' : 'text-amber-800'}`}>
                    {trip.trip_name}
                  </p>
                </div>
                <p className={`text-xs flex items-center gap-1 ${allDone ? 'text-green-600' : 'text-amber-600'}`}>
                  <MapPin size={10} />
                  {trip.departure_city} → {trip.arrival_city} · Departs{' '}
                  {new Date(trip.depart_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-black ${allDone ? 'text-green-700' : 'text-amber-700'}`}>{pct}%</p>
                <p className="text-[10px] text-gray-500">complete</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full rounded-full h-1.5 mb-3"
              style={{ background: allDone ? '#BBF7D0' : '#FDE68A' }}>
              <div className="h-1.5 rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: allDone ? '#22c55e' : '#f59e0b',
                }} />
            </div>

            {/* Module list */}
            <div className="space-y-1.5">
              {trip.assignments.map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs">
                  {a.completed
                    ? <CheckCircle2 size={12} className="text-green-500 shrink-0" />
                    : <div className="w-3 h-3 rounded-full border-2 border-amber-400 shrink-0" />
                  }
                  <span className={a.completed ? 'text-green-700 line-through' : 'text-amber-800 font-medium'}>
                    {a.module_name}
                  </span>
                  {!a.completed && a.required_before_travel && (
                    <span className="ml-auto text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full shrink-0">
                      Required
                    </span>
                  )}
                </div>
              ))}
            </div>

            {allDone && (
              <div className="mt-3 flex items-center gap-2 text-xs text-green-700 font-semibold">
                <CheckCircle2 size={13} />
                All pre-travel training complete — you're cleared to travel
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Training() {
  const [modules, setModules]               = useState([])
  const [tripAssignments, setTripAssignments] = useState([])  // trip_training_assignments
  const [upcomingTrips, setUpcomingTrips]   = useState([])    // approved upcoming trips
  const [loading, setLoading]               = useState(true)
  const [activeModal, setActiveModal]       = useState(null)

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const uid   = session.user.id
    const today = new Date().toISOString().split('T')[0]

    const [
      { data: records },
      { data: assignments },
      { data: trips },
    ] = await Promise.all([
      // ISO training records
      supabase
        .from('training_records')
        .select('id, user_id, completed, completed_at, training_modules(id, title, duration_minutes, module_order)')
        .eq('user_id', uid)
        .order('module_order', { referencedTable: 'training_modules' }),

      // Trip-specific training assignments (approved trips only)
      supabase
        .from('trip_training_assignments')
        .select('*, itineraries(trip_name, departure_city, arrival_city, depart_date, approval_status)')
        .eq('user_id', uid)
        .order('module_order', { ascending: true }),

      // Approved upcoming trips
      supabase
        .from('itineraries')
        .select('*')
        .eq('user_id', uid)
        .eq('approval_status', 'approved')
        .gte('depart_date', today)
        .order('depart_date', { ascending: true }),
    ])

    // Map ISO modules
    const mapped = (records || []).map(r => ({
      id:               r.id,
      user_id:          r.user_id,
      module_order:     r.training_modules?.module_order,
      module_name:      r.training_modules?.title,
      duration_minutes: r.training_modules?.duration_minutes,
      status:           r.completed ? 'Complete' : 'Not Started',
      progress_pct:     r.completed ? 100 : 0,
      completed_date:   r.completed_at
        ? new Date(r.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : null,
    }))
    setModules(mapped)

    // Store trip assignments flat (for use in modal)
    const flatAssignments = (assignments || []).map(a => ({
      ...a,
      trip_name:      a.itineraries?.trip_name,
      departure_city: a.itineraries?.departure_city,
      arrival_city:   a.itineraries?.arrival_city,
      depart_date:    a.itineraries?.depart_date,
    }))
    setTripAssignments(flatAssignments)

    // Build upcoming trips with their assignments merged
    const tripsWithAssignments = (trips || []).map(trip => ({
      ...trip,
      assignments: flatAssignments.filter(a => a.trip_id === trip.id),
    })).filter(t => t.assignments.length > 0)
    setUpcomingTrips(tripsWithAssignments)

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const completed   = modules.filter(m => m.status === 'Complete').length
  const total       = modules.length
  const avgProgress = total
    ? Math.round(modules.reduce((s, m) => s + (m.progress_pct || 0), 0) / total)
    : 0

  // Which module orders are trip-required and not yet complete
  const requiredOrders = new Set(
    tripAssignments.filter(a => !a.completed).map(a => a.module_order)
  )

  return (
    <Layout>
      {activeModal && (
        <ModuleModal
          mod={activeModal}
          tripAssignments={tripAssignments}
          onClose={() => setActiveModal(null)}
          onComplete={load}
        />
      )}

      {/* Header */}
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Compliance</p>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">ISO Training</h1>
        <p className="text-sm text-gray-400 mt-1">ISO 31000 / 31030 compliance training modules</p>
      </div>

      {/* Progress hero */}
      <div className="rounded-2xl p-6 mb-7 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${BRAND_BLUE} 0%, #0a24cc 100%)`,
          boxShadow: `0 4px 24px ${BRAND_BLUE}40`,
        }}>
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10"
          style={{ background: BRAND_GREEN, transform: 'translate(30%, -30%)' }} />
        <div className="absolute bottom-0 right-16 w-24 h-24 rounded-full opacity-10"
          style={{ background: 'white', transform: 'translate(0%, 40%)' }} />

        <div className="relative flex items-end justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Award size={14} color={BRAND_GREEN} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: BRAND_GREEN }}>
                ISO 31030 Compliance
              </span>
            </div>
            <div className="text-5xl font-black text-white mb-3 tracking-tight">
              {loading ? '–' : `${avgProgress}%`}
            </div>
            <div className="w-full h-2 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${avgProgress}%`, background: BRAND_GREEN }} />
            </div>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {loading ? '…' : `${completed} of ${total} modules complete`}
            </p>
          </div>
          {avgProgress === 100 && (
            <div className="shrink-0 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-center">
              <Award size={22} color={BRAND_GREEN} className="mx-auto mb-1" />
              <p className="text-[10px] font-bold text-white uppercase tracking-wide">Certified</p>
            </div>
          )}
        </div>
      </div>

      {/* Trip requirements banners */}
      {!loading && upcomingTrips.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <Plane size={13} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Pre-travel requirements
            </p>
          </div>
          <TripRequirementsBanner trips={upcomingTrips} modules={modules} />
        </>
      )}

      {/* ISO module grid */}
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={13} className="text-gray-400" />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          ISO 31030 Modules
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-white rounded-2xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-gray-100">
          <p className="text-sm text-gray-400">No training modules found. Contact your administrator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((mod, idx) => {
            const isComplete  = mod.status === 'Complete'
            const isLocked    = idx > 0 && !modules[idx - 1]?.status?.includes('Complete') && !isComplete
            const meta        = MODULE_META[mod.module_order] || {}
            const isRequired  = requiredOrders.has(mod.module_order)

            return (
              <div key={mod.id}
                className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                  border: isComplete
                    ? `1.5px solid ${BRAND_GREEN}60`
                    : isRequired
                    ? '1.5px solid #FCD34D'
                    : '1px solid rgba(0,0,0,0.06)',
                  opacity: isLocked ? 0.65 : 1,
                }}>

                {/* Top stripe */}
                <div className="h-1" style={{
                  background: isComplete ? BRAND_GREEN : isRequired ? '#F59E0B' : 'transparent'
                }} />

                <div className="p-5">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-base"
                        style={isComplete
                          ? { background: `${BRAND_GREEN}20`, color: '#3F6212' }
                          : { background: `${BRAND_BLUE}10`, color: BRAND_BLUE }
                        }>
                        {mod.module_order}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Module {mod.module_order}
                        </p>
                        <StatusChip status={mod.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isRequired && !isComplete && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                          <Plane size={8} /> Trip req.
                        </span>
                      )}
                      {isComplete
                        ? <CheckCircle2 size={18} style={{ color: BRAND_GREEN }} />
                        : isLocked
                        ? <Lock size={14} className="text-gray-300" />
                        : null
                      }
                    </div>
                  </div>

                  {/* Title + desc */}
                  <h3 className="text-sm font-bold text-gray-900 mb-1 leading-snug">{mod.module_name}</h3>
                  {meta.desc && (
                    <p className="text-xs text-gray-400 leading-relaxed mb-3 line-clamp-2">{meta.desc}</p>
                  )}

                  {/* Progress bar */}
                  <div className="mb-3">
                    <ProgressBar value={mod.progress_pct || 0} showLabel={false} />
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock size={11} />
                      {meta.duration || mod.duration_minutes || 30} min
                      {isComplete && mod.completed_date && (
                        <span className="text-[10px] ml-1">· Done {mod.completed_date}</span>
                      )}
                    </div>

                    {isComplete ? (
                      <span className="flex items-center gap-1 text-xs font-semibold"
                        style={{ color: BRAND_GREEN }}>
                        <CheckCircle2 size={12} /> Completed
                      </span>
                    ) : isLocked ? (
                      <span className="flex items-center gap-1 text-xs text-gray-300 font-medium">
                        <Lock size={11} /> Complete previous
                      </span>
                    ) : (
                      <button
                        onClick={() => setActiveModal(mod)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all hover:opacity-90 hover:-translate-y-0.5"
                        style={{ background: isRequired ? '#F59E0B' : BRAND_BLUE, color: isRequired ? '#1C1917' : 'white' }}>
                        <PlayCircle size={12} />
                        {mod.status === 'In Progress' ? 'Continue' : 'Start'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ISO note */}
      <div className="mt-6 rounded-2xl p-4 flex items-start gap-3"
        style={{ background: `${BRAND_BLUE}06`, border: `1px solid ${BRAND_BLUE}12` }}>
        <BookOpen size={14} style={{ color: BRAND_BLUE, opacity: 0.5 }} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed" style={{ color: `${BRAND_BLUE}99` }}>
          This training follows <strong>ISO 31000:2018</strong> and <strong>ISO 31030:2021</strong>.
          Completing a module here automatically updates any pre-travel requirements for your approved trips.
        </p>
      </div>
    </Layout>
  )
}
