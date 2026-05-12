import { useEffect, useState } from 'react'
import { Megaphone, Send, Users, AlertTriangle, CheckCircle2, Clock, ChevronDown } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const SEVERITY_OPTIONS = [
  { value: 'Critical', label: 'Critical', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', emoji: '🚨' },
  { value: 'High',     label: 'High',     color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', emoji: '⚠️' },
  { value: 'Medium',   label: 'Medium',   color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', emoji: '📢' },
]

const RECIPIENT_OPTIONS = [
  { value: 'all',      label: 'All organisation travellers',         sub: 'Everyone in your org with a traveller account' },
  { value: 'active',   label: 'Currently travelling only',           sub: 'Travellers with an active trip right now' },
  { value: 'upcoming', label: 'Departing in next 7 days',            sub: 'Travellers with a trip starting this week' },
]

const inputCls  = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent bg-white'
const labelCls  = 'block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide'

export default function CrisisBroadcast() {
  const [profile, setProfile]         = useState(null)
  const [subject, setSubject]         = useState('')
  const [message, setMessage]         = useState('')
  const [severity, setSeverity]       = useState('High')
  const [recipients, setRecipients]   = useState('all')
  const [sending, setSending]         = useState(false)
  const [result, setResult]           = useState(null)   // { sent, recipient_count }
  const [error, setError]             = useState('')
  const [history, setHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [confirm, setConfirm]         = useState(false)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: prof } = await supabase.from('profiles').select('*, organisations(name)').eq('id', session.user.id).single()
    setProfile(prof)
    loadHistory(prof?.org_id)
  }

  const loadHistory = async (orgId) => {
    setLoadingHistory(true)
    try {
      let q = supabase
        .from('crisis_broadcasts')
        .select('*, profiles(full_name)')
        .order('sent_at', { ascending: false })
        .limit(20)
      if (orgId) q = q.eq('org_id', orgId)
      const { data } = await q
      setHistory(data || [])
    } catch {}
    setLoadingHistory(false)
  }

  const handleSend = async () => {
    setError('')
    if (!subject.trim()) { setError('Please enter a subject.'); return }
    if (!message.trim()) { setError('Please enter a message.'); return }
    setConfirm(false)
    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/crisis-broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subject, message, severity, recipients }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Send failed. Please try again.'); return }
      setResult(json)
      setSubject('')
      setMessage('')
      setSeverity('High')
      setRecipients('all')
      loadHistory(profile?.org_id)
    } catch {
      setError('Network error. Please check your connection and try again.')
    }
    setSending(false)
  }

  const sevOpt = SEVERITY_OPTIONS.find(s => s.value === severity) || SEVERITY_OPTIONS[1]

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Megaphone size={22} color="#0118A1" />
          Crisis Broadcast
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Send an urgent message to all or selected travellers — delivered by email and SMS
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Composer ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Success banner */}
          {result && (
            <div className="flex items-start gap-3 px-5 py-4 bg-green-50 border border-green-200 rounded-2xl">
              <CheckCircle2 size={18} className="text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-green-800">Broadcast sent successfully</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Delivered to <strong>{result.recipient_count}</strong> recipient{result.recipient_count !== 1 ? 's' : ''}
                  {result.sent !== result.recipient_count && ` (${result.sent} notifications dispatched)`}.
                </p>
              </div>
              <button onClick={() => setResult(null)} className="ml-auto text-green-400 hover:text-green-600 text-lg leading-none">×</button>
            </div>
          )}

          {/* Composer card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Severity header */}
            <div className="px-6 py-4 border-b border-gray-100">
              <p className={labelCls}>Priority / Severity</p>
              <div className="flex gap-2 flex-wrap">
                {SEVERITY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setSeverity(opt.value)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
                    style={severity === opt.value
                      ? { background: opt.color, color: '#fff', borderColor: opt.color }
                      : { background: opt.bg, color: opt.color, borderColor: opt.border }}>
                    {opt.emoji} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5">

              {/* Recipients */}
              <div>
                <label className={labelCls}>Recipients</label>
                <div className="space-y-2">
                  {RECIPIENT_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                      style={recipients === opt.value
                        ? { borderColor: '#0118A1', background: '#EEF1FF' }
                        : { borderColor: '#E5E7EB', background: '#fff' }}>
                      <input
                        type="radio" name="recipients" value={opt.value}
                        checked={recipients === opt.value}
                        onChange={() => setRecipients(opt.value)}
                        className="accent-[#0118A1]"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.sub}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className={labelCls}>Subject *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Security alert — Nairobi CBD"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>

              {/* Message */}
              <div>
                <label className={labelCls}>Message *</label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={6}
                  placeholder="Write your message here. Be clear and concise — travellers will also receive this via SMS."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {message.length} chars · SMS will truncate at 160 characters
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertTriangle size={14} className="shrink-0" /> {error}
                </div>
              )}

              {/* Preview strip */}
              {subject && message && (
                <div className="rounded-xl border overflow-hidden"
                  style={{ borderColor: sevOpt.border }}>
                  <div className="px-4 py-2 text-xs font-bold flex items-center gap-1.5"
                    style={{ background: sevOpt.color, color: '#fff' }}>
                    {sevOpt.emoji} Preview — {sevOpt.label} Priority
                  </div>
                  <div className="px-4 py-3" style={{ background: sevOpt.bg }}>
                    <p className="text-sm font-bold" style={{ color: sevOpt.color }}>{subject}</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed line-clamp-3">{message}</p>
                  </div>
                </div>
              )}

              {/* Send button */}
              {!confirm ? (
                <button
                  onClick={() => { setError(''); setConfirm(true) }}
                  disabled={!subject.trim() || !message.trim() || sending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                  style={{ background: sevOpt.color, color: '#fff' }}>
                  <Send size={15} />
                  Send Broadcast to {RECIPIENT_OPTIONS.find(r => r.value === recipients)?.label}
                </button>
              ) : (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900 mb-1">Confirm broadcast</p>
                  <p className="text-xs text-amber-700 mb-3">
                    This will send a <strong>{severity}</strong> priority message to all matching travellers via email and SMS.
                    This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleSend} disabled={sending}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
                      style={{ background: sevOpt.color, color: '#fff' }}>
                      {sending
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending…</>
                        : <><Send size={13} /> Confirm &amp; Send</>}
                    </button>
                    <button onClick={() => setConfirm(false)} disabled={sending}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-all">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── History ── */}
        <div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">Broadcast History</h2>
              <Clock size={14} className="text-gray-300" />
            </div>

            {loadingHistory ? (
              <div className="space-y-3 p-4">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: '#EEF1FF' }}>
                  <Megaphone size={18} color="#0118A1" />
                </div>
                <p className="text-xs text-gray-400">No broadcasts sent yet</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {history.map(b => {
                  const opt = SEVERITY_OPTIONS.find(s => s.value === b.severity) || SEVERITY_OPTIONS[1]
                  return (
                    <div key={b.id} className="px-5 py-3.5">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-sm">{opt.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 leading-snug truncate">{b.subject}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {new Date(b.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: opt.bg, color: opt.color }}>
                          {b.severity}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Users size={9} /> {b.recipient_count} recipient{b.recipient_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {b.message && (
                        <p className="text-[11px] text-gray-500 mt-1.5 ml-5 leading-relaxed line-clamp-2">{b.message}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
  )
}
