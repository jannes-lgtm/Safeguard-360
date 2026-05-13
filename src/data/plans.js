/**
 * Safeguard 360 — subscription plan definitions
 * Single source of truth used by Pricing page, Billing page, and API endpoints.
 */

export const PLAN_KEYS = {
  SOLO:        'solo',
  TEAM:        'team',
  OPERATIONS:  'operations',
  ENTERPRISE:  'enterprise',
}

export const PLANS = [
  {
    key:          'solo',
    name:         'SOLO',
    tagline:      'Independent field professionals',
    price:        18,
    billingNote:  '/month',
    travellers:   1,
    badge:        null,
    features: [
      '1 active traveller seat',
      'Real-time risk alerts & intel feeds',
      'Itinerary parsing & trip management',
      'AI country briefings',
      'GPS check-in & live location',
      'SOS & emergency assist',
      'Visa & health requirements',
      'Mobile-optimised dashboard',
    ],
    cta:          'Start with SOLO',
    ctaStyle:     'outline', // outlined on pricing page
    stripeEnvKey: 'VITE_STRIPE_SOLO_PRICE_ID',
  },
  {
    key:          'team',
    name:         'TEAM',
    tagline:      'SMEs, NGOs & security teams',
    price:        210,
    billingNote:  '/month',
    travellers:   15,
    badge:        'Most Popular',
    features: [
      'Up to 15 traveller seats',
      'All SOLO features',
      'Org-wide travel approvals workflow',
      'Group crisis broadcast',
      'Traveller tracker & live map',
      'Organisation risk dashboard',
      'Policy & training management',
      'Priority email support',
    ],
    cta:          'Start with TEAM',
    ctaStyle:     'primary',
    stripeEnvKey: 'VITE_STRIPE_TEAM_PRICE_ID',
  },
  {
    key:          'operations',
    name:         'OPERATIONS',
    tagline:      'High-risk & field-intensive organisations',
    price:        580,
    billingNote:  '/month',
    travellers:   40,
    badge:        null,
    features: [
      'Up to 40 traveller seats',
      'All TEAM features',
      'Operational intel centre',
      'Advanced threat analysis & ACLED data',
      'Multi-org management',
      'Full audit logs & compliance exports',
      'SLA-backed uptime',
      'Dedicated onboarding call',
    ],
    cta:          'Start with OPERATIONS',
    ctaStyle:     'outline',
    stripeEnvKey: 'VITE_STRIPE_OPS_PRICE_ID',
  },
  {
    key:          'enterprise',
    name:         'ENTERPRISE',
    tagline:      'Unlimited scale. Custom deployment.',
    price:        null,
    billingNote:  'Custom pricing',
    travellers:   null,
    badge:        null,
    features: [
      'Unlimited traveller seats',
      'All OPERATIONS features',
      'Dedicated infrastructure & SLAs',
      'White-label / custom domain',
      'SSO / SAML integration',
      'Custom data retention policies',
      'API access for system integration',
      'Named account manager',
    ],
    cta:          'Contact Sales',
    ctaStyle:     'dark',
    stripeEnvKey: null,
  },
]

/** Map plan key → seat limit (null = unlimited) */
export const SEAT_LIMITS = {
  solo:        1,
  team:        15,
  operations:  40,
  enterprise:  null,
}

/** Map legacy DB plan names → new keys */
export const LEGACY_PLAN_MAP = {
  starter:      'solo',
  professional: 'team',
  enterprise:   'enterprise',
}

export function getPlan(key) {
  return PLANS.find(p => p.key === key) || null
}

export function seatLimit(key) {
  return SEAT_LIMITS[key] ?? SEAT_LIMITS[LEGACY_PLAN_MAP[key]] ?? 1
}
