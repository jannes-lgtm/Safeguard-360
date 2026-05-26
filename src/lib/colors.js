/**
 * SafeGuard360 color exports.
 * Import from ds.js for full design system access.
 * This file exists for legacy named imports.
 */
import { DS, SEVERITY, RISK } from './ds.js'

export const BRAND_BLUE  = DS.bg
export const BRAND_GREEN = DS.green

/** Operational risk level colors — muted, dark-background-safe */
export const RISK_COLORS = {
  Critical: RISK.Critical.color,
  Extreme:  RISK.Extreme.color,
  High:     RISK.High.color,
  Medium:   RISK.Medium.color,
  Moderate: RISK.Moderate.color,
  Low:      RISK.Low.color,
  Minimal:  RISK.Minimal.color,
}

/** Severity level colors — operational palette */
export const SEV_COLORS = {
  critical: SEVERITY.Critical.text,
  high:     SEVERITY.High.text,
  medium:   SEVERITY.Medium.text,
  low:      SEVERITY.Low.text,
  info:     SEVERITY.Info.text,
}
