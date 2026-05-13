/**
 * Journey Intelligence Agent
 *
 * Full-spectrum operational journey planner powered by Claude.
 * Dark operational aesthetic — enterprise travel risk command interface.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Send, Loader2, AlertTriangle, Shield, MapPin, Navigation,
  Activity, Clock, Users, Plane, ChevronRight, RefreshCw,
  Building2, Phone, Hospital, Globe2, CheckCircle2, XCircle,
  AlertCircle, Zap, Route, Target, Eye, Compass, FileText,
  ChevronDown, ChevronUp, Download, Copy, CheckCheck,
} from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       '#080C14',
  surface:  '#0D1220',
  elevated: '#111827',
  border:   'rgba(255,255,255,0.07)',
  borderHi: 'rgba(170,204,0,0.25)',
  accent:   '#AACC00',
  accentDim: 'rgba(170,204,0,0.12)',
  blue:     '#0118A1',
  blueDim:  'rgba(1,24,161,0.15)',
  text:     '#F1F5F9',
  textMid:  '#94A3B8',
  textDim:  '#475569',
  red:      '#EF4444',
  orange:   '#F97316',
  yellow:   '#EAB308',
  green:    '#10B981',
  critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#FCA5A5' },
  high:     { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)', text: '#FDBA74' },
  medium:   { bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.25)', text: '#FDE047' },
  low:      { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', text: '#6EE7B7' },
}

const RISK_COLOR = {
  Critical: C.critical,
  High:     C.high,
  Medium:   C.medium,
  Low:      C.low,
}

const RISK_DOT = {
  Critical: C.red,
  High:     C.orange,
  Medium:   C.yellow,
  Low:      C.green,
}

// ── Advisory tier config ──────────────────────────────────────────────────────
const ADVISORY_TIER = {
  'informational': {
    label: 'Informational',
    desc:  'Low risk — standard advisories apply',
    color: C.green,
    bg:    'rgba(16,185,129,0.08)',
    border:'rgba(16,185,129,0.25)',
    icon:  '●',
  },
  'advisory': {
    label: 'Advisory',
    desc:  'Moderate risk — mitigations recommended',
    color: C.yellow,
    bg:    'rgba(234,179,8,0.08)',
    border:'rgba(234,179,8,0.25)',
    icon:  '◆',
  },
  'escalate': {
    label: 'Escalate',
    desc:  'High risk — operator visibility recommended',
    color: C.orange,
    bg:    'rgba(249,115,22,0.08)',
    border:'rgba(249,115,22,0.25)',
    icon:  '▲',
  },
  'critical-review': {
    label: 'Critical Review',
    desc:  'Extreme risk — organisation-level review recommended',
    color: C.red,
    bg:    'rgba(239,68,68,0.08)',
    border:'rgba(239,68,68,0.3)',
    icon:  '■',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function RiskBadge({ level, small }) {
  const s = RISK_COLOR[level] || C.low
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider ${small ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1'} rounded-full`}
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: RISK_DOT[level] || C.green }} />
      {level}
    </span>
  )
}

function SectionToggle({ title, icon: Icon, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={13} style={{ color: C.accent }} />}
          <span className="text-xs font-bold tracking-wide" style={{ color: C.text }}>{title}</span>
          {count !== undefined && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: C.accentDim, color: C.accent }}>{count}</span>
          )}
        </div>
        {open ? <ChevronUp size={12} style={{ color: C.textDim }} /> : <ChevronDown size={12} style={{ color: C.textDim }} />}
      </button>
      {open && <div className="px-4 pb-4 border-t" style={{ borderColor: C.border }}>{children}</div>}
    </div>
  )
}

function Spinner({ size = 14 }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: C.accent }} />
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: 'Nairobi next week', icon: Plane, msg: 'I need to travel to Nairobi, Kenya next Monday for a 4-day board meeting. Flying from London.' },
  { label: 'Lagos route risk', icon: Route, msg: 'Assess the risk for road travel from Lagos to Port Harcourt. 2 travellers, business purpose.' },
  { label: 'Abuja 3 days', icon: Target, msg: 'Business trip to Abuja, Nigeria. Departing this Friday, returning Monday. 1 traveller, staying at Transcorp Hilton.' },
  { label: 'Dubai + Riyadh', icon: Compass, msg: 'Two-leg trip: Dubai for 2 days then Riyadh for 3 days. Business meetings. What are the key operational considerations?' },
]

// ── Risk gauge ────────────────────────────────────────────────────────────────
function RiskGauge({ score }) {
  const pct = Math.min(100, Math.max(0, score || 0))
  const color = pct >= 75 ? C.red : pct >= 50 ? C.orange : pct >= 25 ? C.yellow : C.green
  const level = pct >= 75 ? 'Critical' : pct >= 50 ? 'High' : pct >= 25 ? 'Medium' : 'Low'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>Overall Risk Score</span>
        <span className="text-xl font-black tabular-nums" style={{ color }}>{pct}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-bold tracking-widest uppercase" style={{ color: C.textDim }}>
        <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
      </div>
    </div>
  )
}

// ── Confidence meter ──────────────────────────────────────────────────────────
function ConfidenceMeter({ score, label, evidenceStrength }) {
  const pct  = Math.min(100, Math.max(0, score || 0))
  const color = pct >= 70 ? C.green : pct >= 45 ? C.yellow : C.orange
  const desc  = pct >= 70 ? 'Well-supported' : pct >= 45 ? 'Moderate evidence' : 'Limited data'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>
          {label || 'Assessment Confidence'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium" style={{ color }}>{desc}</span>
          <span className="text-sm font-black tabular-nums" style={{ color }}>{pct}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}70, ${color})` }} />
      </div>
      {evidenceStrength && (
        <div className="text-[9px] font-medium capitalize" style={{ color: C.textDim }}>
          Evidence: {evidenceStrength}
        </div>
      )}
    </div>
  )
}

// ── Risk trajectory indicator ─────────────────────────────────────────────────
const TRAJECTORY_CONFIG = {
  stabilizing:   { icon: '↘', label: 'Stabilizing',   color: C.green,  bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.2)' },
  baseline:      { icon: '→', label: 'Baseline',       color: C.textMid, bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
  deteriorating: { icon: '↗', label: 'Deteriorating', color: C.orange, bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)' },
  escalating:    { icon: '↑', label: 'Escalating',    color: C.red,    bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' },
  volatile:      { icon: '↕', label: 'Volatile',      color: C.yellow, bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)' },
}

function RiskTrajectoryCard({ trajectory }) {
  if (!trajectory?.direction) return null
  const cfg = TRAJECTORY_CONFIG[trajectory.direction] || TRAJECTORY_CONFIG.baseline
  const accMap = { rapid: '— moving quickly', gradual: '— gradual shift', steady: '— steady pace', none: '— no momentum' }

  return (
    <div className="rounded-xl p-4 space-y-2"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-black leading-none" style={{ color: cfg.color }}>{cfg.icon}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black" style={{ color: cfg.color }}>{cfg.label}</span>
              {trajectory.acceleration && trajectory.acceleration !== 'none' && (
                <span className="text-[9px] font-medium" style={{ color: C.textDim }}>
                  {accMap[trajectory.acceleration] || trajectory.acceleration}
                </span>
              )}
            </div>
            <div className="text-[9px] font-bold tracking-wider uppercase" style={{ color: C.textDim }}>
              Risk Trajectory
            </div>
          </div>
        </div>
        {trajectory.confidence && (
          <span className="text-[10px] font-bold tabular-nums" style={{ color: cfg.color }}>
            {trajectory.confidence}% conf.
          </span>
        )}
      </div>
      {trajectory.basis && (
        <p className="text-[11px] leading-relaxed" style={{ color: C.textMid }}>{trajectory.basis}</p>
      )}
      {trajectory.historical_comparison && (
        <div className="text-[10px] px-3 py-2 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', color: C.textDim, borderLeft: `2px solid ${cfg.color}40` }}>
          <span className="font-bold" style={{ color: C.textMid }}>vs. historical: </span>
          {trajectory.historical_comparison}
        </div>
      )}
      {trajectory.projected_window && (
        <div className="text-[10px] font-medium" style={{ color: C.textDim }}>
          Projected window: {trajectory.projected_window}
        </div>
      )}
    </div>
  )
}

// ── Pattern analysis section ──────────────────────────────────────────────────
const PATTERN_TYPE_COLOR = {
  election_cycle:       { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.25)', text: '#C4B5FD' },
  seasonal:             { bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.2)',   text: '#67E8F9'  },
  security_cycle:       { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',   text: '#FCA5A5'  },
  infrastructure_cycle: { bg: 'rgba(234,179,8,0.08)',  border: 'rgba(234,179,8,0.2)',   text: '#FDE047'  },
  economic:             { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)',  text: '#FDBA74'  },
}
const SIMILARITY_DOT = { high: C.red, moderate: C.yellow, low: C.green }

function PatternAnalysisSection({ patternAnalysis, memory }) {
  if (!patternAnalysis) return null

  const { matched_patterns = [], historical_precedents = [], active_precursors = [], pattern_summary } = patternAnalysis

  const hasSomething = matched_patterns.length > 0 || historical_precedents.length > 0 || active_precursors.length > 0

  return (
    <SectionToggle
      title="Pattern Analysis"
      icon={Activity}
      count={matched_patterns.length + active_precursors.length}
      defaultOpen={hasSomething}
    >
      <div className="space-y-3 mt-3">

        {/* Memory data indicator */}
        {memory && (
          <div className="flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg"
            style={{ background: memory.data_available ? C.accentDim : 'rgba(255,255,255,0.04)', color: memory.data_available ? C.accent : C.textDim, border: `1px solid ${memory.data_available ? C.borderHi : C.border}` }}>
            <span>{memory.data_available ? '◉' : '○'}</span>
            {memory.data_available
              ? `Platform memory active — ${memory.incident_count} incidents, ${memory.pattern_count} patterns loaded`
              : 'No platform memory for this destination — assessment based on live intel + AI knowledge'}
          </div>
        )}

        {/* Pattern summary */}
        {pattern_summary && (
          <p className="text-[11px] leading-relaxed" style={{ color: C.textMid }}>{pattern_summary}</p>
        )}

        {/* Matched patterns */}
        {matched_patterns.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] font-bold tracking-wider uppercase" style={{ color: C.textDim }}>
              Matched Historical Patterns
            </div>
            {matched_patterns.map((p, i) => {
              const tc = PATTERN_TYPE_COLOR[p.pattern_type] || PATTERN_TYPE_COLOR.seasonal
              return (
                <div key={i} className="rounded-lg p-3 space-y-1.5"
                  style={{ background: tc.bg, border: `1px solid ${tc.border}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold" style={{ color: tc.text }}>{p.pattern_name}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full"
                        style={{ background: SIMILARITY_DOT[p.current_similarity] || C.textDim }} />
                      <span className="text-[9px] font-bold uppercase tracking-wide capitalize"
                        style={{ color: SIMILARITY_DOT[p.current_similarity] || C.textDim }}>
                        {p.current_similarity} similarity
                      </span>
                    </div>
                  </div>
                  {p.relevance && <p className="text-[10px]" style={{ color: C.textMid }}>{p.relevance}</p>}
                  {p.historical_precedent && (
                    <div className="text-[10px] px-2 py-1 rounded"
                      style={{ background: 'rgba(255,255,255,0.06)', color: C.textDim }}>
                      Precedent: {p.historical_precedent}
                    </div>
                  )}
                  {p.implication && (
                    <div className="text-[10px] font-medium" style={{ color: C.accent }}>→ {p.implication}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Active precursors */}
        {active_precursors.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] font-bold tracking-wider uppercase" style={{ color: C.orange }}>
              Active Precursor Signals
            </div>
            {active_precursors.map((p, i) => (
              <div key={i} className="rounded-lg p-3 space-y-1"
                style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold" style={{ color: '#FDBA74' }}>{p.signal}</span>
                  {p.confidence && (
                    <span className="text-[9px] font-bold" style={{ color: C.orange }}>{p.confidence}%</span>
                  )}
                </div>
                <div className="text-[10px]" style={{ color: C.textMid }}>
                  Historically precedes: {p.typical_outcome}
                </div>
                {p.lead_time && (
                  <div className="text-[9px]" style={{ color: C.textDim }}>Lead time: {p.lead_time}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Historical precedents */}
        {historical_precedents.length > 0 && (
          <div className="space-y-2">
            <div className="text-[9px] font-bold tracking-wider uppercase" style={{ color: C.textDim }}>
              Historical Precedents
            </div>
            {historical_precedents.map((p, i) => (
              <div key={i} className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: C.text }}>{p.incident}</span>
                  {p.date && (
                    <span className="text-[9px]" style={{ color: C.textDim }}>{p.date}</span>
                  )}
                </div>
                {p.similarity_to_current && (
                  <p className="text-[10px] mb-1" style={{ color: C.textMid }}>
                    Similarity: {p.similarity_to_current}
                  </p>
                )}
                {p.outcome && <p className="text-[10px]" style={{ color: C.textDim }}>Outcome: {p.outcome}</p>}
                {p.recurrence_risk && p.recurrence_risk !== 'low' && (
                  <div className="text-[9px] font-bold mt-1 uppercase tracking-wide"
                    style={{ color: p.recurrence_risk === 'high' ? C.red : C.orange }}>
                    Recurrence risk: {p.recurrence_risk}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!hasSomething && (
          <p className="text-[11px]" style={{ color: C.textDim }}>
            No specific historical patterns matched for this destination. Assessment based on live intelligence and regional knowledge.
          </p>
        )}
      </div>
    </SectionToggle>
  )
}

// ── Confidence assessment section ─────────────────────────────────────────────
function ConfidenceSection({ confidence }) {
  if (!confidence) return null
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2">
        <Eye size={12} style={{ color: C.textDim }} />
        <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>
          Evidence Basis
        </span>
      </div>
      <ConfidenceMeter
        score={confidence.overall_confidence}
        evidenceStrength={confidence.evidence_strength}
      />
      {confidence.primary_evidence_sources?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textDim }}>
            Primary Sources
          </div>
          <div className="flex flex-wrap gap-1">
            {confidence.primary_evidence_sources.map((s, i) => (
              <span key={i} className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: C.textDim, border: `1px solid ${C.border}` }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {confidence.uncertainty_factors?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textDim }}>
            Uncertainty Factors
          </div>
          {confidence.uncertainty_factors.map((f, i) => (
            <div key={i} className="text-[10px] flex items-start gap-1.5">
              <span style={{ color: C.yellow }}>~</span>
              <span style={{ color: C.textDim }}>{f}</span>
            </div>
          ))}
        </div>
      )}
      {confidence.analyst_note && (
        <div className="text-[10px] px-3 py-2 rounded-lg italic"
          style={{ background: 'rgba(255,255,255,0.04)', color: C.textDim, borderLeft: `2px solid ${C.borderHi}` }}>
          {confidence.analyst_note}
        </div>
      )}
    </div>
  )
}

// ── Journey summary card ──────────────────────────────────────────────────────
function JourneySummaryCard({ journey }) {
  if (!journey?.destination) return null
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: C.elevated, border: `1px solid ${C.borderHi}` }}>
      <div className="flex items-center gap-2">
        <Navigation size={12} style={{ color: C.accent }} />
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.accent }}>Journey Profile</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {journey.origin && (
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Origin</div>
            <div className="text-xs font-semibold" style={{ color: C.text }}>{journey.origin}</div>
          </div>
        )}
        <div>
          <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Destination</div>
          <div className="text-xs font-semibold" style={{ color: C.accent }}>{journey.destination}</div>
        </div>
        {journey.departDate && (
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Departs</div>
            <div className="text-xs font-semibold" style={{ color: C.text }}>{journey.departDate}</div>
          </div>
        )}
        {journey.returnDate && (
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Returns</div>
            <div className="text-xs font-semibold" style={{ color: C.text }}>{journey.returnDate}</div>
          </div>
        )}
        {journey.travellerCount && (
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Travellers</div>
            <div className="text-xs font-semibold" style={{ color: C.text }}>{journey.travellerCount}</div>
          </div>
        )}
        {journey.purpose && (
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase mb-0.5" style={{ color: C.textDim }}>Purpose</div>
            <div className="text-xs font-semibold" style={{ color: C.text }}>{journey.purpose}</div>
          </div>
        )}
      </div>
      {journey.transitPoints?.length > 0 && (
        <div>
          <div className="text-[9px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textDim }}>Transit</div>
          <div className="flex flex-wrap gap-1">
            {journey.transitPoints.map((t, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: C.blueDim, color: '#93C5FD' }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analysis panel ────────────────────────────────────────────────────────────
function AnalysisPanel({ analysis, assets, memory }) {
  const [copied, setCopied] = useState(false)

  const copyBrief = () => {
    if (!analysis) return
    const tier = ADVISORY_TIER[analysis.advisory_tier]
    const text = [
      `CAIRO OPERATIONAL INTELLIGENCE ADVISORY — SafeGuard 360`,
      `Generated: ${new Date().toISOString()}`,
      `Advisory status: ${tier?.label || analysis.advisory_tier || 'Unknown'} — ${tier?.desc || ''}`,
      '',
      `RISK ASSESSMENT: ${analysis.overall_risk} (score: ${analysis.overall_risk_score}/100)`,
      analysis.advisory_tier_rationale && `Basis: ${analysis.advisory_tier_rationale}`,
      '',
      analysis.destination_risk?.summary && `DESTINATION INTELLIGENCE:\n${analysis.destination_risk.summary}`,
      analysis.destination_risk?.advisory_context && `Note: ${analysis.destination_risk.advisory_context}`,
      '',
      analysis.regional_instability?.summary && `REGIONAL SITUATION:\n${analysis.regional_instability.summary}`,
      '',
      analysis.recommended_mitigations?.length && `RECOMMENDED MITIGATIONS:\n${analysis.recommended_mitigations.map(m => `• [${m.priority}] ${m.action}`).join('\n')}`,
      '',
      analysis.operational_checklist?.length && `OPERATIONAL CHECKLIST (advisory):\n${analysis.operational_checklist.map(c => `☐ ${c}`).join('\n')}`,
      '',
      analysis.monitoring_recommendations?.length && `MONITORING RECOMMENDATIONS:\n${analysis.monitoring_recommendations.map(r => `• ${r}`).join('\n')}`,
      '',
      analysis.contingency_planning?.length && `CONTINGENCY PLANNING:\n${analysis.contingency_planning.map(r => `• ${r}`).join('\n')}`,
      '',
      analysis.risk_trajectory?.direction && `RISK TRAJECTORY: ${analysis.risk_trajectory.direction.toUpperCase()} (${analysis.risk_trajectory.acceleration}) — confidence ${analysis.risk_trajectory.confidence}%\n${analysis.risk_trajectory.basis || ''}`,
      '',
      analysis.pattern_analysis?.matched_patterns?.length && `HISTORICAL PATTERNS MATCHED:\n${analysis.pattern_analysis.matched_patterns.map(p => `• ${p.pattern_name} (${p.current_similarity} similarity) — ${p.implication || p.relevance || ''}`).join('\n')}`,
      '',
      analysis.confidence_assessment && `ASSESSMENT CONFIDENCE: ${analysis.confidence_assessment.overall_confidence}/100 (${analysis.confidence_assessment.evidence_strength})\nUncertainty: ${analysis.confidence_assessment.uncertainty_factors?.join(', ') || 'None stated'}`,
      '',
      `This advisory supports decision-making. Operators and travellers retain full authority.`,
      `Intel sources consulted: ${analysis.intel_sources_used || 0}`,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!analysis) return null

  const destRisk = RISK_COLOR[analysis.destination_risk?.level] || C.low
  const exp = analysis.operational_exposure || {}

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={12} style={{ color: C.accent }} />
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: C.accent }}>Intelligence Assessment</span>
          {analysis.intel_sources_used > 0 && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ background: C.accentDim, color: C.accent }}>
              {analysis.intel_sources_used} sources
            </span>
          )}
        </div>
        <button onClick={copyBrief} title="Copy brief to clipboard"
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg font-medium transition-all hover:opacity-80"
          style={{ background: C.accentDim, color: C.accent }}>
          {copied ? <CheckCheck size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy Brief'}
        </button>
      </div>

      {/* Advisory tier banner */}
      {analysis.advisory_tier && (() => {
        const tier = ADVISORY_TIER[analysis.advisory_tier] || ADVISORY_TIER['informational']
        return (
          <div className="rounded-xl p-4 space-y-1.5"
            style={{ background: tier.bg, border: `1px solid ${tier.border}` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black leading-none" style={{ color: tier.color }}>{tier.icon}</span>
                <span className="text-[11px] font-black tracking-wide uppercase" style={{ color: tier.color }}>
                  {tier.label}
                </span>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.07)', color: tier.color }}>
                Advisory only
              </span>
            </div>
            <p className="text-[11px]" style={{ color: C.textMid }}>{tier.desc}</p>
            {analysis.advisory_tier_rationale && (
              <p className="text-[10px]" style={{ color: C.textDim }}>{analysis.advisory_tier_rationale}</p>
            )}
          </div>
        )
      })()}

      {/* Risk gauge + trajectory side by side feel */}
      <div className="rounded-xl p-4" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
        <RiskGauge score={analysis.overall_risk_score} />
      </div>

      {/* Risk trajectory */}
      <RiskTrajectoryCard trajectory={analysis.risk_trajectory} />

      {/* Operator notifications — escalate / critical-review tiers */}
      {analysis.operator_notifications?.length > 0 && (
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={12} style={{ color: C.orange }} />
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.orange }}>
              Operator Awareness
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(255,255,255,0.06)', color: C.textDim }}>
              For operator review — not a restriction
            </span>
          </div>
          {analysis.operator_notifications.map((note, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span style={{ color: C.orange }}>→</span>
              <span style={{ color: C.textMid }}>{note}</span>
            </div>
          ))}
        </div>
      )}

      {/* Destination risk */}
      <div className="rounded-xl p-4 space-y-3"
        style={{ background: C.elevated, border: `1px solid ${destRisk.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={12} style={{ color: destRisk.text }} />
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>Destination Intelligence</span>
          </div>
          <RiskBadge level={analysis.destination_risk?.level} small />
        </div>
        {analysis.destination_risk?.summary && (
          <p className="text-[11px] leading-relaxed" style={{ color: C.textMid }}>
            {analysis.destination_risk.summary}
          </p>
        )}
        {analysis.destination_risk?.key_threats?.length > 0 && (
          <div className="space-y-1">
            {analysis.destination_risk.key_threats.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-[9px] mt-0.5 w-3 h-3 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: destRisk.bg, color: destRisk.text, border: `1px solid ${destRisk.border}` }}>•</span>
                <span className="text-[11px]" style={{ color: C.textMid }}>{t}</span>
              </div>
            ))}
          </div>
        )}
        {analysis.destination_risk?.advisory_context && (
          <div className="text-[10px] px-3 py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.04)', color: C.textDim, borderLeft: `2px solid ${C.accent}` }}>
            <span className="font-bold" style={{ color: C.accent }}>Advisory: </span>
            {analysis.destination_risk.advisory_context}
          </div>
        )}
      </div>

      {/* Operational exposure matrix */}
      {Object.keys(exp).length > 0 && (
        <div className="rounded-xl p-4 space-y-3"
          style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-2">
            <Activity size={12} style={{ color: C.accent }} />
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>Threat Matrix</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(exp).map(([key, level]) => {
              const label = key.replace(/_risk$/, '').replace(/_/g, ' ')
              const dot = RISK_DOT[level] || C.green
              return (
                <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-[10px] font-medium capitalize" style={{ color: C.textMid }}>{label}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                    <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: dot }}>{level}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pattern analysis */}
      <PatternAnalysisSection
        patternAnalysis={analysis.pattern_analysis}
        memory={memory}
      />

      {/* Confidence assessment */}
      <ConfidenceSection confidence={analysis.confidence_assessment} />

      {/* Route risks */}
      {analysis.route_risks?.length > 0 && (
        <SectionToggle title="Route Intelligence" icon={Route} count={analysis.route_risks.length} defaultOpen>
          <div className="space-y-2 mt-3">
            {analysis.route_risks.map((r, i) => {
              const rc = RISK_COLOR[r.risk_level] || C.low
              return (
                <div key={i} className="rounded-lg p-3 space-y-2"
                  style={{ background: rc.bg, border: `1px solid ${rc.border}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold" style={{ color: rc.text }}>{r.segment}</span>
                    <RiskBadge level={r.risk_level} small />
                  </div>
                  {r.concerns?.map((c, j) => (
                    <div key={j} className="text-[10px]" style={{ color: C.textMid }}>• {c}</div>
                  ))}
                  {(r.advisory || r.recommendation) && (
                    <div className="text-[10px] font-medium" style={{ color: C.accent }}>
                      → {r.advisory || r.recommendation}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionToggle>
      )}

      {/* Regional instability */}
      {analysis.regional_instability?.summary && (
        <SectionToggle title="Regional Situation" icon={Globe2}>
          <div className="space-y-2 mt-3">
            <p className="text-[11px] leading-relaxed" style={{ color: C.textMid }}>
              {analysis.regional_instability.summary}
            </p>
            {analysis.regional_instability.active_conflicts?.length > 0 && (
              <div>
                <div className="text-[9px] font-bold tracking-wider uppercase mb-1" style={{ color: C.textDim }}>Active Conflicts</div>
                {analysis.regional_instability.active_conflicts.map((c, i) => (
                  <div key={i} className="text-[10px] flex items-start gap-1.5 mb-1">
                    <span style={{ color: C.red }}>•</span>
                    <span style={{ color: C.textMid }}>{c}</span>
                  </div>
                ))}
              </div>
            )}
            {analysis.regional_instability.political_situation && (
              <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: C.textMid }}>
                <span className="font-bold" style={{ color: C.text }}>Political: </span>
                {analysis.regional_instability.political_situation}
              </div>
            )}
          </div>
        </SectionToggle>
      )}

      {/* Infrastructure concerns */}
      {analysis.infrastructure_concerns?.length > 0 && (
        <SectionToggle title="Infrastructure Concerns" icon={AlertCircle} count={analysis.infrastructure_concerns.length}>
          <div className="space-y-1 mt-3">
            {analysis.infrastructure_concerns.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: C.textMid }}>
                <span style={{ color: C.yellow }}>⚠</span> {c}
              </div>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* Recommended mitigations */}
      {(analysis.recommended_mitigations || analysis.mitigations)?.length > 0 && (
        <SectionToggle title="Recommended Mitigations" icon={Shield}
          count={(analysis.recommended_mitigations || analysis.mitigations).length} defaultOpen>
          <p className="text-[10px] mt-3 mb-2" style={{ color: C.textDim }}>
            Advisory recommendations — operator and traveller determine which to adopt.
          </p>
          <div className="space-y-2">
            {(analysis.recommended_mitigations || analysis.mitigations).map((m, i) => {
              const mc = RISK_COLOR[m.priority] || C.low
              return (
                <div key={i} className="rounded-lg p-3"
                  style={{ background: mc.bg, border: `1px solid ${mc.border}` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <RiskBadge level={m.priority} small />
                    {m.type && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide"
                        style={{ background: 'rgba(255,255,255,0.07)', color: C.textDim }}>
                        {m.type}
                      </span>
                    )}
                    <span className="text-[11px] font-semibold" style={{ color: C.text }}>{m.action}</span>
                  </div>
                  {m.rationale && (
                    <p className="text-[10px]" style={{ color: C.textMid }}>{m.rationale}</p>
                  )}
                </div>
              )
            })}
          </div>
        </SectionToggle>
      )}

      {/* Alternate routing */}
      {analysis.alternate_routing?.recommended && (
        <div className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(249,115,22,0.06)', border: `1px solid rgba(249,115,22,0.2)` }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Route size={12} style={{ color: C.orange }} />
              <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.orange }}>
                Alternate Routing Suggested
              </span>
            </div>
            <span className="text-[9px] font-medium px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.06)', color: C.textDim }}>Operator decides</span>
          </div>
          <p className="text-[11px]" style={{ color: C.textMid }}>{analysis.alternate_routing.reason}</p>
          {analysis.alternate_routing.note && (
            <p className="text-[10px] italic" style={{ color: C.textDim }}>{analysis.alternate_routing.note}</p>
          )}
          {analysis.alternate_routing.alternatives?.map((alt, i) => (
            <div key={i} className="text-[11px] flex items-start gap-1.5">
              <span style={{ color: C.accent }}>→</span>
              <span style={{ color: C.text }}>{alt}</span>
            </div>
          ))}
        </div>
      )}

      {/* Operational checklist */}
      {(analysis.operational_checklist || analysis.pre_departure_checklist)?.length > 0 && (
        <SectionToggle title="Operational Checklist"
          icon={CheckCircle2}
          count={(analysis.operational_checklist || analysis.pre_departure_checklist).length}
          defaultOpen>
          <p className="text-[10px] mt-3 mb-2" style={{ color: C.textDim }}>
            Recommended preparations — advisory only.
          </p>
          <div className="space-y-1.5">
            {(analysis.operational_checklist || analysis.pre_departure_checklist).map((item, i) => (
              <label key={i} className="flex items-start gap-2 cursor-pointer group">
                <div className="w-4 h-4 rounded border mt-0.5 shrink-0 flex items-center justify-center"
                  style={{ borderColor: C.borderHi, background: C.accentDim }}>
                  <CheckCircle2 size={10} style={{ color: C.accent }} />
                </div>
                <span className="text-[11px]" style={{ color: C.textMid }}>{item}</span>
              </label>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* Monitoring recommendations */}
      {analysis.monitoring_recommendations?.length > 0 && (
        <SectionToggle title="Monitoring Recommendations" icon={Activity} count={analysis.monitoring_recommendations.length}>
          <div className="space-y-1.5 mt-3">
            {analysis.monitoring_recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span style={{ color: C.accent }}>◉</span>
                <span style={{ color: C.textMid }}>{r}</span>
              </div>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* Contingency planning */}
      {analysis.contingency_planning?.length > 0 && (
        <SectionToggle title="Contingency Planning" icon={FileText} count={analysis.contingency_planning.length}>
          <div className="space-y-1.5 mt-3">
            {analysis.contingency_planning.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span style={{ color: C.yellow }}>◆</span>
                <span style={{ color: C.textMid }}>{r}</span>
              </div>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* Safe zones */}
      {analysis.safe_zones?.length > 0 && (
        <SectionToggle title="Safe Zones / Areas" icon={CheckCircle2} count={analysis.safe_zones.length}>
          <div className="space-y-1 mt-3">
            {analysis.safe_zones.map((z, i) => (
              <div key={i} className="text-[11px] flex items-start gap-1.5">
                <span style={{ color: C.green }}>✓</span>
                <span style={{ color: C.textMid }}>{z}</span>
              </div>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* Assets: hospitals & embassies */}
      {assets && (
        <>
          {assets.hospitals?.length > 0 && (
            <SectionToggle title="Medical Facilities" icon={Hospital} count={assets.hospitals.length}>
              <div className="space-y-2 mt-3">
                {assets.hospitals.map((h, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold" style={{ color: C.text }}>{h.name}</span>
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(16,185,129,0.12)', color: '#6EE7B7', border: '1px solid rgba(16,185,129,0.2)' }}>
                        {h.type}
                      </span>
                    </div>
                    {h.address && <div className="text-[10px]" style={{ color: C.textDim }}>{h.address}</div>}
                    {h.phone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone size={9} style={{ color: C.accent }} />
                        <span className="text-[10px] font-mono" style={{ color: C.accent }}>{h.phone}</span>
                      </div>
                    )}
                    {h.notes && <div className="text-[10px] mt-1" style={{ color: C.textDim }}>{h.notes}</div>}
                  </div>
                ))}
              </div>
            </SectionToggle>
          )}

          {assets.embassies?.length > 0 && (
            <SectionToggle title="Diplomatic Missions" icon={Building2} count={assets.embassies.length}>
              <div className="space-y-2 mt-3">
                {assets.embassies.map((e, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="text-[11px] font-bold mb-1" style={{ color: C.text }}>{e.country} Embassy</div>
                    {e.address && <div className="text-[10px]" style={{ color: C.textDim }}>{e.address}</div>}
                    {e.phone && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone size={9} style={{ color: C.textMid }} />
                        <span className="text-[10px] font-mono" style={{ color: C.textMid }}>{e.phone}</span>
                      </div>
                    )}
                    {e.emergency && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Phone size={9} style={{ color: C.orange }} />
                        <span className="text-[10px] font-mono font-bold" style={{ color: C.orange }}>
                          Emergency: {e.emergency}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionToggle>
          )}

          {assets.emergency_numbers && Object.keys(assets.emergency_numbers).some(k => assets.emergency_numbers[k]) && (
            <div className="rounded-xl p-4" style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2 mb-3">
                <Phone size={12} style={{ color: C.red }} />
                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: C.textMid }}>Emergency Numbers</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(assets.emergency_numbers).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-2 py-1.5 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                    <span className="text-[9px] capitalize font-bold" style={{ color: C.textDim }}>{k}</span>
                    <span className="text-[11px] font-black font-mono" style={{ color: C.red }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isPhase = msg.role === 'phase'

  if (isPhase) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px" style={{ background: C.border }} />
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full"
          style={{ background: C.accentDim, border: `1px solid ${C.borderHi}` }}>
          <Zap size={9} style={{ color: C.accent }} />
          <span className="text-[9px] font-bold tracking-wider uppercase" style={{ color: C.accent }}>
            {msg.text}
          </span>
        </div>
        <div className="flex-1 h-px" style={{ background: C.border }} />
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mr-2 mt-0.5"
          style={{ background: C.accentDim, border: `1px solid ${C.borderHi}` }}>
          <Shield size={12} style={{ color: C.accent }} />
        </div>
      )}
      <div
        className="max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap"
        style={isUser
          ? { background: C.blue, color: 'white', borderBottomRightRadius: 4 }
          : { background: C.elevated, color: C.text, border: `1px solid ${C.border}`, borderBottomLeftRadius: 4 }
        }
      >
        {msg.text}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ml-2 mt-0.5"
          style={{ background: C.blueDim, border: `1px solid rgba(1,24,161,0.3)' ` }}>
          <Users size={12} style={{ color: '#93C5FD' }} />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function JourneyAgent() {
  const [profile, setProfile] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [journey, setJourney] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [assets, setAssets] = useState(null)
  const [memory, setMemory] = useState(null)
  const [phase, setPhase] = useState('idle')
  const [showAnalysis, setShowAnalysis] = useState(false)

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Load profile
  useEffect(() => {
    supabase.from('profiles').select('full_name, role, org_id').eq('id', (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id
    })()).maybeSingle().then(({ data }) => setProfile(data))

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('full_name, role, org_id').eq('id', user.id).maybeSingle()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  // Initial greeting
  useEffect(() => {
    const name = profile?.full_name?.split(' ')[0]
    setMessages([{
      role: 'assistant',
      text: `${name ? `CAIRO online. Ready, ${name}.` : 'CAIRO online.'}\n\nI'm your operational travel intelligence agent. Describe your journey and I'll produce a full risk advisory — situational awareness, threat context, historical pattern analysis, recommended mitigations, and contingency planning.\n\nI advise and contextualise. You and your team decide.\n\nExample: "Travelling to Nairobi next Monday for a 3-day board meeting, flying from London."`,
    }])
  }, [profile])

  // Pick up preloaded journey from Itinerary planner (via sessionStorage)
  useEffect(() => {
    if (messages.length === 0) return  // wait for greeting to render
    const raw = sessionStorage.getItem('journeyAgentPreload')
    if (!raw) return
    try {
      sessionStorage.removeItem('journeyAgentPreload')
      const preload = JSON.parse(raw)
      if (!preload?.destination) return

      // Build a natural language message from the stored fields
      const parts = []
      if (preload.origin && preload.destination)
        parts.push(`Travelling from ${preload.origin} to ${preload.destination}`)
      else if (preload.destination)
        parts.push(`Travelling to ${preload.destination}`)

      if (preload.departDate) parts.push(`departing ${preload.departDate}`)
      if (preload.returnDate)  parts.push(`returning ${preload.returnDate}`)
      if (preload.travellerCount && preload.travellerCount > 1)
        parts.push(`${preload.travellerCount} travellers`)
      if (preload.purpose)    parts.push(`purpose: ${preload.purpose}`)
      if (preload.tripName)   parts.push(`(${preload.tripName})`)

      const autoMsg = parts.join(', ') + '. Please generate a full operational risk advisory.'

      // Small delay so the greeting message is visible before auto-send
      setTimeout(() => send(autoMsg, 'analyze'), 600)
    } catch {
      // Malformed sessionStorage — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length])

  useEffect(() => {
    if (messages.length > 1) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addPhaseMsg = useCallback((text) => {
    setMessages(prev => [...prev, { role: 'phase', text }])
  }, [])

  const send = async (overrideMsg, actionOverride) => {
    const text = (overrideMsg || input).trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const newHistory = [...messages, { role: 'user', text }]
    setMessages(newHistory)
    setPhase('processing')

    const action = actionOverride || 'chat'

    try {
      const { data: { session } } = await supabase.auth.getSession()

      // Show phase indicators for analysis actions
      if (action === 'analyze' || (journey?.destination && journey?.complete)) {
        addPhaseMsg('Extracting journey parameters…')
        await new Promise(r => setTimeout(r, 300))
        addPhaseMsg('Querying live intelligence feeds + operational memory…')
      }

      const res = await fetch('/api/journey-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          message: text,
          action,
          journey,
          history: messages,
          orgContext: profile?.org_id ? { orgName: profile.org_id } : null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.error || 'Error processing request.' }])
        setSending(false)
        setPhase('idle')
        return
      }

      // Update journey state
      if (data.journey?.destination) {
        setJourney(data.journey)
      }

      // Update analysis
      if (data.analysis) {
        setAnalysis(data.analysis)
        setAssets(data.assets || null)
        setMemory(data.memory || null)
        setShowAnalysis(true)
        const tier = ADVISORY_TIER[data.analysis.advisory_tier]
        const tierLabel = tier?.label || data.analysis.overall_risk
        const memNote = data.memory?.data_available
          ? ` · ${data.memory.incident_count}+ historical incidents`
          : ''
        addPhaseMsg(`CAIRO advisory ready — ${tierLabel} · ${data.analysis.overall_risk} risk (${data.analysis.overall_risk_score}/100)${memNote}`)
      }

      setMessages(prev => [...prev, { role: 'assistant', text: data.reply }])
      setPhase(data.phase || 'idle')

    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Connection error. Please try again.' }])
      setPhase('idle')
    }

    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const runAnalysis = () => {
    if (!journey?.destination) return
    send(`Generate the full operational intelligence advisory for this journey.`, 'analyze')
  }

  const reset = () => {
    setJourney(null)
    setAnalysis(null)
    setAssets(null)
    setMemory(null)
    setPhase('idle')
    setShowAnalysis(false)
    const name = profile?.full_name?.split(' ')[0]
    setMessages([{
      role: 'assistant',
      text: `${name ? `CAIRO online. Ready, ${name}.` : 'CAIRO online.'}\n\nDescribe your journey and I'll produce a full operational intelligence advisory — situational awareness, threat context, pattern analysis, and contingency planning.\n\nI advise and contextualise. You and your team decide.`,
    }])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const hasJourney  = !!journey?.destination
  const hasAnalysis = !!analysis

  return (
    <Layout>
      <div className="min-h-screen" style={{ background: C.bg }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between"
          style={{ background: C.bg, borderBottom: `1px solid ${C.border}`, backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: C.accentDim, border: `1px solid ${C.borderHi}` }}>
              <Compass size={15} style={{ color: C.accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-tight" style={{ color: C.text }}>
                  CAIRO
                </span>
                <span className="text-[10px] font-semibold tracking-wide" style={{ color: C.textDim }}>
                  Operational Travel Intelligence
                </span>
                <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: C.accentDim, color: C.accent, border: `1px solid ${C.borderHi}` }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> ONLINE
                </span>
              </div>
              <p className="text-[10px]" style={{ color: C.textDim }}>
                Contextual Adaptive Intelligence for Route Operations · SafeGuard 360
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasAnalysis && (
              <button onClick={() => setShowAnalysis(v => !v)}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: showAnalysis ? C.accentDim : 'rgba(255,255,255,0.04)', color: showAnalysis ? C.accent : C.textMid, border: `1px solid ${showAnalysis ? C.borderHi : C.border}` }}>
                <Eye size={11} /> {showAnalysis ? 'Hide Intel' : 'Show Intel'}
              </button>
            )}
            {hasJourney && (
              <button onClick={runAnalysis} disabled={sending}
                className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                style={{ background: hasAnalysis ? 'rgba(255,255,255,0.04)' : C.accent, color: hasAnalysis ? C.textMid : C.bg, border: `1px solid ${hasAnalysis ? C.border : C.accent}` }}>
                {sending ? <Spinner size={11} /> : <Zap size={11} />}
                {hasAnalysis ? 'Refresh Advisory' : 'Run CAIRO'}
              </button>
            )}
            <button onClick={reset} title="New journey"
              className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all hover:bg-white/8"
              style={{ color: C.textDim, border: `1px solid ${C.border}` }}>
              <RefreshCw size={11} /> New
            </button>
          </div>
        </div>

        {/* ── Main layout ─────────────────────────────────────────────────────── */}
        <div className={`flex gap-0 ${showAnalysis && hasAnalysis ? 'lg:gap-5 lg:p-5' : 'p-4 max-w-2xl mx-auto'}`}>

          {/* ── Left: Chat panel ────────────────────────────────────────────── */}
          <div className={`flex-1 flex flex-col ${showAnalysis && hasAnalysis ? 'lg:min-w-0' : ''}`}>

            {/* Journey summary card */}
            {hasJourney && (
              <div className="mb-3">
                <JourneySummaryCard journey={journey} />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 space-y-3 mb-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
              {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
              {sending && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: C.accentDim, border: `1px solid ${C.borderHi}` }}>
                    <Shield size={12} style={{ color: C.accent }} />
                  </div>
                  <div className="px-4 py-3 rounded-2xl flex items-center gap-2"
                    style={{ background: C.elevated, border: `1px solid ${C.border}` }}>
                    <Spinner size={12} />
                    <span className="text-[11px]" style={{ color: C.textMid }}>CAIRO processing…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick prompts — show only when no journey yet */}
            {!hasJourney && messages.length <= 1 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {QUICK_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => send(p.msg)}
                    className="flex items-center gap-2 text-left px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all hover:opacity-90"
                    style={{ background: C.elevated, border: `1px solid ${C.border}`, color: C.textMid }}>
                    <p.icon size={12} style={{ color: C.accent, shrink: 0 }} />
                    {p.label}
                    <ChevronRight size={10} className="ml-auto shrink-0" style={{ color: C.textDim }} />
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: C.elevated, border: `1px solid ${C.border}`, boxShadow: '0 0 0 1px rgba(170,204,0,0.06)' }}>
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={sending}
                placeholder="Describe your journey — destination, dates, purpose, transport mode…"
                className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm focus:outline-none placeholder:text-sm"
                style={{ color: C.text, caretColor: C.accent }}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <div className="flex items-center gap-2">
                  {hasJourney && !hasAnalysis && (
                    <button onClick={runAnalysis} disabled={sending}
                      className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                      style={{ background: C.accent, color: C.bg }}>
                      <Zap size={11} />
                      Get CAIRO Advisory
                    </button>
                  )}
                  {!hasJourney && (
                    <span className="text-[10px]" style={{ color: C.textDim }}>
                      Press Enter to send
                    </span>
                  )}
                </div>
                <button
                  onClick={() => send()}
                  disabled={sending || !input.trim()}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
                  style={{ background: input.trim() ? C.accent : 'rgba(255,255,255,0.06)' }}>
                  {sending
                    ? <Spinner size={13} />
                    : <Send size={13} style={{ color: input.trim() ? C.bg : C.textDim }} />
                  }
                </button>
              </div>
            </div>
          </div>

          {/* ── Right: Intelligence panel ────────────────────────────────────── */}
          {showAnalysis && hasAnalysis && (
            <div className="hidden lg:block w-[420px] shrink-0 overflow-y-auto space-y-3"
              style={{ maxHeight: 'calc(100vh - 100px)' }}>
              <AnalysisPanel analysis={analysis} assets={assets} memory={memory} />
            </div>
          )}
        </div>

        {/* ── Mobile analysis panel (below chat) ─────────────────────────────── */}
        {showAnalysis && hasAnalysis && (
          <div className="lg:hidden px-4 pb-6 space-y-3">
            <div className="h-px my-4" style={{ background: C.border }} />
            <AnalysisPanel analysis={analysis} assets={assets} />
          </div>
        )}
      </div>
    </Layout>
  )
}
