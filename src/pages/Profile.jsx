import { useEffect, useState } from 'react'
import {
  User, Bell, Heart, Shield, CreditCard,
  Globe, Phone, Calendar, CheckCircle2, Briefcase,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const inputClass = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide'

function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 md:p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#EEF1FF' }}>
          <Icon size={16} color="#0118A1" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

const BLOOD_TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−', 'Unknown']

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [toast, setToast]     = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (data) {
        setProfile(data)
        setForm({
          // personal
          full_name:        data.full_name        || '',
          phone:            data.phone            || '',
          whatsapp_number:  data.whatsapp_number  || '',
          date_of_birth:    data.date_of_birth    || '',
          nationality:      data.nationality      || '',
          passport_number:  data.passport_number  || '',
          passport_expiry:  data.passport_expiry  || '',
          // next of kin
          kin_name:         data.kin_name         || '',
          kin_relationship: data.kin_relationship || '',
          kin_phone:        data.kin_phone        || '',
          kin_email:        data.kin_email        || '',
          // insurance & medical
          insurance_provider: data.insurance_provider || '',
          insurance_policy:   data.insurance_policy   || '',
          medical_aid:        data.medical_aid        || '',
          medical_aid_num:    data.medical_aid_num    || '',
          blood_type:         data.blood_type         || '',
          allergies:          data.allergies          || '',
          medications:        data.medications        || '',
          // line manager
          manager_name:  data.manager_name  || '',
          manager_title: data.manager_title || '',
          manager_email: data.manager_email || '',
          manager_phone: data.manager_phone || '',
          // legacy emergency contacts
          emergency_contact_1_name:  data.emergency_contact_1_name  || '',
          emergency_contact_1_email: data.emergency_contact_1_email || '',
          emergency_contact_2_name:  data.emergency_contact_2_name  || '',
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
      setToast('Profile saved.')
      setTimeout(() => setToast(''), 4000)
    }
    setSaving(false)
  }

  const f = (key) => ({
    value: form[key] || '',
    onChange: e => setForm(prev => ({ ...prev, [key]: e.target.value })),
  })

  const onboardingDone = !!profile?.onboarding_completed_at

  return (
    <Layout>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your personal details, travel documents, and emergency contacts</p>
        </div>
        {onboardingDone && (
          <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-200">
            <CheckCircle2 size={13} /> Onboarding complete
          </div>
        )}
      </div>

      {toast && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 size={15} /> {toast}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">

        {/* ── Personal Information ── */}
        <Section icon={User} title="Personal Information" subtitle="Basic contact and identity details">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input className={inputClass} placeholder="Your full name" {...f('full_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} value={profile?.email || ''} disabled
                style={{ background: '#F9FAFB', color: '#9CA3AF' }} />
            </div>
            <div>
              <label className={labelClass}>Phone Number</label>
              <input className={inputClass} placeholder="+27 82 000 0000" {...f('phone')} />
            </div>
            <div>
              <label className={labelClass}>WhatsApp Number</label>
              <input className={inputClass} placeholder="+27 82 000 0000" {...f('whatsapp_number')} />
            </div>
            <div>
              <label className={labelClass}>Date of Birth</label>
              <input type="date" className={inputClass} {...f('date_of_birth')} />
            </div>
            <div>
              <label className={labelClass}>Nationality</label>
              <input className={inputClass} placeholder="e.g. South African" {...f('nationality')} />
            </div>
          </div>
        </Section>

        {/* ── Travel Documents ── */}
        <Section icon={Globe} title="Travel Documents" subtitle="Passport details for travel booking and emergencies">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className={labelClass}>Passport Number</label>
              <input className={inputClass} placeholder="A12345678" {...f('passport_number')} />
            </div>
            <div>
              <label className={labelClass}>Passport Expiry</label>
              <input type="date" className={inputClass} {...f('passport_expiry')} />
            </div>
          </div>
        </Section>

        {/* ── Next of Kin ── */}
        <Section icon={Heart} title="Next of Kin" subtitle="Person to contact in an emergency">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Full Name</label>
              <input className={inputClass} placeholder="Jane Doe" {...f('kin_name')} />
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              <input className={inputClass} placeholder="e.g. Spouse, Parent" {...f('kin_relationship')} />
            </div>
            <div>
              <label className={labelClass}>Phone Number</label>
              <input className={inputClass} placeholder="+27 82 000 0000" {...f('kin_phone')} />
            </div>
            <div>
              <label className={labelClass}>Email Address</label>
              <input type="email" className={inputClass} placeholder="jane@example.com" {...f('kin_email')} />
            </div>
          </div>
        </Section>

        {/* ── Line Manager ── */}
        {(profile?.role === 'traveller' || profile?.role === 'org_admin') && profile?.org_id && (
          <Section icon={Briefcase} title="Line Manager" subtitle="Approves your travel and signs visa support letters">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input className={inputClass} placeholder="Sarah Jones" {...f('manager_name')} />
              </div>
              <div>
                <label className={labelClass}>Job Title</label>
                <input className={inputClass} placeholder="e.g. HR Manager / Director" {...f('manager_title')} />
              </div>
              <div>
                <label className={labelClass}>Email Address</label>
                <input type="email" className={inputClass} placeholder="manager@company.com" {...f('manager_email')} />
              </div>
              <div>
                <label className={labelClass}>Phone Number</label>
                <input type="tel" className={inputClass} placeholder="+27 11 000 0000" {...f('manager_phone')} />
              </div>
            </div>
          </Section>
        )}

        {/* ── Insurance & Medical ── */}
        <Section icon={Shield} title="Insurance & Medical" subtitle="Used in case of medical emergency abroad">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Travel Insurance Provider</label>
              <input className={inputClass} placeholder="e.g. Allianz, Discovery Insure" {...f('insurance_provider')} />
            </div>
            <div>
              <label className={labelClass}>Policy Number</label>
              <input className={inputClass} placeholder="INS-123456" {...f('insurance_policy')} />
            </div>
            <div>
              <label className={labelClass}>Medical Aid / Health Fund</label>
              <input className={inputClass} placeholder="e.g. Discovery Health, Bonitas" {...f('medical_aid')} />
            </div>
            <div>
              <label className={labelClass}>Medical Aid Number</label>
              <input className={inputClass} placeholder="MED-123456" {...f('medical_aid_num')} />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Blood Type</label>
              <select className={inputClass} {...f('blood_type')}>
                <option value="">Select…</option>
                {BLOOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Known Allergies</label>
              <input className={inputClass} placeholder="e.g. Penicillin, Peanuts — or None" {...f('allergies')} />
            </div>
            <div className="md:col-span-3">
              <label className={labelClass}>Current Medications</label>
              <input className={inputClass} placeholder="List any regular medications — or None" {...f('medications')} />
            </div>
          </div>
        </Section>

        {/* ── System Emergency Contacts (GSOC / alerts) ── */}
        <Section icon={Bell} title="Alert Recipients"
          subtitle="These contacts receive automated email alerts for itinerary disruptions and risk changes">
          <p className="text-xs text-gray-500 mb-4">
            These are separate from your next of kin — typically your GSOC, travel manager, or line manager.
          </p>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contact 1 — e.g. GSOC / Travel Manager</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} placeholder="GSOC Operations" {...f('emergency_contact_1_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} placeholder="gsoc@company.com" {...f('emergency_contact_1_email')} />
            </div>
          </div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Contact 2 — optional</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} placeholder="Line Manager" {...f('emergency_contact_2_name')} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} placeholder="manager@company.com" {...f('emergency_contact_2_email')} />
            </div>
          </div>
        </Section>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
          style={{ background: '#0118A1' }}>
          {saving
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
            : 'Save profile'}
        </button>
      </form>
    </Layout>
  )
}
