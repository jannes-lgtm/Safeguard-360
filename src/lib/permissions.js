/**
 * SafeGuard 360 — Role-Based Access Control (RBAC)
 *
 * Single source of truth for:
 *   - Role definitions and metadata
 *   - Operational domain structure
 *   - Per-module role visibility
 *   - Navigation configuration
 *   - UX density profiles
 *
 * All navigation rendering, route protection, and permission checks
 * derive from this file. Do not hardcode role decisions in components.
 *
 * Architecture:
 *   Domains → contain Modules → each Module defines which Roles can see it
 *   Domain visibility is derived from module role union (no separate domain gate).
 */

// ── Role key constants ────────────────────────────────────────────────────────
export const ROLES = {
  SOLO:             'solo',
  TRAVELLER:        'traveller',
  ORG_ADMIN:        'org_admin',
  ADMIN:            'admin',
  DEVELOPER:        'developer',
  GSOC_OPERATOR:    'gsoc_operator',
  GSOC_ADMIN:       'gsoc_admin',
  PROJECT_MANAGER:  'project_manager',
  PROJECT_OPERATOR: 'project_operator',
}

// ── Role metadata ─────────────────────────────────────────────────────────────
// label: display name  color: sidebar accent  icon: Lucide name  family: grouping
export const ROLE_META = {
  solo:             { label: 'Solo Traveller',      color: '#f472b6', icon: 'UserCircle',  family: 'traveler'  },
  traveller:        { label: 'Corporate Traveller', color: '#60a5fa', icon: 'UserCircle',  family: 'traveler'  },
  org_admin:        { label: 'Company Admin',       color: '#AACC00', icon: 'Building2',   family: 'admin'     },
  admin:            { label: 'Corporate Admin',     color: '#AACC00', icon: 'Building2',   family: 'admin'     },
  developer:        { label: 'Developer',           color: '#a78bfa', icon: 'Code2',       family: 'developer' },
  gsoc_operator:    { label: 'GSOC Operator',       color: '#f97316', icon: 'Radar',       family: 'gsoc'      },
  gsoc_admin:       { label: 'GSOC Admin',          color: '#ef4444', icon: 'Radar',       family: 'gsoc'      },
  project_manager:  { label: 'Project Manager',     color: '#34d399', icon: 'HardHat',     family: 'project'   },
  project_operator: { label: 'Project Operator',    color: '#22d3ee', icon: 'HardHat',     family: 'project'   },
}

// ── Role family shorthand (internal) ─────────────────────────────────────────
const S  = 'solo'
const T  = 'traveller'
const O  = 'org_admin'
const A  = 'admin'
const D  = 'developer'
const GO = 'gsoc_operator'
const GA = 'gsoc_admin'
const PM = 'project_manager'
const PO = 'project_operator'

// Named sets — compose these to define module access
const TRAVELERS     = [S, T]
const ALL_ADMIN     = [O, A, D]
const GSOC          = [GO, GA]
const PROJECT       = [PM, PO]
const OPS_ACCESS    = [O, A, D, GO, GA]          // operational command layer
const BROAD_ACCESS  = [S, T, O, A, D]            // all non-GSOC, non-project
const ALL_ROLES     = [S, T, O, A, D, GO, GA, PM, PO]

// ── Domain and Module definitions ─────────────────────────────────────────────
//
// Module schema:
//   id       — unique string key (used in ProtectedRoute module= prop)
//   label    — sidebar display label
//   route    — URL path
//   icon     — Lucide component name (string; resolved via ICON_MAP in Layout)
//   roles    — string[] of roles that can see and access this module
//   badge?   — key on the badges state object passed to DomainNav
//   red?     — renders item in red (emergency/SOS style)
//
// Domain shows in sidebar only when ≥1 module within it is visible to current role.

export const DOMAINS = [
  // ── 1. TRAVEL ──────────────────────────────────────────────────────────────
  // Traveler movement lifecycle and trip management.
  // Visible to: solo, traveller, org_admin, admin, developer, project roles
  {
    id: 'travel',
    label: 'Travel',
    modules: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        route: '/dashboard',
        icon: 'LayoutGrid',
        roles: [S, T, O, A, D, PM, PO],
      },
      {
        id: 'my_trips',
        label: 'My Trips',
        route: '/itinerary',
        icon: 'MapPin',
        roles: [...TRAVELERS, ...ALL_ADMIN],
      },
      {
        id: 'travel_approvals',
        label: 'Travel Approvals',
        route: '/approvals',
        icon: 'ClipboardList',
        roles: [...TRAVELERS, ...ALL_ADMIN],
        badge: 'pendingApprovals',
      },
      {
        id: 'check_in',
        label: 'Check In',
        route: '/checkin',
        icon: 'CheckCircle',
        roles: TRAVELERS,
      },
      {
        id: 'live_location',
        label: 'Live Location',
        route: '/live-map',
        icon: 'Navigation',
        roles: TRAVELERS,
      },
      {
        id: 'visa',
        label: 'Visa Assistant',
        route: '/visa',
        icon: 'Globe',
        roles: [...TRAVELERS, ...ALL_ADMIN],
      },
    ],
  },

  // ── 2. INTELLIGENCE ────────────────────────────────────────────────────────
  // Situational awareness and threat intelligence.
  // Visible to: all roles
  {
    id: 'intelligence',
    label: 'Intelligence',
    modules: [
      {
        id: 'cairo',
        label: 'CAIRO',
        route: '/journey-agent',
        icon: 'Compass',
        roles: ALL_ROLES,
      },
      {
        id: 'live_risk_feed',
        label: 'Live Risk Feed',
        route: '/live-risk-feed',
        icon: 'Radio',
        roles: ALL_ROLES,
      },
      {
        id: 'country_risk',
        label: 'Country Risk Reports',
        route: '/country-risk',
        icon: 'Shield',
        roles: ALL_ROLES,
      },
      {
        id: 'news',
        label: 'News Updates',
        route: '/news',
        icon: 'Newspaper',
        roles: ALL_ROLES,
      },
      {
        id: 'knowledge_base',
        label: 'Knowledge Base',
        route: '/cairo/knowledge',
        icon: 'Brain',
        roles: [...OPS_ACCESS, ...PROJECT],
      },
      {
        id: 'intel_feeds',
        label: 'Intel Feeds',
        route: '/intel-feeds',
        icon: 'Activity',
        roles: [D],
      },
    ],
  },

  // ── 3. OPERATIONS ──────────────────────────────────────────────────────────
  // Live command-and-control and operational oversight.
  // Visible to: org_admin, admin, developer, gsoc_operator, gsoc_admin, project roles
  {
    id: 'operations',
    label: 'Operations',
    modules: [
      {
        id: 'watch_board',
        label: 'Watch Board',
        route: '/gsoc',
        icon: 'MonitorCheck',
        roles: [...GSOC, A, D],
      },
      {
        id: 'gsoc_projects',
        label: 'GSOC Projects',
        route: '/gsoc/projects',
        icon: 'FolderOpen',
        roles: [...GSOC, A, D],
      },
      {
        id: 'shift_log',
        label: 'Shift Log',
        route: '/gsoc/shift-log',
        icon: 'Clock',
        roles: [...GSOC, A, D],
      },
      {
        id: 'movement_intel',
        label: 'Movement Intel',
        route: '/movement',
        icon: 'Radar',
        roles: OPS_ACCESS,
      },
      {
        id: 'control_room',
        label: 'Live Control Room',
        route: '/control-room',
        icon: 'Headphones',
        roles: OPS_ACCESS,
      },
      {
        id: 'heat_map',
        label: 'Risk Heat Map',
        route: '/heat-map',
        icon: 'Flame',
        roles: OPS_ACCESS,
      },
      {
        id: 'alert_zones',
        label: 'Alert Zones',
        route: '/geofences',
        icon: 'Hexagon',
        roles: OPS_ACCESS,
      },
      {
        id: 'live_traffic',
        label: 'Live Traffic',
        route: '/live-traffic',
        icon: 'Car',
        roles: OPS_ACCESS,
      },
      {
        id: 'route_intel',
        label: 'Route Intel',
        route: '/ops-intel',
        icon: 'Activity',
        roles: [A, D],
      },
      {
        id: 'projects',
        label: 'Projects',
        route: '/projects',
        icon: 'Layers',
        roles: [...PROJECT, ...OPS_ACCESS],
      },
      {
        id: 'asset_tracker',
        label: 'Asset Tracker',
        route: '/tracker',
        icon: 'Navigation',
        roles: OPS_ACCESS,
      },
    ],
  },

  // ── 4. RESPONSE ────────────────────────────────────────────────────────────
  // Emergency response and assistance coordination.
  // Visible to: all roles (SOS restricted to travelers)
  {
    id: 'response',
    label: 'Response',
    modules: [
      {
        id: 'sos',
        label: 'SOS Emergency',
        route: '/sos',
        icon: 'AlertOctagon',
        roles: TRAVELERS,
        red: true,
      },
      {
        id: 'crisis_broadcast',
        label: 'Crisis Broadcast',
        route: '/crisis-broadcast',
        icon: 'Megaphone',
        roles: ALL_ADMIN,
      },
      {
        id: 'assistance',
        label: 'Assistance Requests',
        route: '/assistance',
        icon: 'Headphones',
        roles: [...BROAD_ACCESS, ...GSOC],
      },
      {
        id: 'incidents',
        label: 'Incident Reports',
        route: '/incidents',
        icon: 'Siren',
        roles: ALL_ROLES,
      },
      {
        id: 'services',
        label: 'Service Providers',
        route: '/services',
        icon: 'Briefcase',
        roles: [...BROAD_ACCESS, ...GSOC],
      },
    ],
  },

  // ── 5. COMPLIANCE ──────────────────────────────────────────────────────────
  // Governance, policy, and traveler compliance.
  // Visible to: traveller (corporate), org_admin, admin, developer
  // Note: solo travelers are not subject to corporate compliance obligations
  {
    id: 'compliance',
    label: 'Compliance',
    modules: [
      {
        id: 'travel_policy',
        label: 'Travel Policy',
        route: '/travel-policy',
        icon: 'FileText',
        roles: [T, ...ALL_ADMIN],
      },
      {
        id: 'policy_library',
        label: 'Policy Library',
        route: '/policies',
        icon: 'BookOpen',
        roles: [T, ...ALL_ADMIN],
      },
      {
        id: 'iso_training',
        label: 'ISO Training',
        route: '/training',
        icon: 'GraduationCap',
        roles: [T, ...ALL_ADMIN],
      },
      {
        id: 'company_training',
        label: 'Company Training',
        route: '/org/training',
        icon: 'BookOpen',
        roles: ALL_ADMIN,
      },
    ],
  },

  // ── 6. ADMIN ───────────────────────────────────────────────────────────────
  // Administrative and system-level management.
  // Visible to: org_admin, admin, developer
  {
    id: 'admin',
    label: 'Admin',
    modules: [
      {
        id: 'staff_tracker',
        label: 'Staff Tracker',
        route: '/tracker',
        icon: 'Users',
        roles: ALL_ADMIN,
      },
      {
        id: 'user_management',
        label: 'User Management',
        route: '/org/users',
        icon: 'Users',
        roles: ALL_ADMIN,
      },
      {
        id: 'company_analytics',
        label: 'Analytics',
        route: '/org/analytics',
        icon: 'BarChart2',
        roles: ALL_ADMIN,
      },
      {
        id: 'organisations',
        label: 'All Organisations',
        route: '/organisations',
        icon: 'Building2',
        roles: [A, D],
      },
      {
        id: 'developer_console',
        label: 'Developer Console',
        route: '/admin',
        icon: 'Code2',
        roles: [A, D],
      },
    ],
  },

  // ── 7. ACCOUNT ─────────────────────────────────────────────────────────────
  // Profile and billing. Always rendered last. Visible to all roles.
  {
    id: 'account',
    label: 'Account',
    modules: [
      {
        id: 'billing',
        label: 'Billing & Plan',
        route: '/billing',
        icon: 'CreditCard',
        roles: [S, ...ALL_ADMIN],
      },
      {
        id: 'profile',
        label: 'My Profile',
        route: '/profile',
        icon: 'UserCircle',
        roles: ALL_ROLES,
      },
    ],
  },
]

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Returns all domains with their modules filtered to what `role` can see.
 * Domains with zero visible modules are excluded.
 */
export function getVisibleDomains(role) {
  if (!role) return []
  return DOMAINS
    .map(domain => ({
      ...domain,
      modules: domain.modules.filter(m => m.roles.includes(role)),
    }))
    .filter(domain => domain.modules.length > 0)
}

/**
 * Returns true if `role` can access the module identified by `moduleId`.
 * Used in ProtectedRoute and programmatic permission checks.
 */
export function canAccess(role, moduleId) {
  if (!role || !moduleId) return false
  const mod = DOMAINS.flatMap(d => d.modules).find(m => m.id === moduleId)
  return mod ? mod.roles.includes(role) : false
}

/**
 * Returns true if `role` can access a route by path.
 * Matches the first module with the given route.
 */
export function canAccessRoute(role, route) {
  if (!role || !route) return false
  const mod = DOMAINS.flatMap(d => d.modules).find(m => m.route === route)
  return mod ? mod.roles.includes(role) : false
}

// ── UX density profiles ───────────────────────────────────────────────────────
// Controls layout density and behavioral defaults per role.
//
// density:   'minimal' | 'standard' | 'operational' | 'tactical'
// bottomNav: show mobile bottom navigation bar
export const UX_PROFILE = {
  solo:             { density: 'minimal',     bottomNav: true  },
  traveller:        { density: 'standard',    bottomNav: true  },
  org_admin:        { density: 'standard',    bottomNav: true  },
  admin:            { density: 'operational', bottomNav: false },
  developer:        { density: 'operational', bottomNav: false },
  gsoc_operator:    { density: 'tactical',    bottomNav: false },
  gsoc_admin:       { density: 'tactical',    bottomNav: false },
  project_manager:  { density: 'standard',    bottomNav: false },
  project_operator: { density: 'standard',    bottomNav: false },
}
