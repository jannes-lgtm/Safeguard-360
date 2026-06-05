/**
 * SafeGuard360 — Operational Design System
 * Single source of truth for all UI tokens, styles, and component primitives.
 *
 * Design principle: operational intelligence software.
 * Restrained contrast, muted surfaces, disciplined spacing, minimal accent usage.
 */

// ── Color tokens ──────────────────────────────────────────────────────────────

export const DS = {
  // Backgrounds
  bg:         '#090A0C',
  bgAlt:      '#0C0E12',
  surface:    '#11131A',
  surfaceHi:  '#161820',

  // Borders
  border:     'rgba(255,255,255,0.06)',
  borderHi:   'rgba(255,255,255,0.11)',

  // Brand accent — lime green. Use sparingly.
  green:      '#AACC00',
  greenDim:   'rgba(170,204,0,0.10)',
  greenGlow:  'rgba(170,204,0,0.18)',

  // Status — amber (warning)
  amber:      '#906A25',
  amberAlt:   '#B08535',
  amberDim:   'rgba(144,106,37,0.14)',
  amberText:  '#D4A64A',

  // Status — red (danger)
  red:        '#8A2E2E',
  redAlt:     '#A83535',
  redDim:     'rgba(138,46,46,0.13)',
  redText:    '#EF7474',

  // Status — steel blue (info)
  steel:      '#3A5870',
  steelAlt:   '#4A6E8A',
  steelDim:   'rgba(58,88,112,0.12)',
  steelText:  '#6EA8C8',

  // Text
  text:       '#D0D4DC',
  textSub:    '#6E7480',
  textMuted:  '#3C4050',
  white:      '#EAEEF5',

  // Transparency helpers
  overlay:    'rgba(9,10,12,0.85)',
  divider:    'rgba(255,255,255,0.06)',
}

// ── Severity system ───────────────────────────────────────────────────────────
// Operational dark-mode severity tokens. No bright colors.

export const SEVERITY = {
  Critical: {
    bg:     'rgba(138,46,46,0.14)',
    border: 'rgba(138,46,46,0.35)',
    text:   '#F08080',
    dot:    '#A83535',
    bar:    '#A83535',
    label:  'Critical',
  },
  High: {
    bg:     'rgba(144,106,37,0.14)',
    border: 'rgba(144,106,37,0.35)',
    text:   '#D4A64A',
    dot:    '#B08535',
    bar:    '#B08535',
    label:  'High',
  },
  Medium: {
    bg:     'rgba(122,106,26,0.12)',
    border: 'rgba(122,106,26,0.30)',
    text:   '#C4A83A',
    dot:    '#9A8830',
    bar:    '#9A8830',
    label:  'Medium',
  },
  Low: {
    bg:     'rgba(58,88,112,0.10)',
    border: 'rgba(58,88,112,0.28)',
    text:   '#6EA8C8',
    dot:    '#4A6E8A',
    bar:    '#4A6E8A',
    label:  'Low',
  },
  Info: {
    bg:     'rgba(58,88,112,0.10)',
    border: 'rgba(58,88,112,0.28)',
    text:   '#6EA8C8',
    dot:    '#3A5870',
    bar:    '#3A5870',
    label:  'Info',
  },
}

export function sev(level) {
  return SEVERITY[level] || SEVERITY.Low
}

// ── Risk level system (country/area risk scores) ──────────────────────────────

export const RISK = {
  Critical: { color: '#F08080', bg: 'rgba(138,46,46,0.14)', border: 'rgba(138,46,46,0.30)' },
  Extreme:  { color: '#F08080', bg: 'rgba(138,46,46,0.14)', border: 'rgba(138,46,46,0.30)' },
  High:     { color: '#D4A64A', bg: 'rgba(144,106,37,0.14)', border: 'rgba(144,106,37,0.30)' },
  Medium:   { color: '#C4A83A', bg: 'rgba(122,106,26,0.12)', border: 'rgba(122,106,26,0.28)' },
  Moderate: { color: '#C4A83A', bg: 'rgba(122,106,26,0.12)', border: 'rgba(122,106,26,0.28)' },
  Low:      { color: '#6EA8C8', bg: 'rgba(58,88,112,0.10)', border: 'rgba(58,88,112,0.25)' },
  Minimal:  { color: '#6EA8C8', bg: 'rgba(58,88,112,0.10)', border: 'rgba(58,88,112,0.25)' },
}

export function risk(level) {
  return RISK[level] || RISK.Low
}

// ── Base component style helpers ──────────────────────────────────────────────

/** Standard operational surface card */
export const cardStyle = (opts = {}) => ({
  background: opts.elevated ? DS.surfaceHi : DS.surface,
  border: `1px solid ${opts.active ? DS.borderHi : DS.border}`,
  borderRadius: opts.radius ?? 6,
  ...opts.style,
})

/** Primary button — green accent */
export const btnPrimary = {
  background: DS.green,
  color: DS.bg,
  border: 'none',
  fontWeight: 700,
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

/** Secondary/ghost button */
export const btnSecondary = {
  background: 'transparent',
  color: DS.textSub,
  border: `1px solid ${DS.border}`,
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

/** Danger button — muted red */
export const btnDanger = {
  background: DS.redDim,
  color: DS.redText,
  border: `1px solid rgba(138,46,46,0.35)`,
  fontWeight: 600,
  fontSize: 12,
  letterSpacing: '0.05em',
  cursor: 'pointer',
  transition: 'all 0.15s',
}

/** Section header label style */
export const sectionLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: DS.textMuted,
}

/** Page title */
export const pageTitle = {
  fontSize: 18,
  fontWeight: 700,
  color: DS.white,
  letterSpacing: '-0.02em',
}

/** Metadata / subdued text */
export const metaText = {
  fontSize: 11,
  color: DS.textSub,
  fontWeight: 500,
}

// Centralized status style map — replaces all local STATUS_STYLE objects
export const STATUS_MAP = {
  active:    { bg: 'rgba(58,88,112,0.12)',   text: '#6EA8C8', border: 'rgba(58,88,112,0.30)',   dot: '#4A6E8A',  label: 'Active'    },
  upcoming:  { bg: 'rgba(170,204,0,0.10)',   text: '#AACC00', border: 'rgba(170,204,0,0.25)',   dot: '#AACC00',  label: 'Upcoming'  },
  completed: { bg: 'rgba(255,255,255,0.04)', text: '#6E7480', border: 'rgba(255,255,255,0.08)', dot: '#3C4050',  label: 'Completed' },
  pending:   { bg: 'rgba(144,106,37,0.12)',  text: '#D4A64A', border: 'rgba(144,106,37,0.28)',  dot: '#B08535',  label: 'Pending'   },
  approved:  { bg: 'rgba(170,204,0,0.10)',   text: '#AACC00', border: 'rgba(170,204,0,0.22)',   dot: '#AACC00',  label: 'Approved'  },
  rejected:  { bg: 'rgba(138,46,46,0.13)',   text: '#EF7474', border: 'rgba(138,46,46,0.30)',   dot: '#A83535',  label: 'Rejected'  },
  safe:      { bg: 'rgba(170,204,0,0.10)',   text: '#AACC00', border: 'rgba(170,204,0,0.22)',   dot: '#AACC00',  label: 'Safe'      },
  warning:   { bg: 'rgba(144,106,37,0.12)',  text: '#D4A64A', border: 'rgba(144,106,37,0.28)',  dot: '#B08535',  label: 'Warning'   },
  critical:  { bg: 'rgba(138,46,46,0.13)',   text: '#EF7474', border: 'rgba(138,46,46,0.30)',   dot: '#A83535',  label: 'Critical'  },
  inactive:  { bg: 'rgba(255,255,255,0.03)', text: '#3C4050', border: 'rgba(255,255,255,0.06)', dot: '#2A2E3A',  label: 'Inactive'  },
  online:    { bg: 'rgba(170,204,0,0.10)',   text: '#AACC00', border: 'rgba(170,204,0,0.22)',   dot: '#AACC00',  label: 'Online'    },
  offline:   { bg: 'rgba(255,255,255,0.03)', text: '#6E7480', border: 'rgba(255,255,255,0.06)', dot: '#3C4050',  label: 'Offline'   },
  distress:  { bg: 'rgba(138,46,46,0.13)',   text: '#EF7474', border: 'rgba(138,46,46,0.30)',   dot: '#A83535',  label: 'Distress'  },
}
export function status(key) { return STATUS_MAP[key?.toLowerCase()] || STATUS_MAP.inactive }

// Input / form base styles (apply as inline style)
export const INPUT_STYLE = {
  background: '#11131A',
  border: '1px solid rgba(255,255,255,0.09)',
  color: '#D0D4DC',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
}

// Banner styles per severity
export const BANNER = {
  info:     { bg: 'rgba(58,88,112,0.12)',  border: 'rgba(58,88,112,0.30)',   text: '#6EA8C8', icon: '#4A6E8A'  },
  warning:  { bg: 'rgba(144,106,37,0.14)', border: 'rgba(144,106,37,0.35)', text: '#D4A64A', icon: '#B08535'  },
  critical: { bg: 'rgba(138,46,46,0.14)',  border: 'rgba(138,46,46,0.35)',  text: '#EF7474', icon: '#A83535'  },
  success:  { bg: 'rgba(170,204,0,0.10)',  border: 'rgba(170,204,0,0.25)',  text: '#AACC00', icon: '#AACC00'  },
}
export function banner(variant) { return BANNER[variant] || BANNER.info }
