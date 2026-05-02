import { useEffect, useState } from 'react'
import { Search, Plus, X } from 'lucide-react'
import Layout from '../components/Layout'
import AlertCard from '../components/AlertCard'
import { supabase } from '../lib/supabase'

function AddAlertModal({ onClose, onAdded }) {
  const [form, setForm] = useState({
    title: '',
    location: '',
    country: '',
    severity: 'Medium',
    description: '',
    status: 'Active',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('alerts').insert({
      ...form,
      date_issued: new Date().toISOString().split('T')[0],
    })
    if (err) {
      setError(err.message)
      setSaving(false)
    } else {
      onAdded()
      onClose()
    }
  }

  const inputClass = "w-full border border-gray-300 rounded-[6px] px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#1E2461]"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[8px] shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Add New Alert</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className={labelClass}>Title</label>
            <input className={inputClass} required value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Civil unrest — Lagos" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} required value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                placeholder="e.g. Nigeria" />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input className={inputClass} value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Lagos Island" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Severity</label>
              <select className={inputClass} value={form.severity}
                onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option>Active</option>
                <option>Resolved</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} required rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the risk situation..." />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-2.5 rounded-[6px] text-sm hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-[#1E2461] hover:bg-[#161a4a] text-white font-semibold py-2.5 rounded-[6px] text-sm transition-colors disabled:opacity-60">
              {saving ? 'Saving...' : 'Add Alert'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [severityFilter, setSeverityFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [countrySearch, setCountrySearch] = useState('')
  const [showModal, setShowModal] = useState(false)

  const loadAlerts = async () => {
    const { data } = await supabase
      .from('alerts')
      .select('*')
      .order('date_issued', { ascending: false })
    setAlerts(data || [])
    setLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
        setIsAdmin(prof?.role === 'admin')
      }
      await loadAlerts()
    }
    init()
  }, [])

  const handleResolve = async (id) => {
    await supabase.from('alerts').update({ status: 'Resolved' }).eq('id', id)
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'Resolved' } : a))
  }

  const handleDelete = async (id) => {
    await supabase.from('alerts').delete().eq('id', id)
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const filtered = alerts.filter(a => {
    if (severityFilter !== 'All' && a.severity !== severityFilter) return false
    if (statusFilter !== 'All' && a.status !== statusFilter) return false
    if (countrySearch && !a.country?.toLowerCase().includes(countrySearch.toLowerCase())) return false
    return true
  })

  const selectClass = "border border-gray-300 rounded-[6px] px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#1E2461]"

  return (
    <Layout>
      {showModal && (
        <AddAlertModal
          onClose={() => setShowModal(false)}
          onAdded={loadAlerts}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Risk Alerts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live risk intelligence for your destinations</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#1E2461] hover:bg-[#161a4a] text-white font-semibold px-4 py-2.5 rounded-[6px] text-sm transition-colors"
          >
            <Plus size={16} />
            Add Alert
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={selectClass}>
          <option value="All">All severities</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
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
            className="border border-gray-300 rounded-[6px] pl-8 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1E2461] w-52"
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
          <p className="text-gray-500 text-sm">No alerts match your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              isAdmin={isAdmin}
              onResolve={handleResolve}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}
