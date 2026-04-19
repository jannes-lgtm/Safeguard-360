import { useEffect, useState } from 'react'
import { Clock, CheckCircle2, X } from 'lucide-react'
import Layout from '../components/Layout'
import ProgressBar from '../components/ProgressBar'
import { supabase } from '../lib/supabase'

function StatusBadge({ status }) {
  const styles = {
    Complete: 'bg-green-100 text-green-700 border border-green-200',
    'In Progress': 'bg-amber-100 text-amber-700 border border-amber-200',
    'Not Started': 'bg-gray-100 text-gray-500 border border-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[status] || styles['Not Started']}`}>
      {status}
    </span>
  )
}

function Modal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[8px] shadow-xl max-w-sm w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-gray-900 text-base">Training module coming soon</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Training module coming soon. Your progress will be tracked here.
        </p>
        <button
          onClick={onClose}
          className="w-full bg-[#1B3A6B] hover:bg-[#142d54] text-white font-semibold py-2.5 rounded-[6px] text-sm transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

export default function Training() {
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

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
        id: r.id,
        user_id: r.user_id,
        module_order: r.training_modules?.module_order,
        module_name: r.training_modules?.title,
        duration_minutes: r.training_modules?.duration_minutes,
        status: r.completed ? 'Complete' : 'Not Started',
        progress_pct: r.completed ? 100 : 0,
        completed_date: r.completed_at ? new Date(r.completed_at).toLocaleDateString() : null,
      }))

      setModules(mapped)
      setLoading(false)
    }
    load()
  }, [])

  const avgProgress = modules.length
    ? Math.round(modules.reduce((s, m) => s + (m.progress_pct || 0), 0) / modules.length)
    : 0

  return (
    <Layout>
      {showModal && <Modal onClose={() => setShowModal(false)} />}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ISO Training</h1>
        <p className="text-sm text-gray-500 mt-0.5">ISO 31000 compliance training modules</p>
      </div>

      {/* Overall progress */}
      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Your ISO 31000 completion</span>
          <span className="text-2xl font-bold text-[#1B3A6B]">{loading ? '–' : `${avgProgress}%`}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-700 ${
              avgProgress >= 80 ? 'bg-green-500' : avgProgress >= 50 ? 'bg-amber-500' : 'bg-gray-400'
            }`}
            style={{ width: `${avgProgress}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {modules.filter(m => m.status === 'Complete').length} of {modules.length} modules complete
        </p>
      </div>

      {/* Module cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-40 bg-white rounded-[8px] animate-pulse" />
          ))}
        </div>
      ) : modules.length === 0 ? (
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-10 text-center">
          <p className="text-gray-500 text-sm">No training modules found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {modules.map(module => {
            const isComplete = module.status === 'Complete'
            const isInProgress = module.status === 'In Progress'

            return (
              <div
                key={module.id}
                className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">
                        Module {module.module_order}
                      </span>
                      <StatusBadge status={module.status} />
                    </div>
                    <h3 className="text-base font-medium text-gray-800">{module.module_name}</h3>
                  </div>
                  {isComplete && (
                    <CheckCircle2 size={20} className="text-green-500 shrink-0 mt-0.5" />
                  )}
                </div>

                <ProgressBar value={module.progress_pct || 0} showLabel={false} />

                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock size={12} />
                      <span>{module.duration_minutes} min</span>
                    </div>
                    {isComplete && module.completed_date && (
                      <div className="text-xs text-gray-400">
                        Completed {module.completed_date}
                      </div>
                    )}
                  </div>

                  {isComplete ? (
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-medium rounded-[6px] bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                    >
                      Completed ✓
                    </button>
                  ) : isInProgress ? (
                    <button
                      onClick={() => setShowModal(true)}
                      className="px-4 py-2 text-xs font-medium rounded-[6px] bg-[#2563EB] hover:bg-blue-700 text-white transition-colors"
                    >
                      Continue module →
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowModal(true)}
                      className="px-4 py-2 text-xs font-medium rounded-[6px] bg-[#1B3A6B] hover:bg-[#142d54] text-white transition-colors"
                    >
                      Start module →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
