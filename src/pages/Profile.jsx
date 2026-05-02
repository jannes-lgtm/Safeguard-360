import { useEffect, useState } from 'react'
import { User, Bell } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const inputClass = "w-full border border-gray-300 rounded-[6px] px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] focus:border-transparent"
const labelClass = "block text-sm font-medium text-gray-700 mb-1"

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({
    full_name: '', phone: '',
    emergency_contact_1_name: '', emergency_contact_1_email: '',
    emergency_contact_2_name: '', emergency_contact_2_email: '',
  })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (data) {
        setProfile(data)
        setForm({
          full_name: data.full_name || '',
          phone: data.phone || '',
          emergency_contact_1_name: data.emergency_contact_1_name || '',
          emergency_contact_1_email: data.emergency_contact_1_email || '',
          emergency_contact_2_name: data.emergency_contact_2_name || '',
          emergency_contact_2_email: data.emergency_contact_2_email || '',
        })
      }
    }
    load()
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('profiles').update(form).eq('id', session.user.id)
    if (!error) {
      setToast('Profile saved successfully.')
      setTimeout(() => setToast(''), 4000)
    }
    setSaving(false)
  }

  const f = (key) => ({
    value: form[key],
    onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  })

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your details and emergency contacts</p>
      </div>

      {toast && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-[8px] text-sm">
          {toast}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Personal info */}
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <User size={16} className="text-[#1E2461]" />
            <h2 className="text-base font-semibold text-gray-900">Personal Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full name</label>
              <input className={inputClass} placeholder="Your full name" {...f('full_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={profile?.email || ''} disabled
                style={{ background: '#f9fafb', color: '#6b7280' }} />
            </div>
            <div>
              <label className={labelClass}>Phone number</label>
              <input className={inputClass} placeholder="+27 82 000 0000" {...f('phone')} />
            </div>
          </div>
        </div>

        {/* Emergency contacts */}
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5">
          <div className="flex items-center gap-2 mb-1">
            <Bell size={16} className="text-[#1E2461]" />
            <h2 className="text-base font-semibold text-gray-900">Emergency Contacts</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            These contacts will receive email alerts when your flight is delayed, cancelled, or your destination risk level changes.
          </p>

          {/* Contact 1 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact 1 — e.g. GSOC / Travel Manager</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} placeholder="e.g. GSOC Operations" {...f('emergency_contact_1_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} placeholder="gsoc@company.com" {...f('emergency_contact_1_email')} />
            </div>
          </div>

          {/* Contact 2 */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contact 2 — optional</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} placeholder="e.g. Line Manager" {...f('emergency_contact_2_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} placeholder="manager@company.com" {...f('emergency_contact_2_email')} />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="bg-[#1E2461] hover:bg-[#161a4a] text-white font-semibold px-6 py-2.5 rounded-[6px] text-sm transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</> : 'Save profile'}
        </button>
      </form>
    </Layout>
  )
}
