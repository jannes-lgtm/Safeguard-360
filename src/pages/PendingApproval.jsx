import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckCircle2, XCircle, LogOut, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

export default function PendingApproval() {
  const navigate = useNavigate()
  const [org, setOrg]       = useState(null)
  const [status, setStatus] = useState('pending')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, full_name')
        .eq('id', user.id)
        .single()

      if (!profile?.org_id) { navigate('/login'); return }

      const { data: orgData } = await supabase
        .from('organisations')
        .select('name, approval_status, contact_email')
        .eq('id', profile.org_id)
        .single()

      if (orgData) {
        setOrg(orgData)
        setStatus(orgData.approval_status)
        if (orgData.approval_status === 'approved') {
          navigate('/dashboard')
        }
      }
    }
    load()

    // Poll every 30s to catch approval without refresh
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [navigate])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F0F2F8' }}>
      <div className="w-full max-w-md">

        <div className="flex justify-center mb-8">
          <img src="/logo-blue.png" alt="SafeGuard360" className="h-10 w-auto" />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          <div className="px-6 py-5 border-b border-gray-50"
            style={{ background: status === 'rejected' ? '#FEF2F2' : `${BRAND_BLUE}08` }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: status === 'rejected' ? '#EF4444' : BRAND_BLUE }}>
                {status === 'rejected'
                  ? <XCircle size={18} color="white" />
                  : <Clock size={18} color="white" />}
              </div>
              <div>
                <h1 className="font-bold text-gray-900">
                  {status === 'rejected' ? 'Application Not Approved' : 'Awaiting Approval'}
                </h1>
                <p className="text-xs text-gray-400 mt-0.5">
                  {org?.name || 'Your organisation'}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {status === 'rejected' ? (
              <>
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <XCircle size={40} className="text-red-400" />
                  <p className="text-sm text-gray-600 leading-relaxed">
                    Unfortunately your organisation's application has not been approved at this time.
                    Please contact us for more information.
                  </p>
                </div>
                <a href="mailto:support@risk360.co"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-bold"
                  style={{ background: BRAND_BLUE, color: 'white' }}>
                  <Mail size={15} /> Contact Support
                </a>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: `${BRAND_GREEN}20` }}>
                    <Clock size={28} style={{ color: BRAND_BLUE }} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 mb-1">Your application is under review</p>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      The SafeGuard360 team is reviewing your organisation's registration.
                      You'll receive an email notification once approved — this typically takes less than 24 hours.
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">While you wait</p>
                  {[
                    'Our team verifies all organisations before granting platform access',
                    'You\'ll receive an email when your account is activated',
                    'This page refreshes automatically — no need to check back manually',
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: BRAND_GREEN }} />
                      <p className="text-xs text-gray-600">{item}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs text-blue-700 bg-blue-50 border border-blue-100">
                  <Clock size={13} className="shrink-0" />
                  This page checks for approval automatically every 30 seconds.
                </div>
              </>
            )}

            <button onClick={handleSignOut}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 transition-colors">
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
