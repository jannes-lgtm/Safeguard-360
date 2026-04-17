import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart2, Bell, Plane, FileText } from 'lucide-react'
import Layout from '../components/Layout'
import MetricCard from '../components/MetricCard'
import SeverityBadge from '../components/SeverityBadge'
import ProgressBar from '../components/ProgressBar'
import { supabase } from '../lib/supabase'

const severityDot = {
  Critical: 'bg-red-500',
  High: 'bg-amber-500',
  Medium: 'bg-yellow-400',
  Low: 'bg-gray-400',
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    activeAlerts: 0,
    staffTravelling: 0,
    activePolicies: 0,
  })
  const [recentAlerts, setRecentAlerts] = useState([])
  const [trainingModules, setTrainingModules] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { count: alertCount },
        { count: travelCount },
        { count: policyCount },
        { data: alerts },
        { data: training },
      ] = await Promise.all([
        supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('itineraries').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('policies').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('alerts').select('*').eq('status', 'Active').order('date_issued', { ascending: false }).limit(4),
        supabase.from('training_progress').select('*').eq('user_id', session.user.id).order('module_order'),
      ])

      setMetrics({
        activeAlerts: alertCount || 0,
        staffTravelling: travelCount || 0,
        activePolicies: policyCount || 0,
      })
      setRecentAlerts(alerts || [])
      setTrainingModules((training || []).slice(0, 5))
      setLoading(false)
    }
    load()
  }, [])

  const avgProgress = trainingModules.length
    ? Math.round(trainingModules.reduce((sum, m) => sum + (m.progress_pct || 0), 0) / trainingModules.length)
    : 0

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your duty of care overview</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Compliance Score"
          value="74%"
          valueColor="text-[#2563EB]"
          icon={BarChart2}
        />
        <MetricCard
          label="Active Alerts"
          value={loading ? '–' : metrics.activeAlerts}
          valueColor={metrics.activeAlerts > 0 ? 'text-[#DC2626]' : 'text-gray-900'}
          icon={Bell}
        />
        <MetricCard
          label="Staff Travelling"
          value={loading ? '–' : metrics.staffTravelling}
          valueColor="text-[#2563EB]"
          icon={Plane}
        />
        <MetricCard
          label="Policies Active"
          value={loading ? '–' : metrics.activePolicies}
          valueColor="text-[#16A34A]"
          icon={FileText}
        />
      </div>

      {/* Two-panel row */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Live alerts panel — 60% */}
        <div className="lg:w-3/5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Live risk alerts</h2>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : recentAlerts.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No active alerts. All clear.</p>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map(alert => (
                <div key={alert.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${severityDot[alert.severity] || 'bg-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{alert.title}</span>
                      <SeverityBadge severity={alert.severity} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{alert.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link to="/alerts" className="text-sm text-[#2563EB] font-medium hover:underline">
              View all alerts →
            </Link>
          </div>
        </div>

        {/* ISO compliance panel — 40% */}
        <div className="lg:w-2/5 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">ISO 31000 compliance</h2>

          {loading ? (
            <div className="space-y-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : trainingModules.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">No training data found.</p>
          ) : (
            <div className="space-y-4">
              {trainingModules.map(module => (
                <ProgressBar
                  key={module.id}
                  label={module.module_name}
                  value={module.progress_pct || 0}
                />
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100">
            <Link to="/training" className="text-sm text-[#2563EB] font-medium hover:underline">
              Go to training →
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}
