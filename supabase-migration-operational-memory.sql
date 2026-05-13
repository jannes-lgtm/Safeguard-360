-- ============================================================================
-- SafeGuard360 — Operational Memory System Migration
-- Run this in the Supabase SQL Editor.
--
-- Tables:
--   operational_incidents     → Historical event database
--   regional_patterns         → Known recurring behavioral patterns
--   precursor_indicators      → Signals that precede escalation
--   risk_evolution_snapshots  → Trend tracking per country/region
-- ============================================================================

-- ── operational_incidents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operational_incidents (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  region                text NOT NULL,
  country               text NOT NULL,
  city                  text,
  incident_type         text NOT NULL,
  title                 text NOT NULL,
  description           text,
  severity              text NOT NULL DEFAULT 'Medium',
  start_date            date NOT NULL,
  end_date              date,
  duration_days         integer,
  escalation_behavior   text,
  operational_impact    text[],
  movement_impact       text DEFAULT 'moderate',
  response_outcomes     text,
  precursors_observed   text[],
  resolution_factors    text[],
  recurrence_risk       text DEFAULT 'medium',
  recurrence_notes      text,
  source_notes          text,
  is_active             boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- ── regional_patterns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regional_patterns (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  region                  text NOT NULL,
  country                 text,
  pattern_type            text NOT NULL,
  pattern_name            text NOT NULL,
  description             text NOT NULL,
  typical_duration        text,
  typical_severity        text DEFAULT 'Medium',
  trigger_indicators      text[],
  historical_occurrences  integer DEFAULT 1,
  last_observed           date,
  recurrence_interval     text,
  operational_implications text[],
  confidence_basis        text,
  confidence_score        integer DEFAULT 70,
  created_at              timestamptz DEFAULT now()
);

-- ── precursor_indicators ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS precursor_indicators (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  region                    text NOT NULL,
  country                   text,
  indicator_name            text NOT NULL,
  indicator_description     text NOT NULL,
  associated_outcome        text NOT NULL,
  outcome_probability       text DEFAULT 'moderate',
  typical_lead_time_days    integer,
  historical_accuracy_notes text,
  current_status            text DEFAULT 'inactive',
  confidence_score          integer DEFAULT 65,
  created_at                timestamptz DEFAULT now()
);

-- ── risk_evolution_snapshots ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS risk_evolution_snapshots (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  country             text NOT NULL,
  snapshot_date       date NOT NULL DEFAULT CURRENT_DATE,
  risk_level          text NOT NULL,
  trend_direction     text NOT NULL DEFAULT 'baseline',
  trend_acceleration  text DEFAULT 'steady',
  key_indicators      text[],
  confidence_score    integer DEFAULT 60,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  UNIQUE(country, snapshot_date)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_incidents_country       ON operational_incidents(country);
CREATE INDEX IF NOT EXISTS idx_incidents_region        ON operational_incidents(region);
CREATE INDEX IF NOT EXISTS idx_incidents_type          ON operational_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_start_date    ON operational_incidents(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_patterns_country        ON regional_patterns(country);
CREATE INDEX IF NOT EXISTS idx_patterns_region         ON regional_patterns(region);
CREATE INDEX IF NOT EXISTS idx_precursors_country      ON precursor_indicators(country);
CREATE INDEX IF NOT EXISTS idx_precursors_status       ON precursor_indicators(current_status);
CREATE INDEX IF NOT EXISTS idx_evolution_country       ON risk_evolution_snapshots(country);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE operational_incidents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE regional_patterns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE precursor_indicators       ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_evolution_snapshots   ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read operational memory (read-only)
CREATE POLICY "authenticated read incidents"
  ON operational_incidents FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated read patterns"
  ON regional_patterns FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated read precursors"
  ON precursor_indicators FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated read evolution"
  ON risk_evolution_snapshots FOR SELECT
  TO authenticated USING (true);

-- Service role can manage all (for admin ingestion and API writes)
CREATE POLICY "service role manage incidents"
  ON operational_incidents FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service role manage patterns"
  ON regional_patterns FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service role manage precursors"
  ON precursor_indicators FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service role manage evolution"
  ON risk_evolution_snapshots FOR ALL
  TO service_role USING (true) WITH CHECK (true);


-- ============================================================================
-- SEED DATA — Historical Incidents
-- ============================================================================

INSERT INTO operational_incidents
  (region, country, city, incident_type, title, description, severity, start_date, end_date,
   duration_days, escalation_behavior, operational_impact, movement_impact,
   precursors_observed, resolution_factors, recurrence_risk, recurrence_notes, is_active)
VALUES

-- ── Sudan ─────────────────────────────────────────────────────────────────────
(
  'north-africa', 'Sudan', 'Khartoum', 'civil_conflict',
  'RSF-SAF Armed Conflict — Khartoum',
  'Rapid Support Forces (RSF) clashed with Sudanese Armed Forces (SAF) on 15 April 2023. Fighting rapidly engulfed Khartoum, Omdurman, and Darfur. Civilian infrastructure targeted. Mass displacement followed. Conflict became protracted.',
  'Critical', '2023-04-15', NULL, NULL, 'rapid',
  ARRAY['airport_closure','transport_disruption','power_outages','medical_facility_damage','mass_displacement'],
  'severe',
  ARRAY['political_negotiations_collapse','military_buildup_khartoum','RSF_redeployment_from_darfur','SAF_deployment_airport'],
  ARRAY[],
  'high',
  'Protracted conflict likely to persist. Ceasefire negotiations repeatedly collapsed. Significant recurrence/continuation risk. Similar political-military tension in 2019 led to revolution.',
  true
),

-- ── Ethiopia ──────────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Ethiopia', 'Tigray', 'civil_conflict',
  'Tigray Conflict — TPLF vs Federal Forces',
  'Armed conflict erupted November 2020 between Ethiopian federal forces and TPLF. Escalated across Tigray, Amhara, and Afar regions. Humanitarian crisis; communications blackouts; aid obstruction. Ceasefire reached November 2022 but tensions persist.',
  'Critical', '2020-11-04', '2022-11-02', 728, 'gradual',
  ARRAY['humanitarian_corridor_disruption','aid_worker_risk','road_closures','communications_blackout'],
  'severe',
  ARRAY['TPLF_attack_federal_base','federal_government_military_deployment','communication_cuts','political_rhetoric_escalation'],
  ARRAY['AU_mediation','ceasefire_agreement','disarmament_process'],
  'high',
  'Tigray tensions cyclically re-emerge. Amhara Fano insurgency active post-ceasefire. Oromia OLA conflict ongoing. Multi-front instability pattern established.',
  false
),

-- ── DRC ───────────────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Democratic Republic of Congo', 'Goma', 'armed_conflict',
  'M23 Resurgence — Eastern DRC',
  'M23 rebel movement rearmed and re-emerged in eastern DRC (2021-2022). Goma fell briefly. MONUSCO withdrawal accelerated instability. Rwanda-DRC proxy dynamics. SADC military mission deployed but insufficient.',
  'High', '2021-11-01', NULL, NULL, 'gradual',
  ARRAY['road_closures','displaced_persons_movement','NGO_withdrawal','airport_security_elevated'],
  'severe',
  ARRAY['MONUSCO_withdrawal_signals','political_rhetoric_Kigali_Kinshasa','armed_group_recruitment_spike'],
  ARRAY[],
  'high',
  'M23 conflict is a recurring cycle since 2012. Eastern DRC ADF, FDLR, and militia groups create layered instability. Conflict flares correlate with regional diplomatic deterioration.',
  true
),

-- ── Nigeria ───────────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Nigeria', 'Zamfara', 'banditry',
  'Northwest Nigeria Banditry — Sustained Campaign',
  'Organized bandit groups (Yan Bindiga) conducting mass kidnappings, village raids, and highway robbery across Zamfara, Katsina, Sokoto, and Kebbi states. School abductions became systematic. Estimated 3,000+ civilians killed 2020-2023.',
  'High', '2019-01-01', NULL, NULL, 'persistent',
  ARRAY['road_closures','school_closures','village_evacuations','aid_worker_targeting'],
  'severe',
  ARRAY['cattle_rustling_surge','farmer_herder_conflict_escalation','government_amnesty_deals_collapse'],
  ARRAY[],
  'high',
  'Banditry in NW Nigeria has entrenched as an economy. Seasonal spike during dry season (Nov-Mar) when cattle movement increases. State governors negotiate independently creating inconsistent security.',
  true
),
(
  'sub-saharan-africa', 'Nigeria', 'Maiduguri', 'terrorism',
  'ISWAP/Boko Haram — Lake Chad Basin',
  'ISWAP (Islamic State West Africa Province) controls significant territory in Borno State. Regular attacks on military convoys, civilian IDP camps, and aid workers. Distinct from Boko Haram JAS faction. Both active.',
  'High', '2016-03-01', NULL, NULL, 'persistent',
  ARRAY['military_convoy_attacks','IDP_camp_targeting','NGO_movement_restrictions','road_IED_risk'],
  'severe',
  ARRAY['ISWAP_recruitment_spikes','JAS_fragmentation','civilian_support_erosion'],
  ARRAY[],
  'high',
  'Lake Chad Basin conflict is multi-state (Nigeria, Niger, Chad, Cameroon). Cross-border dynamics. Rainy season (Jul-Sep) reduces mobility for both sides; dry season increases attack tempo.',
  true
),

-- ── Sahel Coups ───────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Mali', 'Bamako', 'political_instability',
  'Mali Military Coups — August 2020 & May 2021',
  'Two military coups within 9 months. First coup removed President Keïta amid jihadist insurgency frustration. Second coup removed transitional president Goïta. ECOWAS sanctions. Wagner Group engagement followed.',
  'High', '2020-08-18', '2021-06-30', 315, 'spike_and_decline',
  ARRAY['curfews','border_closures','bank_closures','internet_throttling'],
  'moderate',
  ARRAY['protest_movements','military_factionalism_signals','ECOWAS_pressure_failure','jihadist_gains_Sahel'],
  ARRAY['transitional_government_formation','ECOWAS_negotiation'],
  'high',
  'Coup pattern in Sahel is contagious. Mali → Burkina Faso → Niger followed. Post-coup stabilization typically takes 12-36 months before operational normalization. JNIM activity intensified post-coup.',
  false
),
(
  'sub-saharan-africa', 'Niger', 'Niamey', 'political_instability',
  'Niger Military Coup — July 2023',
  'Presidential Guard elements detained President Bazoum on 26 July 2023. ECOWAS threatened military intervention. France expelled. US aid suspended. Burkina Faso and Mali formed Alliance of Sahel States (AES) in solidarity.',
  'High', '2023-07-26', NULL, NULL, 'spike_and_decline',
  ARRAY['embassy_drawdowns','flight_suspensions','aid_suspension','border_security_elevated'],
  'moderate',
  ARRAY['presidential_guard_loyalty_fracture','growing_anti-France_sentiment','jihadist_pressure_accumulation'],
  ARRAY[],
  'high',
  'Third Sahel coup in three years. Demonstrates systematic fragility of Sahel governance. AES bloc formation signals regional geopolitical realignment with Russia.',
  true
),

-- ── Kenya ─────────────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Kenya', 'Nairobi', 'election_violence',
  'Kenya Post-Election Violence — 2017',
  'Disputed presidential election results triggered violent protests in opposition strongholds (Nairobi Kibera, Kisumu, Mombasa). Security forces fired on crowds. Repeat election ordered and boycotted. Sporadic violence persisted for months.',
  'High', '2017-08-08', '2017-11-26', 110, 'spike_and_decline',
  ARRAY['road_blocks','business_closures','transport_disruption','curfews_in_hotspot_areas'],
  'moderate',
  ARRAY['close_poll_predictions','NASA_coalition_rhetoric','IEBC_independence_questions','social_media_disinformation'],
  ARRAY['supreme_court_ruling','repeat_election','Odinga_withdrawal'],
  'medium',
  'Kenya has a documented election violence pattern: 2007-08 (1,200 dead), 2013 (low-level), 2017 (moderate). 2022 passed peacefully due to Ruto-Odinga-Uhuru dynamics. Pattern activates when results are genuinely contested.',
  false
),

-- ── South Africa ──────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'South Africa', 'Johannesburg', 'civil_unrest',
  'South Africa July 2021 Unrest — KwaZulu-Natal and Gauteng',
  'Zuma imprisonment triggered coordinated looting and arson across KZN and Gauteng. 354 dead. Malls, warehouses, distribution centres gutted. Supply chain disruption lasted weeks. National Guard deployed.',
  'Critical', '2021-07-09', '2021-07-18', 10, 'rapid',
  ARRAY['supply_chain_disruption','shopping_centre_closures','fuel_shortages','loadshedding_intensification'],
  'moderate',
  ARRAY['Zuma_imprisonment','political_mobilization_ANC_factions','high_unemployment_context','social_media_coordination'],
  ARRAY['military_deployment','supply_chain_restoration','calm_appeals'],
  'medium',
  'July 2021 demonstrated potential for rapid organized unrest in South Africa. Load-shedding (Eskom) creates ongoing frustration. Economic inequality is a persistent structural precursor. Next trigger could come from any political flashpoint.',
  false
),

-- ── Somalia ───────────────────────────────────────────────────────────────────
(
  'sub-saharan-africa', 'Somalia', 'Mogadishu', 'terrorism',
  'Al-Shabaab Sustained Campaign — Southern Somalia',
  'Al-Shabaab controls significant rural territory in south-central Somalia and conducts regular complex attacks in Mogadishu, Beledweyne, and against ATMIS positions. Hotel sieges, car bombs, and ambushes are signature tactics.',
  'Critical', '2006-01-01', NULL, NULL, 'persistent',
  ARRAY['hotel_sieges','airport_attack_attempts','NGO_targeting','road_IED_risk'],
  'severe',
  ARRAY[],
  ARRAY[],
  'high',
  'Al-Shabaab attacks follow a cyclical pattern: major attack → AMISOM/ATMIS response → temporary retreat → regroup → next major attack. Ramadan historically sees increased operational tempo. Seasonal flooding reduces mobility Oct-Nov.',
  true
),

-- ── Lebanon ───────────────────────────────────────────────────────────────────
(
  'mena', 'Lebanon', 'Beirut', 'infrastructure_failure',
  'Lebanon Economic Collapse and Infrastructure Crisis',
  'Systematic collapse of Lebanese banking system from 2019. Hyperinflation. Electricity generation collapsed to 2-4 hours/day in 2021-2023. Fuel crises. Beirut Port explosion August 2020 (2,750 dead). Government defaults. IMF negotiations stalled.',
  'High', '2019-10-17', NULL, NULL, 'persistent',
  ARRAY['banking_restrictions','fuel_shortages','power_outages','hospital_capacity_collapse','internet_degradation'],
  'moderate',
  ARRAY['banking_sector_stress_signals','political_deadlock','Hezbollah_economic_integration','corruption_prosecution_failures'],
  ARRAY[],
  'high',
  'Lebanon infrastructure crisis is structural. Power grid, water, telecom, and medical systems all degraded. Any political shock (war, assassination, border escalation) risks cascading into humanitarian crisis. Hezbollah-Israel tensions add layer.',
  true
),

-- ── Israel-Palestine ──────────────────────────────────────────────────────────
(
  'mena', 'Israel', 'Tel Aviv', 'armed_conflict',
  'Gaza-Israel Conflict Escalation — October 2023',
  'Hamas October 7 attack killed ~1,200 Israelis. IDF launched sustained campaign in Gaza. Hezbollah front activated in north. Houthi Red Sea attacks disrupted shipping. Iranian missile strikes on Israel. Regional escalation risk at highest since 1973.',
  'Critical', '2023-10-07', NULL, NULL, 'rapid',
  ARRAY['airport_security_elevated','regional_flight_disruptions','shipping_lane_changes','embassy_alerts_issued'],
  'severe',
  ARRAY['Gaza_blockade_escalation','settler_violence_West_Bank','IDF_operation_signaling','Hamas_rocket_launches'],
  ARRAY[],
  'high',
  'Israel-Hamas conflict has a multi-decade escalation cycle: 2008-09, 2012, 2014, 2021, 2023. Each cycle more intense. 2023 iteration has unprecedented regional dimension. UAE/KSA normalization process disrupted.',
  true
),

-- ── Yemen ─────────────────────────────────────────────────────────────────────
(
  'mena', 'Yemen', 'Sana''a', 'armed_conflict',
  'Yemen Civil War — Houthi Control and Red Sea Operations',
  'Houthi Ansar Allah controls Sana''a and northern Yemen since 2015. Saudi-UAE coalition conducting air campaign. Houthis targeting Red Sea shipping from late 2023 in support of Gaza. Aden under STC/Saudi-backed forces.',
  'Critical', '2015-03-26', NULL, NULL, 'persistent',
  ARRAY['no_fly_zone_Sana_airport','shipping_lane_risk','aid_access_restricted','water_infrastructure_collapse'],
  'severe',
  ARRAY[],
  ARRAY[],
  'high',
  'Yemen conflict is structural. Houthi Red Sea campaign adds international dimension. UKMTO shipping alerts active. Any diplomatic breakthrough fragile. Periodic ceasefire negotiations do not resolve root conflict.',
  true
);


-- ============================================================================
-- SEED DATA — Regional Patterns
-- ============================================================================

INSERT INTO regional_patterns
  (region, country, pattern_type, pattern_name, description, typical_duration,
   typical_severity, trigger_indicators, historical_occurrences, last_observed,
   recurrence_interval, operational_implications, confidence_basis, confidence_score)
VALUES

-- ── Election Cycles ───────────────────────────────────────────────────────────
(
  'sub-saharan-africa', NULL, 'election_cycle',
  'Sub-Saharan Africa Pre-Election Tension Window',
  '3-6 months before contested African elections, operational risk consistently elevates due to political mobilization, rhetorical escalation, and protest activity. Post-election period (0-30 days) carries highest violence risk if results are disputed. Countries with weak institutions or close results carry highest risk.',
  '6-9 months', 'High',
  ARRAY['election_announcement','opposition_coalition_formation','incumbency_manipulation_signals','close_poll_results','social_media_disinformation_spike'],
  12, '2024-01-01', 'Per major election cycle',
  ARRAY['increase_check_in_frequency','avoid_political_gatherings','confirm_evacuation_routes','brief_travellers_on_protest_avoidance'],
  'Based on documented violence patterns across Kenya 2007-08/2013/2017, Zimbabwe 2008/2023, DRC 2006/2011/2018/2023, Nigeria 2015/2019/2023, Côte d''Ivoire 2010-11/2020, Mozambique 2019-2021',
  88
),
(
  'mena', NULL, 'election_cycle',
  'MENA Political Transition Instability',
  'In MENA, formal elections are less common triggers than political succession crises, constitutional amendments, or leadership transitions. These events correlate with security mobilization, protest suppression, internet throttling, and border/airport security tightening.',
  '3-12 months', 'Medium',
  ARRAY['leadership_transition_announcement','constitutional_reform_process','protest_suppression_signals','security_force_redeployment'],
  5, '2023-01-01', 'Event-driven',
  ARRAY['monitor_state_communications','expect_security_force_visibility_increase','prepare_for_internet_disruptions'],
  'Based on Arab Spring dynamics 2010-12, Lebanon political crises 2019-present, Iraq government formation cycles',
  70
),

-- ── Seasonal Patterns ─────────────────────────────────────────────────────────
(
  'sub-saharan-africa', NULL, 'seasonal',
  'West Africa Harmattan Season — Operational Impact',
  'Harmattan (November–March) brings dense dust haze, reduced visibility, respiratory health risk, and aviation delays across West Africa (Nigeria, Ghana, Côte d''Ivoire, Senegal, Cameroon). VFR flights severely restricted. Road accident risk elevated.',
  '4-5 months', 'Low',
  ARRAY['onset_of_dry_northeast_winds','dust_haze_reports','WHO_air_quality_alerts'],
  40, '2024-03-01', 'Annual Nov-Mar',
  ARRAY['check_flight_delay_risk','carry_respiratory_protection','monitor_aviation_advisories','confirm_road_visibility_conditions'],
  'Climatological pattern, extremely high confidence. Data from ACMAD and aviation weather records.',
  95
),
(
  'sub-saharan-africa', NULL, 'seasonal',
  'East/West Africa Rainy Season — Road Access Degradation',
  'Extended rains (April–June, October–November in East Africa; May–October West Africa) cause road access deterioration, bridge failures, and rural area isolation. NGO logistics routinely suspended. Flooding in urban areas. Malaria risk elevates significantly.',
  '4-6 months', 'Medium',
  ARRAY['meteorological_seasonal_onset','OCHA_flood_alerts','road_condition_deterioration_reports'],
  40, '2024-11-01', 'Annual',
  ARRAY['assess_road_condition_before_travel','carry_additional_supplies','verify_medical_evacuation_availability','confirm_insurance_covers_flood_disruption'],
  'Climatological pattern with documented logistics disruption from NGO operational reports.',
  92
),
(
  'mena', NULL, 'seasonal',
  'Ramadan Operational Environment Changes',
  'During Ramadan (lunar, ~30 days), operational patterns shift significantly across MENA and Muslim-majority Africa: business hours compress, day productivity drops, evening activity surges. Security incidents historically spike in the final third of Ramadan and around Eid. In conflict zones, some militant groups intensify attacks during Ramadan.',
  '30 days', 'Low',
  ARRAY['ramadan_announcement','lunar_calendar_month_of_shaaban'],
  40, '2024-04-09', 'Annual lunar calendar',
  ARRAY['adjust_meeting_schedules','plan_for_reduced_business_hours','monitor_security_alerts_in_final_ten_days','be_aware_of_crowd_sizes_at_prayer_times'],
  'Operational experience documented across MENA and Sahel. Security incident data from ACLED.',
  85
),
(
  'gulf', NULL, 'seasonal',
  'Gulf Summer Heat — Operational Stress',
  'June–September in the Gulf (UAE, Saudi, Kuwait, Qatar) brings extreme heat (45-50°C), high humidity, and reduced outdoor operational capacity. Worker health incidents increase. Outdoor activities require medical planning. Aviation may experience density altitude effects.',
  '4 months', 'Low',
  ARRAY['summer_temperature_forecasts','heat_advisory_issuance'],
  40, '2024-09-01', 'Annual Jun-Sep',
  ARRAY['carry_heat_illness_protocols','schedule_outdoor_activities_before_0900_or_after_1800','confirm_hotel_has_medical_support','carry_adequate_water_supplies'],
  'Climatological certainty. Worker fatality records from Gulf governments confirm operational risk.',
  95
),

-- ── Economic/Infrastructure Patterns ─────────────────────────────────────────
(
  'sub-saharan-africa', 'Nigeria', 'infrastructure_cycle',
  'Nigeria Loadshedding and Fuel Crisis Pattern',
  'Nigeria experiences recurring cycles of fuel shortages and power generation failures that create cascading operational disruption: generator fuel unavailable, ATMs offline, hotel backup power limited, airport ground operations disrupted. Correlates with government subsidy changes and import disruptions.',
  '2-6 weeks', 'Medium',
  ARRAY['NNPC_fuel_supply_disruption_reports','pump_price_volatility','NERC_grid_stability_warnings','port_congestion_Apapa'],
  15, '2024-01-01', 'Recurrent',
  ARRAY['carry_USD_cash','confirm_hotel_generator_capacity','arrange_fuel_supply_for_convoy_vehicles','download_offline_maps'],
  'Based on NNPC reports, NERC data, and operational logs from NGOs working in Nigeria.',
  80
),
(
  'sub-saharan-africa', 'South Africa', 'infrastructure_cycle',
  'South Africa Loadshedding Cycle (Eskom)',
  'Eskom''s load shedding has become structural, reaching Stage 6-8 (10+ hours/day) during high-demand periods. Correlates with seasonal demand peaks (June-August winter, December holiday load). Critical infrastructure workarounds degrade over time.',
  'Weeks to months', 'Medium',
  ARRAY['Eskom_stage_escalation','winter_demand_peak','generation_unit_trip_reports','Eskom_operational_update'],
  20, '2024-01-01', 'Year-round with seasonal intensification',
  ARRAY['confirm_backup_power_at_accommodation','carry_portable_chargers','check_loadshedding_schedule_apps','verify_fuel_ATM_availability'],
  'Eskom operational data, government energy ministry reports.',
  90
),

-- ── Security Patterns ─────────────────────────────────────────────────────────
(
  'sub-saharan-africa', NULL, 'security_cycle',
  'Sahel Post-Coup Security Environment',
  'Following coups in Mali, Burkina Faso, and Niger (2020-2023), the post-coup period follows a pattern: initial calm during political consolidation, then jihadist opportunism as military attention diverts to political control, then gradual security deterioration over 6-24 months as junta focuses on political survival over military operations.',
  '6-24 months', 'High',
  ARRAY['coup_announcement','ECOWAS_sanction_threat','France_or_Western_withdrawal','Wagner_Group_engagement_signals','jihadist_territorial_gain_reports'],
  3, '2023-07-26', 'Event-driven, repeat pattern',
  ARRAY['expect_jihadist_activity_increase_post-coup','monitor_convoy_security','brief_travellers_on_coup-specific_protocols','identify_evacuation_routes_early'],
  'Direct pattern observed across Mali, Burkina Faso, and Niger coups 2020-2023. ACLED conflict data confirms pattern.',
  85
),
(
  'mena', 'Lebanon', 'infrastructure_cycle',
  'Lebanon Infrastructure Collapse Cycle',
  'Lebanon''s infrastructure degradation follows a crisis spiral: political deadlock → government dysfunction → infrastructure funding failure → cascading utility failures → social pressure → political deadlock. Each cycle worsens baseline. Power, water, telecoms, and healthcare all affected.',
  'Multi-year', 'High',
  ARRAY['political_deadlock_signals','central_bank_reserves_warnings','fuel_import_payment_failures','hospital_capacity_alerts'],
  1, '2024-01-01', 'Structural — ongoing',
  ARRAY['carry_cash_USD_only','use_satellite_communication_backup','confirm_private_medical_evacuation','brief_travellers_on_power_outage_duration'],
  'IMF Article IV reports, BdL reserve data, WHO Lebanon health system assessments.',
  88
);


-- ============================================================================
-- SEED DATA — Precursor Indicators
-- ============================================================================

INSERT INTO precursor_indicators
  (region, country, indicator_name, indicator_description,
   associated_outcome, outcome_probability, typical_lead_time_days,
   historical_accuracy_notes, current_status, confidence_score)
VALUES

(
  'global', NULL, 'Internet Shutdown / Throttling',
  'Government-ordered internet restrictions, social media blocks, or bandwidth throttling. Frequently precedes or accompanies political crackdowns, coup attempts, or protest suppression.',
  'Political crackdown, coup attempt, mass protest suppression, or election manipulation',
  'high', 0,
  'Documented in Sudan 2019/2021/2023, Ethiopia 2020-2021, Nigeria EndSARS 2020, DRC 2018, Niger 2023, Zimbabwe 2019. NetBlocks data confirms pattern.',
  'inactive', 88
),
(
  'global', NULL, 'Military Redeployment to Urban Areas',
  'Visible redeployment of military units to capital cities or major urban centres without clear public justification.',
  'Coup attempt, major political crisis, or preemptive political crackdown',
  'moderate', 3,
  'Observed 2-7 days before coups in Burkina Faso 2022, Niger 2023, Sudan 2021. Also seen before legitimate election security deployments — distinguish by secrecy and communication patterns.',
  'inactive', 72
),
(
  'sub-saharan-africa', NULL, 'Fuel Price Spike / Subsidy Removal',
  'Rapid increase in pump fuel prices, announcement of subsidy removal, or widespread fuel shortage at stations.',
  'Mass protests, transport strikes, and potential looting or supply chain disruption',
  'moderate', 7,
  'Nigeria EndSARS 2020 preceded by fuel tensions; Nigeria Tinubu subsidy removal 2023 triggered protests; Ghana fuel crisis 2022 coincided with IMF negotiations; Zimbabwe fuel protests 2019.',
  'inactive', 75
),
(
  'sub-saharan-africa', NULL, 'Opposition Leader Arrest / Exile',
  'Arrest, detention, or forced exile of a significant opposition political leader.',
  'Mass protest mobilization, civil disobedience, and potential political violence',
  'high', 14,
  'Kenya: Raila arrest history. Zimbabwe: Chamisa/MDC detentions. Ethiopia: OFC arrests 2020. South Africa: Zuma imprisonment → July 2021 unrest. Pattern is consistent.',
  'inactive', 80
),
(
  'sub-saharan-africa', NULL, 'Cross-Border Militant Incursion Spike',
  'Increase in reported cross-border attacks from militant groups — especially in Sahel (JNIM, ISWAP), East Africa (Al-Shabaab), or Great Lakes (ADF, M23) corridor areas.',
  'Regional security deterioration and spillover to neighbouring countries',
  'high', 21,
  'JNIM expansion from Mali → Burkina Faso → Côte d''Ivoire border. ISWAP cross-border into Cameroon/Chad. Al-Shabaab Kenya incursions from Somalia. ADF operations across DRC-Uganda border.',
  'inactive', 78
),
(
  'sub-saharan-africa', NULL, 'Farmer-Herder Conflict Escalation',
  'Significant increase in reported farmer-herder clashes, particularly in Nigeria''s Middle Belt, Sahel, or East African pastoral zones.',
  'Localized violence, road insecurity, and displacement — can escalate to wider community conflict',
  'moderate', 30,
  'Nigeria Middle Belt: recurring pattern, Benue/Plateau/Kaduna states most affected. Mali/Burkina: farmer-herder conflict exploited by jihadist groups for recruitment. Seasonal (dry season: Nov-Apr).',
  'inactive', 73
),
(
  'mena', NULL, 'Israeli Military Mobilization Signals',
  'Public IDF call-up orders for reserves, Cabinet security consultations, or public CBRN alerts in northern Israel or Gaza border communities.',
  'Regional military escalation with potential for spillover across Lebanon, Syria, and Gulf shipping lanes',
  'high', 3,
  'Consistent precursor to 2006 Lebanon War, 2008/2012/2014/2021/2023 Gaza operations. Reserve call-ups are public and trackable.',
  'inactive', 82
),
(
  'mena', NULL, 'Hezbollah Mobilization Signals',
  'Reports of Hezbollah weapons movement, unit deployment to the border, or public leadership statements about "resistance options".',
  'Northern Israel-Lebanon military exchange and potential regional escalation',
  'moderate', 7,
  'Observed before 2006 Lebanon War and in October 2023 border activation following Gaza conflict.',
  'inactive', 70
),
(
  'mena', NULL, 'Currency / Central Bank Crisis',
  'Black market exchange rate deviating significantly from official rate, capital controls announced, or central bank reserve warnings.',
  'Civil unrest, supply shortages, mass protests, and social instability',
  'high', 30,
  'Lebanon: 90% currency devaluation 2019-2023 → social collapse. Sudan: hyperinflation → revolution 2019 → coup 2021. Zimbabwe: recurring currency crises → political instability.',
  'inactive', 80
),
(
  'gulf', NULL, 'Houthi Red Sea Attack Uptick',
  'Increase in reported Houthi anti-ship missile or drone attacks on commercial vessels in the Red Sea or Gulf of Aden.',
  'Shipping route disruption, insurance premium spike, and potential military escalation in Red Sea',
  'high', 3,
  'Houthi Red Sea campaign launched late 2023 in response to Gaza conflict. UKMTO alerts. EU Operation Aspides and US Operation Prosperity Guardian responses tracked.',
  'inactive', 83
),
(
  'sub-saharan-africa', 'Kenya', 'Kenyan Election Cycle Activation',
  'Kenya''s next general election approaches, close polling numbers reported, or IEBC independence questioned.',
  'Pre-election tension, potential post-election violence especially in Nairobi hotspots, Kisumu, and Coast',
  'moderate', 120,
  'Kenya 2007-08 (post-election violence, 1,200+ dead), 2013 (ICC cases, lower violence), 2017 (Supreme Court nullification, repeat election), 2022 (peaceful but tense). Pattern activates when results genuinely disputed.',
  'inactive', 75
);


-- ============================================================================
-- SEED DATA — Risk Evolution Snapshots (latest known states)
-- ============================================================================

INSERT INTO risk_evolution_snapshots
  (country, snapshot_date, risk_level, trend_direction, trend_acceleration,
   key_indicators, confidence_score, notes)
VALUES
  ('Sudan',                       '2025-01-01', 'Critical',  'escalating',   'rapid',   ARRAY['RSF_control_Khartoum','mass_displacement_8M+','humanitarian_access_collapse'],  85, 'Active protracted conflict. RSF and SAF both conducting attacks on civilian areas. No ceasefire.'),
  ('Democratic Republic of Congo','2025-01-01', 'High',      'volatile',     'rapid',   ARRAY['M23_advance_eastern_DRC','SADC_mission_struggles','civilians_displaced_Goma'],  80, 'M23/AFC advance toward Goma ongoing. MONUSCO withdrawal completed. Multiple armed groups active.'),
  ('Nigeria',                     '2025-01-01', 'High',      'stabilizing',  'gradual', ARRAY['NW_banditry_persistent','ISWAP_active_NE','economic_pressure_protests'],         72, 'Security situation in NW and NE remains serious. Economic protests ongoing in south.'),
  ('Ethiopia',                    '2025-01-01', 'Medium',    'stabilizing',  'gradual', ARRAY['Tigray_ceasefire_holding','Amhara_Fano_active','Oromia_OLA_conflict'],            68, 'Tigray ceasefire holding but Amhara and Oromia conflicts continue.'),
  ('Mali',                        '2025-01-01', 'High',      'deteriorating','gradual', ARRAY['JNIM_expansion','AES_bloc','Wagner_Group_present','Kidal_recaptured'],            78, 'JNIM expanding south toward Bamako suburbs. Wagner Group (Africa Corps) assisting FAMA.'),
  ('Burkina Faso',                '2025-01-01', 'Critical',  'deteriorating','rapid',   ARRAY['JNIM_controls_40_percent','Ouagadougou_attacked','internet_shutdowns'],           82, 'Junta-controlled corridors shrinking. Ouagadougou experienced car bomb 2023. AES bloc formation.'),
  ('Niger',                       '2025-01-01', 'High',      'volatile',     'gradual', ARRAY['post_coup_stabilization','ECOWAS_sanctions','French_forces_expelled'],           75, 'Coup stabilizing but JNIM activity in west increasing. US forces partially withdrawn.'),
  ('Somalia',                     '2025-01-01', 'Critical',  'volatile',     'rapid',   ARRAY['Al_Shabaab_Mogadishu_attacks','ATMIS_withdrawal','SNA_offensives'],               80, 'Al-Shabaab conducting regular complex attacks. ATMIS drawdown ongoing, creating security gaps.'),
  ('Lebanon',                     '2025-01-01', 'High',      'volatile',     'rapid',   ARRAY['Hezbollah_Israel_ceasefire_Nov_2024','infrastructure_collapse','economic_crisis'],75, 'November 2024 ceasefire between Hezbollah and Israel. Underlying economic and infrastructure crisis unchanged.'),
  ('Israel',                      '2025-01-01', 'High',      'volatile',     'rapid',   ARRAY['Gaza_operations_ongoing','West_Bank_settler_violence','Hezbollah_front_active'], 80, 'Gaza operations continuing. Northern ceasefire tenuous. Regional escalation risk elevated.'),
  ('Yemen',                       '2025-01-01', 'Critical',  'volatile',     'steady',  ARRAY['Houthi_Red_Sea_attacks','coalition_airstrikes','humanitarian_crisis'],            82, 'Houthi Red Sea campaign continuing. Ground situation static. Humanitarian crisis severe.'),
  ('Kenya',                       '2025-01-01', 'Medium',    'stabilizing',  'gradual', ARRAY['Gen_Z_protest_movement_2024','police_reform_pressure','economic_austerity'],      70, '2024 protest wave over finance bill subsided after president withdrew bill. Police accountability process ongoing.'),
  ('South Africa',                '2025-01-01', 'Medium',    'baseline',     'steady',  ARRAY['loadshedding_reduced','GNU_formation','crime_rates_high'],                        72, 'GNU formed after ANC majority loss. Loadshedding significantly reduced. Crime remains structural concern.'),
  ('UAE',                         '2025-01-01', 'Low',       'baseline',     'steady',  ARRAY['Houthi_missile_threat_2022_resolved','regional_spillover_monitoring'],            85, 'UAE stable. Regional spillover from Yemen/Israel-Gaza monitored but contained. Business operations normal.'),
  ('Saudi Arabia',                '2025-01-01', 'Low',       'stabilizing',  'gradual', ARRAY['Vision_2030_stability_priority','Iran_rapprochement','Yemen_ceasefire_talks'],   80, 'MBS consolidation. Iran-KSA diplomatic normalization 2023. Yemen ceasefire negotiations reducing Houthi attacks on KSA.');
