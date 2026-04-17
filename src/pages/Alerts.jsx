import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import Layout from '../components/Layout'
import AlertCard from '../components/AlertCard'
import { supabase } from '../lib/supabase'

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [severityFilter, setSeverityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [countrySearch, setCountrySearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .order('date_issued', { ascending: false })
      setAlerts(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = alerts.filter(a => {
    if (severityFilter !== 'All' && a.severity !== severityFilter) return false
    if (statusFilter !== 'All' && a.status !== statusFilter) return false
    if (countrySearch && !a.country?.toLowerCase().includes(countrySearch.toLowerCase())) return false
    return true
  })

  const selectClass = "border border-gray-300 rounded-[6px] px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]"

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Risk Alerts</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live risk intelligence for your destinations</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className={selectClass}
        >
          <option value="All">All severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className={selectClass}
        >
          <option value="All">All statuses</option>
          <option value="Active">Active</option>
          <option value="Resolved">Resolved</option>
        </select>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by country..."
            value={countrySearch}
            onChange={e => setCountrySearch(e.target.value)}
            className="border border-gray-300 rounded-[6px] pl-8 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] w-52"
          />
        </div>
      </div>

      {/* Alert cards */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white rounded-[8px] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-10 text-center">
          <p className="text-gray-500 text-sm">No alerts match your filters. All clear for selected destinations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </Layout>
  )
}
