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
