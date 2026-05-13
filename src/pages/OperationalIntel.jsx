/**
 * /ops-intel — Operational Intelligence Dashboard
 * Self-learning platform health, anomaly detection, chaos testing.
 * Developer/admin only.
 */
import { useEffect, useState, useCallback } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Zap, Globe, Bell, Server, Radio, Shield, TrendingUp,
  TrendingDown, Minus, ChevronDown, ChevronUp, Clock,
  BarChart2, Loader2, Play, AlertOctagon, Wifi, WifiOff,
  ArrowUpRight,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const BRAND_BLUE  = '#0118A1'
const BRAND_GREEN = '#AACC00'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPct(n)   { return n == null ? '—' : `${Math.round(n * 100)}%` }
function fmtMs(ms)   { return ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms` }
function fmtDate(d)  {
  if (!d) return '—'
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtScore(n) { return n == null ? '—' : `${Math.round(n)}` }

function scoreColor(n) {
  if (n == null) return '#6b7280'
  if (n >= 90) return '#22c55e'
  if (n >= 70) return '#f59e0b'
  if (n >= 50) return '#f97316'
  return '#ef4444'
}

function scoreBg(n) {
  if (n == null) return 'bg-gray-100 text-gray-600'
  if (n >= 90) return 'bg-green-100 text-green-700'
  if (n >= 70) return 'bg-amber-100 text-amber-700'
  if (n >= 50) return 'bg-orange-100 text-orange-700'
  return 'bg-red-100 text-red-700'
}

function reliabilityColor(score) {
  if (score == null) return '#6b7280'
  if (score >= 0.9) return '#22c55e'
  if (score >= 0.7) return '#f59e0b'
  return '#ef4444'
}

const SEV_CONFIG = {
  critical: { color: 'bg-red-100 text-red-700 border-red-200',     dot: 'bg-red-500' },
  high:     { color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  medium:   { color: 'bg-amber-100 text-amber-700 border-amber-200',  dot: 'bg-amber-500' },
  low:      { color: 'bg-blue-100 text-blue-700 border-blue-200',    dot: 'bg-blue-400' },
}

function SevBadge({ severity }) {
  const cfg = SEV_CONFIG[severity] || SEV_CONFIG.low
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {severity}
    </span>
  )
}

function StatCard({ label, value, sub, icon: Icon, color = BRAND_BLUE }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        {Icon && <Icon size={16} style={{ color }} />}
      </div>
      <span className="text-3xl font-black tracking-tight" style={{ color }}>{value}</span>
      {sub && <span className="text-xs text-gray-400 mt-0.5">{sub}</span>}
    </div>
  )
}

function SectionHeader({ title, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={16} style={{ color: BRAND_BLUE }} />}
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest">{title}</h3>
    </div>
  )
}

function ScoreBar({ value, max = 1 }) {
  const pct = value == null ? 0 : Math.min(100, (value / max) * 100)
  const color = reliabilityColor(value)
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{fmtPct(value)}</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OperationalIntel() {
  const [report, setReport]             = useState(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [runningAnalysis, setRunningAnalysis] = useState(false)
  const [runningChaos, setRunningChaos]       = useState(false)
  const [chaosResult, setChaosResult]         = useState(null)
  const [analysisMsg, setAnalysisMsg]         = useState(null)
  const [expandedAnomaly, setExpandedAnomaly] = useState(null)
  const [chaosExpanded, setChaosExpanded]     = useState(false)

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/ops-report', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setReport(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  const getAuthHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  const runAnalysis = async () => {
    setRunningAnalysis(true)
    setAnalysisMsg(null)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/ops-analyze', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (res.ok) {
        setAnalysisMsg({ ok: true, text: `Analysis complete — health score: ${json.health_score ?? '?'}` })
        await fetchReport()
      } else {
        setAnalysisMsg({ ok: false, text: json.error || 'Analysis failed' })
      }
    } catch (e) {
      setAnalysisMsg({ ok: false, text: e.message })
    } finally {
      setRunningAnalysis(false)
    }
  }

  const runChaos = async () => {
    setRunningChaos(true)
    setChaosResult(null)
    setChaosExpanded(true)
    try {
      const headers = await getAuthHeader()
      const res = await fetch('/api/chaos-test', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      setChaosResult(json)
    } catch (e) {
      setChaosResult({ ok: false, error: e.message })
    } finally {
      setRunningChaos(false)
    }
  }

  // ── Anomaly sort: critical → high → medium → low ──────────────────────────
  const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }
  const sortedAnomalies = (report?.anomalies?.items || []).slice().sort(
    (a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
  )

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Operational Intelligence</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Self-learning platform health · anomaly detection · chaos testing
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              onClick={runAnalysis}
              disabled={runningAnalysis}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition"
              style={{ background: BRAND_BLUE }}
            >
              {runningAnalysis ? <Loader2 size={14} className="animate-spin" /> : <BarChart2 size={14} />}
              Run Analysis
            </button>
            <button
              onClick={runChaos}
              disabled={runningChaos}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition"
              style={{ background: '#7c3aed' }}
            >
              {runningChaos ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              Chaos Test
            </button>
          </div>
        </div>

        {/* analysis message */}
        {analysisMsg && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${analysisMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {analysisMsg.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
            {analysisMsg.text}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
            <XCircle size={15} /> {error}
          </div>
        )}

        {loading && !report && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={28} className="animate-spin text-gray-300" />
          </div>
        )}

        {report && (
          <>
            {/* ── KPI strip ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Health Score</span>
                  <Activity size={16} style={{ color: scoreColor(report.health_score) }} />
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black tracking-tight" style={{ color: scoreColor(report.health_score) }}>
                    {fmtScore(report.health_score)}
                  </span>
                  <span className="text-lg text-gray-300 mb-1">/100</span>
                </div>
                <span className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreBg(report.health_score)}`}>
                  {report.health_score >= 90 ? 'FULLY OPERATIONAL' :
                   report.health_score >= 70 ? 'DEGRADED' :
                   report.health_score >= 50 ? 'PARTIAL' : 'CRITICAL'}
                </span>
              </div>

              <StatCard
                label="Active Anomalies"
                value={report.anomalies?.active ?? '—'}
                sub={`${report.anomalies?.distribution?.critical || 0} critical`}
                icon={AlertTriangle}
                color={report.anomalies?.active > 0 ? '#ef4444' : '#22c55e'}
              />
              <StatCard
                label="Feed Reliability"
                value={`${report.feed_reliability?.filter(f => (f.reliability_score ?? 1) >= 0.8).length ?? 0}/${report.feed_reliability?.length ?? 0}`}
                sub="feeds healthy (≥80%)"
                icon={Radio}
                color={BRAND_BLUE}
              />
              <StatCard
                label="Regional Coverage"
                value={`${report.regional_connectivity?.filter(r => r.status === 'healthy' || r.status === 'degraded').length ?? 0}/${report.regional_connectivity?.length ?? 0}`}
                sub="regions reachable"
                icon={Globe}
                color={BRAND_GREEN}
              />
            </div>

            {/* ── Predictive warnings + trend ─────────────────────────────── */}
            {(report.predictive_warnings?.length > 0 || report.trend_summary) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {report.predictive_warnings?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={16} className="text-amber-600" />
                      <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Predictive Warnings</h3>
                    </div>
                    <ul className="space-y-2">
                      {report.predictive_warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                          <AlertOctagon size={13} className="shrink-0 mt-0.5 text-amber-500" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.trend_summary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart2 size={16} className="text-blue-600" />
                      <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wide">Latest Trend Analysis</h3>
                    </div>
                    <p className="text-sm text-blue-700 leading-relaxed">{report.trend_summary}</p>
                    {report.last_analysis && (
                      <p className="text-xs text-blue-400 mt-2 flex items-center gap-1">
                        <Clock size={11} /> {fmtDate(report.last_analysis)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Active anomalies ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} style={{ color: BRAND_BLUE }} />
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Active Anomalies</h3>
                </div>
                <div className="flex items-center gap-2">
                  {Object.entries(report.anomalies?.distribution || {}).map(([sev, count]) =>
                    count > 0 ? (
                      <span key={sev} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SEV_CONFIG[sev]?.color || ''}`}>
                        {count} {sev}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {sortedAnomalies.length === 0 ? (
                  <div className="px-6 py-8 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
                    <CheckCircle2 size={24} className="text-green-400" />
                    No active anomalies detected
                  </div>
                ) : (
                  sortedAnomalies.map(a => (
                    <div key={a.id} className="px-6 py-4">
                      <button
                        className="w-full text-left"
                        onClick={() => setExpandedAnomaly(expandedAnomaly === a.id ? null : a.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-0.5">
                              <SevBadge severity={a.severity} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{a.anomaly_type?.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-gray-500 truncate mt-0.5">{a.subject} {a.message ? `— ${a.message}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.predictive && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 border border-violet-200">PREDICTIVE</span>
                            )}
                            <span className="text-xs text-gray-400">{fmtDate(a.detected_at)}</span>
                            {expandedAnomaly === a.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                          </div>
                        </div>
                      </button>
                      {expandedAnomaly === a.id && (
                        <div className="mt-3 ml-4 bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 space-y-1.5">
                          {a.metric_value != null && <p><span className="font-semibold">Metric value:</span> {typeof a.metric_value === 'number' ? a.metric_value.toFixed(3) : a.metric_value}</p>}
                          {a.threshold_value != null && <p><span className="font-semibold">Threshold:</span> {typeof a.threshold_value === 'number' ? a.threshold_value.toFixed(3) : a.threshold_value}</p>}
                          {a.region && <p><span className="font-semibold">Region:</span> {a.region}</p>}
                          {a.metadata && <pre className="text-[10px] bg-white border border-gray-100 rounded-lg p-2 overflow-x-auto">{JSON.stringify(a.metadata, null, 2)}</pre>}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ── Feed reliability + Regional ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Feed reliability */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50">
                  <SectionHeader title="Feed Reliability" icon={Radio} />
                </div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {!report.feed_reliability?.length ? (
                    <p className="px-6 py-6 text-sm text-gray-400 text-center">No feed data yet — run analysis first</p>
                  ) : (
                    report.feed_reliability.map(f => (
                      <div key={f.feed_id} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-28 shrink-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">{f.feed_id}</p>
                          {f.consecutive_failures > 0 && (
                            <p className="text-[10px] text-red-500">{f.consecutive_failures} failures</p>
                          )}
                        </div>
                        <ScoreBar value={f.reliability_score} />
                        <div className="w-16 shrink-0 text-right">
                          <p className="text-xs text-gray-400">{fmtMs(f.avg_latency_ms)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Regional connectivity */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-50">
                  <SectionHeader title="Regional Connectivity" icon={Globe} />
                </div>
                <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                  {!report.regional_connectivity?.length ? (
                    <p className="px-6 py-6 text-sm text-gray-400 text-center">No regional data yet</p>
                  ) : (
                    report.regional_connectivity.map(r => (
                      <div key={r.region_code} className="px-5 py-3 flex items-center gap-3">
                        <div className="w-32 shrink-0">
                          <p className="text-xs font-semibold text-gray-700 truncate">{r.region_name}</p>
                          <p className="text-[10px] text-gray-400">{r.region_code}</p>
                        </div>
                        <ScoreBar value={r.connectivity_score} />
                        <div className="shrink-0">
                          {r.status === 'healthy' ? (
                            <Wifi size={13} className="text-green-500" />
                          ) : r.status === 'blackout' ? (
                            <WifiOff size={13} className="text-red-500" />
                          ) : (
                            <Wifi size={13} className="text-amber-400" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ── Notification delivery + Escalation ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Notification delivery */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <SectionHeader title="Notification Delivery (24h)" icon={Bell} />
                {!Object.keys(report.notification_delivery || {}).length ? (
                  <p className="text-sm text-gray-400">No delivery data in last 24h</p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(report.notification_delivery).map(([channel, stats]) => (
                      <div key={channel}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{channel}</span>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{stats.total} sent</span>
                            <span className="font-semibold" style={{ color: reliabilityColor(stats.delivery_rate) }}>
                              {fmtPct(stats.delivery_rate)} delivered
                            </span>
                            {stats.avg_ms != null && <span>{fmtMs(stats.avg_ms)}</span>}
                          </div>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.round((stats.delivery_rate ?? 0) * 100)}%`,
                              background: reliabilityColor(stats.delivery_rate),
                            }}
                          />
                        </div>
                        {stats.failed > 0 && (
                          <p className="text-[10px] text-red-500 mt-1">{stats.failed} failed deliveries</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Escalation + WS stats */}
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <SectionHeader title="Escalation (7d)" icon={Shield} />
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-black text-gray-800">{report.escalation_stats?.total_7d ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-red-600">{report.escalation_stats?.zero_reach_7d ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Zero Reach</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-amber-600">{report.escalation_stats?.partial_reach_7d ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Partial</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <SectionHeader title="WebSocket Stability (24h)" icon={Activity} />
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-black text-gray-800">{report.websocket_stats?.total_24h ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Disconnects</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black" style={{ color: BRAND_GREEN }}>{report.websocket_stats?.reconnected_24h ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Recovered</p>
                    </div>
                    <div>
                      <p className="text-2xl font-black text-gray-800">{fmtMs(report.websocket_stats?.avg_reconnect_ms)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Avg Reconnect</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Chaos test results ───────────────────────────────────────── */}
            {(chaosResult || runningChaos) && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <button
                  className="w-full px-6 py-4 border-b border-gray-50 flex items-center justify-between"
                  onClick={() => setChaosExpanded(!chaosExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <Zap size={16} style={{ color: '#7c3aed' }} />
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Chaos Test Results</h3>
                    {chaosResult && !runningChaos && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chaosResult.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {chaosResult.survivability_score != null ? `${chaosResult.survivability_score}% survivability` : 'Error'}
                      </span>
                    )}
                    {runningChaos && <Loader2 size={14} className="animate-spin text-violet-500" />}
                  </div>
                  {chaosExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </button>

                {chaosExpanded && chaosResult && !runningChaos && (
                  <div className="p-6 space-y-4">
                    {/* assessment banner */}
                    <div className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2
                      ${chaosResult.survivability_score >= 90 ? 'bg-green-50 text-green-700 border border-green-200' :
                        chaosResult.survivability_score >= 70 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        chaosResult.survivability_score >= 50 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        'bg-red-50 text-red-700 border border-red-200'}`}>
                      {chaosResult.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {chaosResult.assessment || 'Unknown status'}
                      <span className="ml-auto text-xs font-normal opacity-70">{chaosResult.total_ms}ms</span>
                    </div>

                    {/* scenario results grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Object.entries(chaosResult.results || {}).map(([scenario, result]) => (
                        <div key={scenario} className={`rounded-xl p-3 border ${result.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{scenario}</span>
                            {result.ok
                              ? <CheckCircle2 size={13} className="text-green-500" />
                              : <XCircle size={13} className="text-red-500" />
                            }
                          </div>
                          <p className="text-[10px] text-gray-500">
                            {result.status || (result.ok ? 'ok' : 'failed')}
                          </p>
                          {result.latency_ms != null && <p className="text-[10px] text-gray-400">{fmtMs(result.latency_ms)}</p>}
                          {result.survivability_score != null && <p className="text-[10px] text-gray-400">{result.survivability_score}%</p>}
                          {result.error && <p className="text-[10px] text-red-600 truncate mt-0.5">{result.error}</p>}
                          {result.note && <p className="text-[10px] text-gray-500 mt-0.5">{result.note}</p>}
                        </div>
                      ))}
                    </div>

                    {/* detailed drill-down (feeds, regional) */}
                    {chaosResult.results?.feeds?.detail && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Feed probes</p>
                        <div className="space-y-1">
                          {Object.entries(chaosResult.results.feeds.detail).map(([id, r]) => (
                            <div key={id} className="flex items-center gap-3 text-xs">
                              {r.ok ? <CheckCircle2 size={12} className="text-green-500" /> : <XCircle size={12} className="text-red-500" />}
                              <span className="w-40 font-medium text-gray-700">{id}</span>
                              <span className="text-gray-400">{fmtMs(r.latency_ms)}</span>
                              <span className={`${r.ok ? 'text-green-600' : 'text-red-600'}`}>{r.status}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {chaosResult.results?.regional?.detail && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Regional probes</p>
                        <div className="space-y-1">
                          {Object.entries(chaosResult.results.regional.detail).map(([region, r]) => (
                            <div key={region} className="flex items-center gap-3 text-xs">
                              {r.ok ? <CheckCircle2 size={12} className="text-green-500" /> : <XCircle size={12} className="text-red-500" />}
                              <span className="w-32 font-medium text-gray-700">{region}</span>
                              <span className="text-gray-400 flex-1 truncate">{r.label}</span>
                              <span className="text-gray-400">{fmtMs(r.latency_ms)}</span>
                              {r.http_status && <span className="text-gray-400">HTTP {r.http_status}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {chaosExpanded && runningChaos && (
                  <div className="px-6 py-8 text-center text-sm text-gray-400 flex flex-col items-center gap-3">
                    <Loader2 size={24} className="animate-spin text-violet-400" />
                    Running chaos scenarios — testing feeds, database, AI, notifications, regional connectivity…
                  </div>
                )}
              </div>
            )}

            {/* ── Meta ─────────────────────────────────────────────────────── */}
            <p className="text-xs text-gray-400 text-right pb-4">
              Report generated {fmtDate(report.generated_at)} · Analysis runs every 6h automatically
            </p>
          </>
        )}
      </div>
    </Layout>
  )
}
