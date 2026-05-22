import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MapPin, Shield, ArrowRight, Globe,
  Navigation, AlertTriangle, Activity,
  Users, Layers, Clock, Compass, TrendingUp, Radio,
  Crosshair, BarChart2,
} from 'lucide-react'

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:         '#090A0C',
  bgAlt:      '#0C0E12',
  surface:    '#11131A',
  surfaceHi:  '#161820',
  border:     'rgba(255,255,255,0.06)',
  borderHi:   'rgba(255,255,255,0.11)',

  // Safeguard brand lime — used as primary accent
  green:      '#AACC00',
  greenAlt:   '#AACC00',
  greenDim:   'rgba(170,204,0,0.10)',

  // Restrained amber
  amber:      '#906A25',
  amberAlt:   '#B08535',
  amberDim:   'rgba(144,106,37,0.14)',

  // Controlled red
  red:        '#8A2E2E',
  redAlt:     '#A83535',
  redDim:     'rgba(138,46,46,0.13)',

  // Limited steel blue — informational only
  steel:      '#3A5870',
  steelAlt:   '#4A6E8A',
  steelDim:   'rgba(58,88,112,0.12)',

  text:       '#D0D4DC',
  textSub:    '#6E7480',
  textMuted:  '#3C4050',
  white:      '#EAEEF5',
}

// ── Static data ────────────────────────────────────────────────────────────────
const TICKER = [
  { sev: 'amber', text: 'NAIROBI — Road access to JKIA restricted. Allow additional transit time until 1400 local.' },
  { sev: 'red',   text: 'ABUJA — Crowd density increasing near CBD perimeter. Expect intermittent closures after 1700 local.' },
  { sev: 'green', text: 'DUBAI — Terminal 3 operations nominal. Route Alpha viable.' },
  { sev: 'amber', text: 'LAGOS — Heavy congestion degrading mobility on Lagos-Ibadan Expressway. Allow 60+ min.' },
  { sev: 'red',   text: 'KHARTOUM — Security environment deteriorating. Review all non-essential movement.' },
  { sev: 'green', text: 'JOHANNESBURG — OR Tambo International nominal. No disruptions reported.' },
  { sev: 'amber', text: 'CAIRO — Fuel supply disruptions affecting western suburban routes.' },
  { sev: 'steel', text: 'SYSTEM — Intelligence refresh complete. 847 active corridors monitored.' },
]

const FEED = [
  { sev: 'red',   region: 'WEST AFRICA',     time: '08 min', title: 'Route Alpha — Degraded', body: 'Crowd density increasing near Abuja CBD. Expect intermittent closures after 1700 local. Consider northern bypass via Route Delta.' },
  { sev: 'amber', region: 'EAST AFRICA',     time: '23 min', title: 'Airport Advisory — NBO', body: 'Security screening delays at JKIA Terminal 1B. Allow 90 min additional processing time for outbound personnel.' },
  { sev: 'amber', region: 'GULF',            time: '41 min', title: 'Traffic Impact — DXB',   body: 'Sheikh Zayed Road congestion degrading south corridor transit times. Route deviation recommended 1200–1500 local.' },
  { sev: 'green', region: 'SOUTHERN AFRICA', time: '1h 12m', title: 'Corridor Status — JNB',  body: 'N1 and N3 arterials operating nominally. No degradation reported. Personnel movement viable.' },
  { sev: 'steel', region: 'NORTH AFRICA',    time: '2h 08m', title: 'Weather Impact — CAI',   body: 'Dust event reducing visibility across western approach routes. Monitor for developing conditions after 1500 local.' },
]

const CAPABILITIES = [
  {
    icon: Crosshair,
    accentKey: 'green',
    tag: 'SITUATIONAL AWARENESS',
    title: 'Live operational picture. Everywhere.',
    body: 'Real-time intelligence across 195 countries. Traffic, unrest, weather, border conditions, and infrastructure status — continuously updated and framed for movement decisions.',
    points: ['Live traffic and movement impact', 'Unrest and protest mapping', 'Weather mobility degradation', 'Airport and border disruptions'],
  },
  {
    icon: Navigation,
    accentKey: 'amber',
    tag: 'MOVEMENT INTELLIGENCE',
    title: 'Routes assessed. Corridors mapped.',
    body: 'Every movement decision informed by live data. Route viability, corridor assessment, checkpoint visibility, and extraction planning — not news summaries.',
    points: ['Route viability scoring', 'Convoy and executive movement planning', 'Checkpoint and border status', 'Alternative corridor mapping'],
  },
  {
    icon: Users,
    accentKey: 'steel',
    tag: 'TRAVELER RISK MANAGEMENT',
    title: 'Full visibility of personnel. Always.',
    body: 'Know where your people are, where they need to be, and whether conditions allow movement. Travel approvals, check-ins, SOS, and incident response — integrated.',
    points: ['Live personnel tracking', 'Travel approval workflows', 'Check-in and accountability', 'SOS and incident escalation'],
  },
]

const USE_CASES = [
  { icon: Shield,      title: 'Executive Protection',    desc: 'Advance intelligence and live tracking for principal movement in complex environments.' },
  { icon: Globe,       title: 'Corporate Travel Teams',  desc: 'Duty of care compliance and full traveler accountability at scale.' },
  { icon: Radio,       title: 'GSOC Operations',         desc: 'Centralized operational picture for 24/7 monitoring and response teams.' },
  { icon: Layers,      title: 'NGO Deployments',         desc: 'Field movement coordination in complex, denied, and high-risk environments.' },
  { icon: TrendingUp,  title: 'Mining & Energy',         desc: 'Site access monitoring and contractor movement management.' },
  { icon: Compass,     title: 'Logistics Operations',    desc: 'Convoy routing, cargo movement intelligence, and corridor assessment.' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function accent(key) {
  const map = {
    green: { color: C.greenAlt, dim: C.greenDim, border: 'rgba(74,112,85,0.22)' },
    amber: { color: C.amberAlt, dim: C.amberDim, border: 'rgba(144,106,37,0.22)' },
    red:   { color: C.redAlt,   dim: C.redDim,   border: 'rgba(138,46,46,0.22)'  },
    steel: { color: C.steelAlt, dim: C.steelDim, border: 'rgba(58,88,112,0.22)'  },
  }
  return map[key] || map.steel
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function Nav({ scrolled }) {
  const navigate = useNavigate()
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 48px',
      background: scrolled ? 'rgba(9,10,12,0.95)' : 'transparent',
      borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      transition: 'all 0.25s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
        <img src="/logo-white.png" alt="Safeguard" style={{ height: 38, width: 'auto' }} />
        <div style={{ display: 'flex', gap: 28 }}>
          {['Platform', 'Solutions', 'Intelligence', 'Pricing'].map(item => (
            <button key={item}
              onClick={() => item === 'Pricing' && navigate('/pricing')}
              style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', fontSize: 13, padding: 0, letterSpacing: '0.01em' }}
              onMouseEnter={e => e.currentTarget.style.color = C.text}
              onMouseLeave={e => e.currentTarget.style.color = C.textSub}
            >{item}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <button onClick={() => navigate('/login')}
          style={{ background: 'none', border: 'none', color: C.textSub, cursor: 'pointer', fontSize: 13 }}
          onMouseEnter={e => e.currentTarget.style.color = C.text}
          onMouseLeave={e => e.currentTarget.style.color = C.textSub}
        >Log in</button>
        <button onClick={() => navigate('/signup')} style={{
          background: C.green, border: 'none', color: '#fff',
          padding: '8px 20px', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.08em', cursor: 'pointer', textTransform: 'uppercase',
        }}>Request Access</button>
      </div>
    </nav>
  )
}

function HeroBackground() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: C.bg }} />

      {/* Subtle grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)
        `,
        backgroundSize: '64px 64px',
      }} />

      {/* Faint centre glow */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 65% 55% at 58% 50%, rgba(74,112,85,0.05) 0%, transparent 70%)',
      }} />

      {/* Left messaging fade */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(to right, ${C.bg} 0%, rgba(9,10,12,0.75) 35%, transparent 58%)`,
      }} />

      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%',
        background: `linear-gradient(to top, ${C.bg} 0%, transparent 100%)`,
      }} />

      {/* Operational dots */}
      {[
        { x: '53%', y: '40%', s: 'red',   sz: 5  },
        { x: '57%', y: '36%', s: 'amber', sz: 4  },
        { x: '55%', y: '50%', s: 'green', sz: 4  },
        { x: '61%', y: '44%', s: 'amber', sz: 3  },
        { x: '49%', y: '54%', s: 'green', sz: 3  },
        { x: '65%', y: '35%', s: 'steel', sz: 3  },
        { x: '51%', y: '34%', s: 'red',   sz: 3  },
        { x: '71%', y: '42%', s: 'steel', sz: 3  },
        { x: '44%', y: '46%', s: 'green', sz: 3  },
        { x: '68%', y: '53%', s: 'amber', sz: 3  },
      ].map((dot, i) => {
        const a = accent(dot.s)
        return (
          <div key={i} style={{
            position: 'absolute', left: dot.x, top: dot.y,
            width: dot.sz, height: dot.sz, borderRadius: '50%',
            background: a.color,
            transform: 'translate(-50%,-50%)',
            opacity: 0.75,
            animation: dot.s === 'red' || dot.s === 'amber' ? `dot-pulse ${2.2 + i * 0.25}s ease-in-out infinite` : 'none',
          }} />
        )
      })}

      {/* Route lines */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <line x1="53%" y1="40%" x2="57%" y2="36%" stroke={C.greenAlt} strokeWidth="0.6" strokeDasharray="5 5" opacity="0.18" />
        <line x1="57%" y1="36%" x2="65%" y2="35%" stroke={C.greenAlt} strokeWidth="0.6" strokeDasharray="5 5" opacity="0.18" />
        <line x1="55%" y1="50%" x2="53%" y2="40%" stroke={C.amberAlt} strokeWidth="0.6" strokeDasharray="5 5" opacity="0.14" />
        <line x1="61%" y1="44%" x2="65%" y2="35%" stroke={C.steelAlt} strokeWidth="0.6" strokeDasharray="5 5" opacity="0.14" />
        <line x1="44%" y1="46%" x2="49%" y2="54%" stroke={C.greenAlt} strokeWidth="0.6" strokeDasharray="5 5" opacity="0.12" />
      </svg>

      <style>{`
        @keyframes dot-pulse { 0%,100%{opacity:.75} 50%{opacity:.3} }
        @keyframes live-blink { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes ticker-scroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes feed-enter { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

function FeedPanel() {
  const utc = new Date().toUTCString().slice(17, 25)
  return (
    <div style={{
      width: 360, flexShrink: 0,
      background: 'rgba(17,19,26,0.82)',
      backdropFilter: 'blur(20px)',
      border: `1px solid ${C.border}`,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 16px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenAlt, animation: 'live-blink 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', color: C.textSub, textTransform: 'uppercase' }}>Live Intelligence Feed</span>
        </div>
        <span style={{ fontSize: 9, color: C.textMuted, fontFamily: 'monospace' }}>{utc} UTC</span>
      </div>

      {FEED.map((item, i) => {
        const a = accent(item.sev)
        return (
          <div key={i} style={{
            padding: '13px 16px',
            borderBottom: `1px solid ${C.border}`,
            background: i === 0 ? a.dim : 'transparent',
            animation: `feed-enter 0.4s ease ${i * 0.07}s both`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.11em', color: a.color, textTransform: 'uppercase' }}>{item.region}</span>
              </div>
              <span style={{ fontSize: 9, color: C.textMuted, fontFamily: 'monospace' }}>{item.time}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.white, marginBottom: 4 }}>{item.title}</div>
            <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.55 }}>{item.body}</div>
          </div>
        )
      })}
    </div>
  )
}

function Ticker() {
  return (
    <div style={{
      height: 34,
      background: C.surface,
      borderTop: `1px solid ${C.border}`,
      borderBottom: `1px solid ${C.border}`,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 56,
        animation: 'ticker-scroll 50s linear infinite',
        whiteSpace: 'nowrap',
      }}>
        {[...TICKER, ...TICKER].map((item, i) => {
          const a = accent(item.sev)
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 3, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: C.textSub }}>{item.text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Landing() {
  const [scrolled, setScrolled] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', minHeight: '100vh' }}>
      <Nav scrolled={scrolled} />

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', height: '100vh', minHeight: 680, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <HeroBackground />
        <div style={{
          position: 'relative', zIndex: 10,
          width: '100%', maxWidth: 1400, margin: '0 auto',
          padding: '0 48px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48,
        }}>
          {/* Messaging */}
          <div style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.greenAlt, animation: 'live-blink 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textSub, textTransform: 'uppercase' }}>Live Operational Intelligence</span>
            </div>

            <h1 style={{ fontSize: 50, fontWeight: 700, lineHeight: 1.08, color: C.white, marginBottom: 22, letterSpacing: '-0.025em' }}>
              Travel Risk Management<br />
              <span style={{ color: C.greenAlt }}>Built for Real Operations.</span>
            </h1>

            <p style={{ fontSize: 15, color: C.textSub, lineHeight: 1.75, marginBottom: 32, maxWidth: 460 }}>
              Live situational awareness, movement intelligence, and traveler accountability — designed for organizations operating in complex, high-risk environments.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36 }}>
              {['Live Operational Map', 'Route Viability', 'Traveler Tracking', 'GSOC Integration', 'Movement Corridors'].map(p => (
                <span key={p} style={{
                  fontSize: 10, color: C.textSub, border: `1px solid ${C.border}`,
                  padding: '4px 12px', letterSpacing: '0.04em',
                  background: 'rgba(255,255,255,0.025)',
                }}>{p}</span>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => navigate('/signup')} style={{
                background: C.green, border: 'none', color: '#fff',
                padding: '13px 28px', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.07em', cursor: 'pointer', textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                Request Access <ArrowRight size={13} />
              </button>
              <button onClick={() => navigate('/login')} style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                color: C.textSub, padding: '13px 28px', fontSize: 12,
                fontWeight: 500, letterSpacing: '0.04em', cursor: 'pointer',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.color = C.text }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSub }}
              >Log In</button>
            </div>
          </div>

          {/* Live feed */}
          <FeedPanel />
        </div>
      </section>

      {/* ── TICKER ────────────────────────────────────────────────────────── */}
      <Ticker />

      {/* ── CAPABILITIES ──────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 48px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textMuted, textTransform: 'uppercase', marginBottom: 14 }}>Platform Capabilities</div>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: C.white, letterSpacing: '-0.02em', marginBottom: 14 }}>
            One platform. Full operational picture.
          </h2>
          <p style={{ fontSize: 14, color: C.textSub, maxWidth: 480, margin: '0 auto', lineHeight: 1.75 }}>
            Most platforms report what happened. Safeguard tells you what it means for movement — and what to do next.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.border }}>
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon
            const a = accent(cap.accentKey)
            return (
              <div key={i} style={{ background: C.bgAlt, padding: '40px 36px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <div style={{
                    width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: a.dim, border: `1px solid ${a.border}`,
                  }}>
                    <Icon size={15} color={a.color} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', color: a.color, textTransform: 'uppercase' }}>{cap.tag}</span>
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 700, color: C.white, lineHeight: 1.3, marginBottom: 14, letterSpacing: '-0.01em' }}>{cap.title}</h3>
                <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7, marginBottom: 24 }}>{cap.body}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {cap.points.map((pt, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 3, height: 3, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: C.textSub }}>{pt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── INTELLIGENCE LANGUAGE ─────────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '80px 48px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textMuted, textTransform: 'uppercase', marginBottom: 14 }}>Intelligence Language</div>
            <h2 style={{ fontSize: 30, fontWeight: 700, color: C.white, lineHeight: 1.25, marginBottom: 18, letterSpacing: '-0.02em' }}>
              Not what happened.<br />What it means for movement.
            </h2>
            <p style={{ fontSize: 13, color: C.textSub, lineHeight: 1.8 }}>
              Safeguard intelligence is written for operational decisions — not headlines. Every advisory is framed around movement impact, time sensitivity, and recommended action. Language that works for both C-suite oversight and field teams.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'rgba(138,46,46,0.07)', border: `1px solid ${C.redDim}`, padding: '20px 24px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.redAlt, textTransform: 'uppercase', marginBottom: 10 }}>Generic reporting</div>
              <p style={{ fontSize: 13, color: 'rgba(208,212,220,0.45)', lineHeight: 1.6, fontStyle: 'italic' }}>
                "Protests reported in the city centre."
              </p>
            </div>
            <div style={{ background: C.greenDim, border: `1px solid rgba(74,112,85,0.22)`, padding: '20px 24px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: C.greenAlt, textTransform: 'uppercase', marginBottom: 10 }}>Safeguard intelligence</div>
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>
                "Crowd density increasing near CBD perimeter. Expect intermittent road closures after 1700 local. Route Delta remains viable via northern bypass. Review movement plan by 1600."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── USE CASES ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 48px', maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ marginBottom: 52 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textMuted, textTransform: 'uppercase', marginBottom: 14 }}>Built For</div>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: C.white, letterSpacing: '-0.02em' }}>Every operational environment.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: C.border }}>
          {USE_CASES.map((uc, i) => {
            const Icon = uc.icon
            return (
              <div key={i}
                style={{ background: C.bgAlt, padding: '30px 28px', borderTop: '2px solid transparent', transition: 'border-color 0.2s, background 0.2s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.borderTopColor = C.green; e.currentTarget.style.background = C.surfaceHi }}
                onMouseLeave={e => { e.currentTarget.style.borderTopColor = 'transparent'; e.currentTarget.style.background = C.bgAlt }}
              >
                <Icon size={18} color={C.textMuted} style={{ marginBottom: 16, display: 'block' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 8 }}>{uc.title}</div>
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65 }}>{uc.desc}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── METRICS ───────────────────────────────────────────────────────── */}
      <section style={{ background: C.surface, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: '64px 48px' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: C.border }}>
          {[
            { val: '195',   unit: 'countries',        label: 'Global coverage' },
            { val: '24/7',  unit: 'monitoring',        label: 'Continuous intelligence' },
            { val: '< 90s', unit: 'alert delivery',    label: 'From event to advisory' },
            { val: '847',   unit: 'active corridors',  label: 'Monitored in real time' },
          ].map((m, i) => (
            <div key={i} style={{ background: C.bgAlt, padding: '36px 32px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.white, letterSpacing: '-0.03em', lineHeight: 1 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: C.greenAlt, fontWeight: 600, letterSpacing: '0.06em', margin: '6px 0 8px', textTransform: 'uppercase' }}>{m.unit}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 48px' }}>
        <div style={{ maxWidth: 580, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: C.textMuted, textTransform: 'uppercase', marginBottom: 18 }}>Operational Readiness</div>
          <h2 style={{ fontSize: 38, fontWeight: 700, color: C.white, lineHeight: 1.15, marginBottom: 18, letterSpacing: '-0.025em' }}>
            Your people move.<br />Safeguard watches.
          </h2>
          <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.75, marginBottom: 40 }}>
            Purpose-built for organizations where traveler safety is an operational priority — not an afterthought.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
            <button onClick={() => navigate('/signup')} style={{
              background: C.green, border: 'none', color: '#fff',
              padding: '14px 32px', fontSize: 12, fontWeight: 700,
              letterSpacing: '0.07em', cursor: 'pointer', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              Request Access <ArrowRight size={13} />
            </button>
            <Link to="/pricing" style={{
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.textSub, padding: '14px 32px', fontSize: 12,
              fontWeight: 500, letterSpacing: '0.04em', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center',
            }}>View Plans</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src="/logo-white.png" alt="Safeguard" style={{ height: 28, width: 'auto', opacity: 0.45 }} />
        <div style={{ display: 'flex', gap: 28 }}>
          {['Privacy Policy', 'Terms of Service', 'Contact'].map(item => (
            <span key={item} style={{ fontSize: 11, color: C.textMuted, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color = C.textSub}
              onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
            >{item}</span>
          ))}
        </div>
        <span style={{ fontSize: 11, color: C.textMuted }}>© {new Date().getFullYear()} Safeguard360</span>
      </footer>
    </div>
  )
}
