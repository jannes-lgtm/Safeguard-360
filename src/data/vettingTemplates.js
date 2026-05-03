// Vetting checklists based on UN/UNSMS, PSIRA, EURAMI, BARS, CAMTS, ISO 31030:2021
// Applied standards: vehicle age ≤ 4 years, odometer ≤ 100,000 km (stricter than UN MOSS)
//
// Required Supabase table:
// create table provider_vetting_records (
//   id uuid primary key default gen_random_uuid(),
//   provider_id uuid not null references service_providers(id) on delete cascade,
//   vetted_by uuid references auth.users(id),
//   vetted_at timestamptz not null default now(),
//   next_review_date date not null,
//   checklist jsonb not null default '{}',
//   overall_status text not null default 'pass' check (overall_status in ('pass','conditional','fail')),
//   notes text,
//   created_at timestamptz not null default now()
// );
// alter table provider_vetting_records enable row level security;
// create policy "auth_read"   on provider_vetting_records for select using (auth.role()='authenticated');
// create policy "auth_insert" on provider_vetting_records for insert with check (auth.role()='authenticated');
// create policy "auth_update" on provider_vetting_records for update using (auth.role()='authenticated');

const YEAR_NOW = new Date().getFullYear()
const MIN_VEHICLE_YEAR = YEAR_NOW - 4   // e.g. 2022 if current year is 2026
const MIN_AIRCRAFT_YEAR = YEAR_NOW - 20 // max 20 years for aircraft

export const VETTING_TEMPLATES = {
  transport: {
    label: 'Ground Transport',
    standard: 'UN MOSS / ISO 31030:2021',
    sections: [
      {
        title: 'Vehicle Requirements',
        items: [
          { id: 'veh_age',          label: `Vehicle manufacture year (must be ${MIN_VEHICLE_YEAR} or newer)`, type: 'number', unit: 'year',  required: true  },
          { id: 'veh_odometer',     label: 'Current odometer reading in km (must be ≤ 100,000)',              type: 'number', unit: 'km',    required: true  },
          { id: 'veh_4wd',          label: '4WD / AWD capability available for field operations',             type: 'check',                 required: false },
          { id: 'veh_gps',          label: 'GPS / IVMS tracking installed and active',                        type: 'check',                 required: true  },
          { id: 'veh_roadworthy',   label: 'Valid roadworthy / inspection certificate',                       type: 'check',                 required: true  },
          { id: 'veh_extinguisher', label: 'Fire extinguisher fitted and in date',                            type: 'check',                 required: true  },
          { id: 'veh_firstaid',     label: 'First aid kit on board',                                          type: 'check',                 required: true  },
          { id: 'veh_ins_tp',       label: 'Third-party insurance ≥ USD 500,000',                             type: 'check',                 required: true  },
          { id: 'veh_ins_comp',     label: 'Comprehensive vehicle insurance',                                 type: 'check',                 required: false },
        ],
      },
      {
        title: 'Driver Standards',
        items: [
          { id: 'drv_experience', label: 'Years of professional driving experience (must be ≥ 3)', type: 'number', unit: 'years', required: true  },
          { id: 'drv_defensive',  label: 'Defensive / advanced driving certificate held',          type: 'check',                required: true  },
          { id: 'drv_background', label: 'Criminal background check cleared (BS 7858 or equiv.)', type: 'check',                required: true  },
          { id: 'drv_medical',    label: 'Medical fitness certificate valid',                      type: 'check',                required: true  },
          { id: 'drv_pdp',        label: "Valid professional driver's permit / licence",           type: 'check',                required: true  },
          { id: 'drv_heat',       label: 'HEAT / hostile environment awareness training',          type: 'check',                required: false },
          { id: 'drv_no_dui',     label: 'No DUI or serious traffic conviction on record',         type: 'check',                required: true  },
        ],
      },
      {
        title: 'Company & Operations',
        items: [
          { id: 'co_license',  label: 'Transport operating licence valid',           type: 'check', required: true  },
          { id: 'co_reg',      label: 'Company registration certificate on file',    type: 'check', required: true  },
          { id: 'co_24hr',     label: '24/7 emergency contact available',            type: 'check', required: true  },
          { id: 'co_incident', label: 'Incident reporting procedure documented',     type: 'check', required: false },
        ],
      },
    ],
  },

  vehicle: {
    label: 'Vehicle Rental',
    standard: 'UN MOSS / ISO 31030:2021',
    sections: [
      {
        title: 'Fleet Standards',
        items: [
          { id: 'fleet_age',      label: `All fleet vehicles ${MIN_VEHICLE_YEAR} or newer (≤ 4 years)`,  type: 'check', required: true  },
          { id: 'fleet_odo',      label: 'Maximum odometer ≤ 100,000 km per vehicle enforced',           type: 'check', required: true  },
          { id: 'fleet_4wd',      label: '4WD / AWD vehicles available on request',                      type: 'check', required: false },
          { id: 'fleet_gps',      label: 'GPS tracking on all rental vehicles',                          type: 'check', required: true  },
          { id: 'fleet_rw',       label: 'All vehicles have valid roadworthy / inspection certs',        type: 'check', required: true  },
          { id: 'fleet_ins',      label: 'Comprehensive + third-party insurance included in rental',     type: 'check', required: true  },
          { id: 'fleet_safety',   label: 'First aid kits and fire extinguishers in all vehicles',        type: 'check', required: true  },
        ],
      },
      {
        title: 'Company & Operations',
        items: [
          { id: 'co_license',     label: 'Vehicle rental licence valid',            type: 'check', required: true  },
          { id: 'co_reg',         label: 'Company registration on file',            type: 'check', required: true  },
          { id: 'co_24hr',        label: '24/7 roadside assistance available',      type: 'check', required: true  },
          { id: 'co_replacement', label: 'Replacement vehicle policy documented',   type: 'check', required: false },
        ],
      },
    ],
  },

  protection: {
    label: 'Close Protection',
    standard: 'PSIRA / BS 7858:2019 / ASIS GPG-09',
    sections: [
      {
        title: 'Officer Credentials',
        items: [
          { id: 'cp_psira',      label: 'PSIRA Grade A (or equivalent national authority) registration', type: 'check',                 required: true  },
          { id: 'cp_cpo',        label: 'Close Protection Officer (CPO) certification held',             type: 'check',                 required: true  },
          { id: 'cp_background', label: 'Criminal background check cleared — BS 7858:2019 or equiv.',   type: 'check',                 required: true  },
          { id: 'cp_medical',    label: 'Medical fitness certificate valid',                             type: 'check',                 required: true  },
          { id: 'cp_heat',       label: 'HEAT / hostile environment awareness training completed',       type: 'check',                 required: true  },
          { id: 'cp_firstaid',   label: 'First aid certificate (FPOS-ITC or AED equivalent)',           type: 'check',                 required: true  },
          { id: 'cp_experience', label: 'Years of close protection experience (must be ≥ 3)',            type: 'number', unit: 'years', required: true  },
        ],
      },
      {
        title: 'Company Requirements',
        items: [
          { id: 'co_license',  label: 'Security company licence — national regulator',               type: 'check', required: true  },
          { id: 'co_liability',label: 'Professional liability insurance ≥ USD 1,000,000',            type: 'check', required: true  },
          { id: 'co_risk',     label: 'Operational risk assessment capability documented',           type: 'check', required: true  },
          { id: 'co_comms',    label: 'Incident reporting and communications protocol in place',     type: 'check', required: true  },
          { id: 'co_24hr',     label: '24/7 operations centre contact',                              type: 'check', required: true  },
        ],
      },
    ],
  },

  medical: {
    label: 'Medical Services',
    standard: 'JCI / COHSASA / ISO 31030:2021',
    sections: [
      {
        title: 'Facility & Accreditation',
        items: [
          { id: 'med_moh',     label: 'Ministry of Health registration / operating licence',   type: 'check', required: true  },
          { id: 'med_accred',  label: 'JCI, COHSASA, or equivalent accreditation held',        type: 'check', required: true  },
          { id: 'med_malprac', label: 'Medical malpractice insurance ≥ USD 1,000,000',         type: 'check', required: true  },
          { id: 'med_24hr',    label: '24/7 emergency coverage available',                     type: 'check', required: true  },
          { id: 'med_als',     label: 'Advanced Life Support (ALS) capability on site',        type: 'check', required: true  },
          { id: 'med_evac',    label: 'Evacuation / medevac coordination capability',          type: 'check', required: false },
        ],
      },
      {
        title: 'Staff & Training',
        items: [
          { id: 'med_director', label: 'Medical director — CV and credentials on file',          type: 'check', required: true  },
          { id: 'med_licensed', label: 'All clinical staff licensed with national body',          type: 'check', required: true  },
          { id: 'med_acls',     label: 'BLS / ACLS certified staff present at all times',         type: 'check', required: true  },
        ],
      },
    ],
  },

  evacuation: {
    label: 'Emergency Evacuation / Air Medevac',
    standard: 'CAMTS / EURAMI / ICAO Annex 6',
    sections: [
      {
        title: 'Accreditation & Certification',
        items: [
          { id: 'ev_accred',   label: 'CAMTS or EURAMI accreditation current',                         type: 'check', required: true  },
          { id: 'ev_aoc',      label: 'Air Operator Certificate (AOC) valid',                          type: 'check', required: true  },
          { id: 'ev_eu_list',  label: 'Confirmed NOT on EU Air Safety List (check per mission)',       type: 'check', required: true  },
        ],
      },
      {
        title: 'Aircraft Standards',
        items: [
          { id: 'ev_ac_year',  label: `Aircraft manufacture year (must be ${MIN_AIRCRAFT_YEAR} or newer — ≤ 20 yrs)`, type: 'number', unit: 'year', required: true  },
          { id: 'ev_ifr',      label: 'Dual IFR navigation systems fitted',                            type: 'check',               required: true  },
          { id: 'ev_taws',     label: 'TAWS / EGPWS fitted',                                           type: 'check',               required: true  },
          { id: 'ev_tcas',     label: 'TCAS fitted',                                                   type: 'check',               required: true  },
          { id: 'ev_med_equip',label: 'AED and ICU-level medical equipment on board',                  type: 'check',               required: true  },
        ],
      },
      {
        title: 'Crew Standards',
        items: [
          { id: 'ev_atpl',    label: 'ATPL-qualified captain with ≥ 500 hours on type',    type: 'check', required: true  },
          { id: 'ev_medcrew', label: 'Critical care flight nurse or flight physician on board', type: 'check', required: true  },
          { id: 'ev_crm',     label: 'Crew CRM training current',                          type: 'check', required: true  },
        ],
      },
      {
        title: 'Operations',
        items: [
          { id: 'ev_24hr',     label: '24/7 dispatch and operations centre active',         type: 'check', required: true  },
          { id: 'ev_missions', label: '≥ 25 missions completed per year (EURAMI standard)', type: 'check', required: false },
          { id: 'ev_insurance',label: 'Hull insurance ≥ USD 5,000,000',                    type: 'check', required: true  },
        ],
      },
    ],
  },

  accommodation: {
    label: 'Accommodation',
    standard: 'OSAC / AHLA / UNDSS Security Standards',
    sections: [
      {
        title: 'Physical Security',
        items: [
          { id: 'acc_perimeter', label: 'Perimeter wall / fence with controlled access',          type: 'check', required: true  },
          { id: 'acc_guards',    label: '24-hour security guards on site',                        type: 'check', required: true  },
          { id: 'acc_cctv',      label: 'CCTV coverage with ≥ 30-day recording retention',        type: 'check', required: true  },
          { id: 'acc_floors',    label: 'Guest rooms on floors 2–6 (not ground; fire-safe)',      type: 'check', required: true  },
          { id: 'acc_keycard',   label: 'Electronic key card access to rooms',                    type: 'check', required: true  },
          { id: 'acc_safe',      label: 'In-room safe or secure storage available',               type: 'check', required: false },
          { id: 'acc_blinds',    label: 'Blackout blinds or privacy screens fitted',              type: 'check', required: false },
        ],
      },
      {
        title: 'Safety & Resilience',
        items: [
          { id: 'acc_fire',     label: 'Fire suppression / sprinkler system installed',         type: 'check', required: true  },
          { id: 'acc_smoke',    label: 'Smoke detectors in all rooms',                          type: 'check', required: true  },
          { id: 'acc_evacplan', label: 'Emergency evacuation plan posted in rooms',             type: 'check', required: true  },
          { id: 'acc_medkit',   label: 'Medical kit on site',                                   type: 'check', required: true  },
          { id: 'acc_power',    label: 'Backup generator or UPS power',                        type: 'check', required: true  },
          { id: 'acc_water',    label: 'Potable water supply available',                        type: 'check', required: true  },
        ],
      },
      {
        title: 'Assessment & Endorsement',
        items: [
          { id: 'acc_rso',     label: 'RSO or security adviser endorsement received',          type: 'check', required: false },
          { id: 'acc_incident',label: 'Incident history reviewed for last 12 months',          type: 'check', required: true  },
          { id: 'acc_survey',  label: 'Physical site survey completed by assessor',            type: 'check', required: false },
        ],
      },
    ],
  },

  aviation: {
    label: 'Aviation / Charter',
    standard: 'IOSA / BARS / IS-BAO / WYVERN / ARGUS',
    sections: [
      {
        title: 'Accreditation',
        items: [
          { id: 'av_cert',    label: 'IOSA, BARS, IS-BAO, WYVERN, or ARGUS certification held',           type: 'check', required: true  },
          { id: 'av_aoc',     label: 'AOC valid and in-country',                                           type: 'check', required: true  },
          { id: 'av_eu_list', label: 'Confirmed NOT on EU Air Safety List (verify before every charter)', type: 'check', required: true  },
        ],
      },
      {
        title: 'Aircraft Standards',
        items: [
          { id: 'av_ac_year',    label: `Aircraft manufacture year (must be ${MIN_AIRCRAFT_YEAR} or newer)`, type: 'number', unit: 'year', required: true  },
          { id: 'av_maintenance',label: 'Maintenance records current and available for review',               type: 'check',               required: true  },
          { id: 'av_pressurized',label: 'Aircraft pressurized and IFR equipped',                             type: 'check',               required: true  },
          { id: 'av_taws',       label: 'TAWS and TCAS both fitted',                                         type: 'check',               required: true  },
        ],
      },
      {
        title: 'Crew Standards',
        items: [
          { id: 'av_atpl',       label: 'ATPL-qualified captain',                                            type: 'check',                 required: true  },
          { id: 'av_hours',      label: 'Captain hours on type (must be ≥ 500)',                              type: 'number', unit: 'hours', required: true  },
          { id: 'av_type_rating',label: 'Type rating current and valid',                                      type: 'check',                 required: true  },
          { id: 'av_crm',        label: 'CRM training current',                                              type: 'check',                 required: true  },
        ],
      },
      {
        title: 'Insurance & Operations',
        items: [
          { id: 'av_liability',label: 'Third-party liability insurance ≥ USD 750,000,000', type: 'check', required: true  },
          { id: 'av_pax_ins',  label: 'Passenger liability insurance in place',            type: 'check', required: true  },
          { id: 'av_24hr',     label: '24/7 operations available',                         type: 'check', required: true  },
        ],
      },
    ],
  },
}

const DEFAULT_TEMPLATE = {
  label: 'General Vetting',
  standard: 'ISO 31030:2021',
  sections: [
    {
      title: 'Company Requirements',
      items: [
        { id: 'co_reg',       label: 'Company registration certificate on file',         type: 'check', required: true  },
        { id: 'co_license',   label: 'Operating licence valid',                          type: 'check', required: true  },
        { id: 'co_insurance', label: 'Liability insurance certificate on file',          type: 'check', required: true  },
        { id: 'co_tax',       label: 'Tax clearance certificate on file',                type: 'check', required: true  },
        { id: 'co_references',label: 'At least 2 verified client references',            type: 'check', required: true  },
        { id: 'co_24hr',      label: '24/7 emergency contact available',                 type: 'check', required: true  },
      ],
    },
  ],
}

export function getTemplate(category) {
  return VETTING_TEMPLATES[category] || DEFAULT_TEMPLATE
}
