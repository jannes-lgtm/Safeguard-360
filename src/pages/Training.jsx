import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, X, BookOpen, Award, ChevronRight, Lock, PlayCircle } from 'lucide-react'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── ISO 31030 module descriptions ─────────────────────────────────────────────
const MODULE_META = {
  1: {
    desc: 'Understand the principles and framework of ISO 31000 risk management and how it applies to travel duty of care.',
    topics: ['Risk management principles', 'Framework components', 'Leadership and commitment'],
  },
  2: {
    desc: 'Learn to identify, assess and evaluate travel risks using ISO 31030 methodology and structured risk registers.',
    topics: ['Risk identification techniques', 'Likelihood & consequence matrix', 'Risk register maintenance'],
  },
  3: {
    desc: 'Understand traveller responsibilities before, during and after travel under the ISO 31030 standard.',
    topics: ['Pre-travel requirements', 'In-destination protocols', 'Post-travel reporting'],
  },
  4: {
    desc: 'Emergency response planning and escalation procedures aligned with ISO 31030 Section 8.',
    topics: ['Emergency contact protocols', 'Evacuation procedures', 'Crisis communication'],
  },
  5: {
    desc: 'Incident reporting obligations and the process for documenting and reviewing travel-related incidents.',
    topics: ['Mandatory reporting thresholds', 'Investigation process', 'Lessons learned'],
  },
}

function StatusChip({ status }) {
  const styles = {
    Complete:    { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
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

function ComingSoonModal({ module, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Coloured top */}
        <div className="px-6 pt-8 pb-6 text-center"
          style={{ background: `linear-gradient(135deg, ${BRAND_BLUE}08, ${BRAND_BLUE}14)` }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3"
            style={{ background: BRAND_BLUE }}>
            <BookOpen size={22} color="white" />
          </div>
          <h3 className="font-bold text-gray-900 text-base">{module?.module_name}</h3>
          <p className="text-xs text-gray-400 mt-1">Module {module?.module_order}</p>
        </div>

        <div className="px-6 py-5">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
            <p className="text-xs font-bold text-amber-700 mb-1">Module content launching soon</p>
            <p className="text-xs text-amber-600 leading-relaxed">
              Interactive training content is being prepared. Your progress will be tracked automatically when available.
            </p>
          </div>

          {module && MODULE_META[module.module_order]?.topics && (
            <div className="mb-5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Topics covered</p>
              <ul className="space-y-1.5">
                {MODULE_META[module.module_order].topics.map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BRAND_BLUE, opacity: 0.5 }} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90"
            style={{ background: BRAND_BLUE, color: 'white' }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Training() {
  const [modules, setModules]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [activeModal, setActiveModal] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('training_records')
        .select(`
          id,
          user_id,
          completed,
          completed_at,
          training_modules (
            id,
            title,
            duration_minutes,
            module_order
          )
        `)
        .eq('user_id', session.user.id)
        .order('module_order', { referencedTable: 'training_modules' })

      const mapped = (data || []).map(r => ({
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
      setLoading(false)
    }
    load()
  }, [])

  const completed  = modules.filter(m => m.status === 'Complete').length
  const total      = modules.length
  const avgProgress = total ? Math.round(modules.reduce((s, m) => s + (m.progress_pct || 0), 0) / total) : 0

  return (
    <Layout>
      {activeModal && <ComingSoonModal module={activeModal} onClose={() => setActiveModal(null)} />}

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
        {/* Background decoration */}
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
            {/* Track */}
            <div className="w-full h-2 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${avgProgress}%`, background: BRAND_GREEN }} />
            </div>
            <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {loading ? '…' : `${completed} of ${total} modules complete`}
            </p>
          </div>

          {/* Certificate hint */}
          {avgProgress === 100 && (
            <div className="shrink-0 bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-center">
              <Award size={22} color={BRAND_GREEN} className="mx-auto mb-1" />
              <p className="text-[10px] font-bold text-white uppercase tracking-wide">Certified</p>
            </div>
          )}
        </div>
      </div>

      {/* Module grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-white rounded-2xl animate-pulse"
              style={{ border: '1px solid rgba(0,0,0,0.06)' }} />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.06)' }}>
          <p className="text-sm text-gray-400">No training modules found. Contact your administrator.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map((mod, idx) => {
            const isComplete   = mod.status === 'Complete'
            const isLocked     = idx > 0 && !modules[idx - 1]?.status?.includes('Complete') && !isComplete
            const meta         = MODULE_META[mod.module_order] || {}

            return (
              <div key={mod.id}
                className="bg-white rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
                  border: isComplete ? `1.5px solid ${BRAND_GREEN}60` : '1px solid rgba(0,0,0,0.06)',
                  opacity: isLocked ? 0.65 : 1,
                }}>

                {/* Completion stripe */}
                {isComplete && (
                  <div className="h-1" style={{ background: BRAND_GREEN }} />
                )}

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
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Module {mod.module_order}</p>
                        <StatusChip status={mod.status} />
                      </div>
                    </div>
                    {isComplete
                      ? <CheckCircle2 size={18} style={{ color: BRAND_GREEN }} className="shrink-0 mt-0.5" />
                      : isLocked
                      ? <Lock size={14} className="text-gray-300 shrink-0 mt-0.5" />
                      : null
                    }
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
                      {mod.duration_minutes} min
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
                        style={{ background: BRAND_BLUE, color: 'white' }}>
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

      {/* ISO standard note */}
      <div className="mt-6 rounded-2xl p-4 flex items-start gap-3"
        style={{ background: `${BRAND_BLUE}06`, border: `1px solid ${BRAND_BLUE}12` }}>
        <BookOpen size={14} style={{ color: BRAND_BLUE, opacity: 0.5 }} className="shrink-0 mt-0.5" />
        <p className="text-xs leading-relaxed" style={{ color: `${BRAND_BLUE}99` }}>
          This training programme follows <strong>ISO 31000:2018</strong> (Risk Management) and <strong>ISO 31030:2021</strong> (Travel Risk Management) requirements. Completion of all modules contributes to your organisation's duty of care compliance score.
        </p>
      </div>
    </Layout>
  )
}
