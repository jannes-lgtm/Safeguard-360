/**
 * src/lib/mapConfig.js
 *
 * Operational map configuration for SafeGuard360.
 *
 * Tile strategy:
 *   - No key required : CartoDB Dark Matter (dark operational) + CartoDB Positron (standard)
 *   - VITE_MAPTILER_KEY set : MapTiler vector tiles (dark, satellite, outdoor, topo)
 *
 * Upgrade path: Add VITE_MAPTILER_KEY to Vercel env vars to unlock satellite imagery,
 * vector tile labels, and terrain mode. Free tier = 100k map loads/month.
 * Get a key at: https://cloud.maptiler.com/account/keys
 */

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY

// ── Raster fallback styles (no API key required) ──────────────────────────────

const CARTO_DARK_STYLE = {
  version: 8,
  name: 'Operational Dark',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'carto-dark-tiles', type: 'raster', source: 'carto-dark', paint: { 'raster-opacity': 1 } }],
}

const CARTO_LIGHT_STYLE = {
  version: 8,
  name: 'Standard',
  sources: {
    'carto-light': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'carto-light-tiles', type: 'raster', source: 'carto-light', paint: { 'raster-opacity': 1 } }],
}

// Blue-themed style for the World Explorer dashboard widget.
// Uses a SafeGuard brand-blue background with semi-transparent dark tiles
// so ocean areas appear blue while land masses show as dark navy.
const CARTO_BLUE_STYLE = {
  version: 8,
  name: 'World Explorer Blue',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
      maxzoom: 19,
    },
  },
  layers: [
    // Brand blue background — shows through as the "ocean" colour
    { id: 'background', type: 'background', paint: { 'background-color': '#0118A1' } },
    // Dark land tiles at 75% opacity — land appears dark navy, ocean stays blue
    { id: 'carto-dark-tiles', type: 'raster', source: 'carto-dark', paint: { 'raster-opacity': 0.75 } },
  ],
}

// ── Style registry ────────────────────────────────────────────────────────────

export const MAP_STYLES = {
  operational: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
    : CARTO_DARK_STYLE,

  satellite: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`
    : null,   // satellite requires a key — button is shown but prompts for key setup

  standard: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}`
    : CARTO_DARK_STYLE,

  terrain: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`
    : null,
}

export const HAS_MAPTILER = !!MAPTILER_KEY

// ── Operational map defaults ──────────────────────────────────────────────────

export const MAP_DEFAULTS = {
  // Africa / Middle East operational center
  center:  [20.0, 15.0],
  zoom:    3,
  minZoom: 2,
  maxZoom: 19,
  // Initial bounds pre-load Africa + Middle East tile cache
  prefetchBounds: [
    [-20, -35, 55, 38],   // Africa bounding box
    [34,  12,  60, 38],   // Middle East
    [51,  22,  57, 26],   // UAE / Gulf
  ],
}

// ── Risk severity → visual config ─────────────────────────────────────────────

export const RISK_STYLE = {
  Critical: { color: '#ef4444', fillOpacity: 0.18, strokeOpacity: 0.9, pulseColor: 'rgba(239,68,68,0.4)', radius: 22 },
  High:     { color: '#f97316', fillOpacity: 0.14, strokeOpacity: 0.75, pulseColor: 'rgba(249,115,22,0.3)', radius: 18 },
  Medium:   { color: '#f59e0b', fillOpacity: 0.10, strokeOpacity: 0.60, pulseColor: 'rgba(245,158,11,0.2)', radius: 14 },
  Low:      { color: '#22c55e', fillOpacity: 0.08, strokeOpacity: 0.50, pulseColor: 'rgba(34,197,94,0.15)', radius: 12 },
}

// ── Proximity thresholds by severity (km) ────────────────────────────────────

export const PROXIMITY_KM = {
  Critical: 600,
  High:     400,
  Medium:   250,
}

// ── WS reconnect config ───────────────────────────────────────────────────────

export const WS_RECONNECT = {
  baseDelayMs: 2_000,
  maxDelayMs:  30_000,
  maxAttempts: 10,
}

// ── Location write throttle ───────────────────────────────────────────────────
// Min interval (ms) between DB writes when location sharing is active.
// 30s is adequate for operational tracking; prevents DB hammering.
export const LOCATION_WRITE_THROTTLE_MS = 30_000
