/**
 * One-time script: upload Crisis24 Global Risk Forecast 2026 to CAIRO knowledge base.
 *
 * Usage:
 *   1. Add SUPABASE_SERVICE_ROLE_KEY=<key> to .env
 *   2. node scripts/upload-grf2026.mjs
 */

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import * as dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AI_KEY = process.env.ANTHROPIC_API_KEY

if (!SB_URL || !SB_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(SB_URL, SB_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anthropic = new Anthropic({ apiKey: AI_KEY })

// ── Resolve an admin user id for created_by ───────────────────────────────────
async function getAdminUserId() {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'developer'])
    .limit(1)
    .single()
  return data?.id || null
}

// ── Full extracted text from the 58-page report ───────────────────────────────
const CONTENT = `CRISIS24 GLOBAL RISK FORECAST 2026
Published by Crisis24 (A GardaWorld Company)
Theme: Future Ready, Now.
Authors: Mick Sharp (SVP Operations & Intelligence), Sally Llewellyn (VP Global Intelligence)

====================================================================
EXECUTIVE SUMMARY
====================================================================

The coming year will be defined by change. Evolving trade policies, shifting allegiances, rapid advances in technology, and persistent global crises will create an operating environment that is fast-moving and hard to predict. Organizations should expect episodic shocks, but the most significant challenge will be near-continuous, overlapping incidents that test resilience, decision-making, and trust.

The convergence of political tensions and the weaponization of technology mean short-term crises can quickly multiply. A local outage, a data breach, or a protest can escalate into a supply chain or reputational crisis within hours. Being "future ready" requires flexibility at every layer of operations — systems and cultures that absorb shocks, adapt in real time, and continue to move forward as conditions change.

TWO DYNAMICS SHAPE THE YEAR AHEAD:

A POLARIZED, TRANSACTIONAL WORLD AMPLIFIES GEOPOLITICAL VOLATILITY.
Persistent policy divergence — most visible in US-European approaches to Russia — creates uncertainty and openings for opportunistic rivals. In Asia, an assertive Beijing and a less-consistent Washington raise miscalculation risks at sea and along disputed borders, where even brief standoffs can jolt logistics and markets. In the Middle East and the Horn of Africa, local politics and proxy competition will drive volatility as the danger of sudden protests, conflict, and violence threatens foreign interests. Across the Americas and parts of Africa, drones, automation, and AI are scaling organized crime, while polarization deepens divides. Extreme weather will compound risk management pressures, further compressing timelines for crisis response.

TECHNOLOGY MULTIPLIES RISK AND OPPORTUNITY AS ADVERSARIES ADOPT AND ADAPT AT PACE.
Technology is no longer just a tool, but an accelerant reshaping competition and exposure. With shifting alliances and rapid adoption by state and non-state actors, technology is both an arena — e.g., China and the US scaling for AI advantage — and a weapon. As risk teams deploy new tools to enhance foresight, detection, and resilience, they also widen exposure to manipulation and disruption. AI and data abundance are redefining how human judgment and machine insight combine to enable operations. Advantage favors those who read signals sooner, operationalize decisions faster, and manage risk while spotting opportunity.

KEY GLOBAL THEMES:
- Global stability will continue to hinge on shifts in US policy and major power competition
- The Middle East will be reshaped in the aftermath of the Israel-Hamas war
- Across Sub-Saharan Africa, competition for influence is deepening as China, Russia, Türkiye, and Gulf States expand economic and security footprints
- In Asia, miscalculation risks remain high. Tensions between Taipei and Beijing persist
- Across the Americas, risks are converging where technology, politics, and major events intersect
- Technology is an enabler and amplifier of risk. AI-driven misinformation and synthetic media now spread faster than verification can respond
- Extreme weather is now a constant operating factor

====================================================================
AI & TECHNOLOGY: DEFINING RISK TRENDS
====================================================================

NARRATIVES AS AN ATTACK SURFACE: THE 2026 INFORMATION RISK FORECAST

EXECUTIVE SUMMARY:
In 2026, strategic risk will emerge from the information domain as narrative-driven threats. Misinformation and disinformation, executive impersonation and deepfakes, and coordinated brand attacks now move faster than corporate response cycles. These narratives can jolt markets, lead to physical threats, and erode brand equity. Leadership identity becomes both an amplifier and an attack surface. Organizations will need continuous monitoring, bespoke incident response, and cross-functional management to protect reputation, safety, and continuity — and to compress decision windows from hours to minutes.

KEY JUDGMENTS:
- Speed and credibility will define 2026 information risk; narrative attacks will outpace response and erode trust and value
- Executive identity will increasingly serve as both a brand amplifier and attack vector, increasing exposure to impersonation and deepfake operations
- Online-offline risks will reinforce each other, with polarizing narratives driving harassment and protest activity, while physical incidents fuel viral narratives that impact markets
- AI-enabled, authoritative-looking content forces faster, cross-functional responses linking protective intelligence with reputation management

THREAT LANDSCAPE — TECH AMPLIFIERS:
- January 2024: Hackers compromised US SEC's official X account to post false approval of a Bitcoin ETF, briefly jolting crypto markets
- May 2023: AI-generated image of explosion at the Pentagon circulated widely, triggering a short-lived market dip before verification caught up
- 2025: Fraudsters in Singapore used deepfake technology to pose as senior executives and convince a finance director to transfer USD 499,000

INFORMATION-PHYSICAL CONVERGENCE:
Polarizing narratives about pricing, access, or corporate behavior spill quickly into the physical domain. Online campaigns can escalate into harassment, doxxing, stalking, and protests at homes or offices. Physical safety incidents are captured, edited, and remixed into synthetic "evidence" that travels further than the facts.

MITIGATION STRATEGIES:
- Plan and Govern: Build incident command structures for information risk and include board-level reporting as part of governance
- Monitor: Conduct persistent monitoring across open sources and media signals to surface narrative risks and exposure early
- Decide Fast: Exercise cross-functional protocols to make coordinated decisions within minutes
- Act: Debunk rapidly, escalate/takedown on platforms, brief key stakeholders, and refer fraud or threats to law enforcement

SIGNALS TO WATCH:
- Compromised authority and synthetic visuals: Hacked regulator or corporate accounts and AI-generated crisis imagery
- Executive and finance-focused deepfakes: Convincing impersonations on calls or video that bypass controls
- Online-offline escalation: Polarizing narratives fueling harassment, doxxing, and protests

---

CYBER PREPOSITIONING AND THE EMERGING THREAT TO CRITICAL INFRASTRUCTURE

EXECUTIVE SUMMARY:
Critical Infrastructure (CI) will be a central focus of strategic competition through 2026 and will become increasingly vulnerable to covert penetration. Cyber prepositioning — quietly embedding long-term access inside Operational Technology (OT) — will likely become routine statecraft. Adversaries will seek persistence for months or years, holding access in reserve until crisis conditions justify disruption. This marks a shift from opportunistic cybercrime toward strategic leverage.

KEY JUDGMENTS:
- Cyber prepositioning in OT will become a standard instrument of statecraft, with dwell time measured in months or years
- Heightened risk of overt CI disruption will track geopolitical crises (e.g., Taiwan Strait and Eastern Europe)
- AI and digital twins will accelerate both attack sophistication and defense complexity
- Multinational businesses face increased exposure as critical suppliers and services may already be compromised

THREAT LANDSCAPE:
- CI comprises the essential physical and digital assets that deliver energy, transportation, water, healthcare, telecommunications, financial, and other services
- OT systems monitor and control physical processes and have historically sat apart from the public internet
- Prepositioning as statecraft: The covert establishment of persistent access within OT environments of rival systems. Dwell time is months to years
- Russian threat actors compromised Ukraine's power grid in 2015-2016, temporarily cutting power to hundreds of thousands of people
- In 2023, US authorities revealed a China-affiliated group had gained long-term access within US and Guam telecommunications
- Sectors most exposed: Energy/transport, Telecoms, Finance (cross-border dependencies)
- Access method: Covert infiltration of OT, persistence measured in months/years
- Trigger conditions: Escalation tied to geopolitical flashpoints (Taiwan Strait, Eastern Europe)
- Operational impacts: Power/water outages, port/rail/airport disruption, ATC degraded, financial network interference

MITIGATION STRATEGIES:
- Fusion-led Planning: Integrate OT threat feeds, malware signatures, anomalous traffic, GPS-jamming reports
- OT Environment Hardening: Separate OT from corporate systems; maintain offline backups and reliable generator power
- Vendor Assurance and Continuity: Demand software bill of materials (SBOM) and security attestations
- People and Finance Readiness: Enforce MFA, conduct realistic phishing drills, set clear region-specific operating rules

---

AI AND ENERGY COMPETITION LIKELY TO ELEVATE US-CHINA TENSIONS

EXECUTIVE SUMMARY:
In 2026, companies in China and the US will continue developing increasingly capable, energy-intensive AI systems, driving greater strategic competition between Beijing and Washington. China is pairing renewables with emerging nuclear technologies (SMRs), while the US contends with mounting energy-infrastructure bottlenecks.

KEY JUDGMENTS:
- China is pioneering integrated AI-energy expansion, combining renewables with rapid SMR development to secure scalable, dependable power
- The US will likely face infrastructure and supply constraints that limit AI data center expansion
- Rising global energy competition will lead to both strategic opportunities and associated risks
- As nuclear power increasingly supports AI, resource, supply chain, and regulatory hurdles will intensify US-China competition

SMALL MODULAR REACTORS (SMRs):
Compact, factory-built nuclear reactors (<~300 MW) that can flexibly scale power for AI data centers. They offer stable, carbon-free electricity and can be deployed faster than traditional plants.

China's Linglong One: First globally to pass IAEA comprehensive safety review. Generates 125 MW. Expected to begin operation by 2026.

TIMELINE:
- 2025: China's Linglong One passes IAEA safety review. US and UK sign Atlantic Partnership for Advanced Nuclear Energy agreement
- 2026: Linglong One expected to begin operations; target for US design certifications
- 2027-2029: US fuel supply, factory setups, site prep
- Early 2030s: US SMR assembly, testing, commissioning; first fleets support major data centers

HALEU (High-Assay Low-Enriched Uranium) — U-235 concentration between 5 and 20 percent — critical requirement for advanced SMRs. China's well-established HALEU production infrastructure provides strategic advantage.

====================================================================
AMERICAS
====================================================================

EXECUTIVE SUMMARY:
In 2026, businesses across the Americas will face heightened security risk driven by evolving criminal tactics, major event disruptions, and grievance-driven violence. Latin American organized crime groups will increasingly use drones, AI, and smuggling innovations, expanding beyond drug trafficking into illegal mining and cybercrime. The FIFA World Cup will create operational and reputational challenges through heightened security, protests, and exploitation by Mexican DTOs. In the US, targeted violence by lone actors will rise, threatening prominent corporate leaders, political figures, industries, and infrastructure.

KEY JUDGMENTS:
- Organized crime groups in Latin America will weaponize drones, AI, and new smuggling methods to diversify beyond drug trafficking, escalating risks to corporate security, cyber resilience, and supply chains
- Heightened security, protests, and DTO exploitation will create significant operational and reputational risks for businesses near FIFA World Cup venues in the US, Canada, and Mexico
- In the US, lone actors driven by grievances and polarization will increasingly target corporate and political leaders, industries, and infrastructure, amplifying threats to personnel and assets

LATIN AMERICAN ORGANIZED CRIME — EXPANDING CRIMINAL USE OF DRONES AND AI:
- CJNG (Jalisco Nueva Generación Cartel) maintains a dedicated branch of drone operators
- Colombia: Major armed groups aggressively acquiring commercial drones. August 2025: FARC dissident faction flew drone packed with explosives into a police helicopter during a coca-eradication operation, killing 12 officers
- Brazil: Red Command (CV) and Third Pure Command (TCP) increasingly rely on drones to monitor areas dominated by rival groups
- AI adoption by criminal groups will likely accelerate in 2026: Virtual kidnapping (AI voice synthesis), AI-enabled fraud relating to Brazil's PIX payment system
- Colombia's EGC using deepfake videos featuring fictitious news anchors
- July 2025: Colombian Navy seized unmanned semisubmersible outfitted with Starlink antenna in the Caribbean
- Mercury found in gravel shipment at Port of Callao, Peru destined for Bolivia (4.4 short tons) — smuggled by CJNG to expand illegal gold mining operations

FIFA WORLD CUP 2026:
- 16 host cities across US, Canada, and Mexico. 48 teams, 104 matches (vs 63 in 2025 Club World Cup)
- Security perimeters, road closures, area access restrictions, and intensified screening protocols
- Criminal organizations: In Mexico, DTOs will seek to set up front companies to win vendor contracts
- Activist groups: Pro-Palestinian activists have previously forced cancellation of smaller-scale sporting events in Europe
- Weather risks: Extreme heat (30-38°C) in 13 of 16 host cities between June 11 and July 19, 2025. Lightning protocols (30-minute suspension if strike within 10km). Atlantic hurricane season starts June
- Host cities and max temperatures recorded June 11-July 19, 2025: Dallas 39°C/102°F, Houston 36°C, Atlanta 34.5°C, Miami 36°C, Toronto 30°C, Boston 34.5°C, New York 34°C, Philadelphia 36°C, Kansas City 35°C, San Francisco 33°C, Los Angeles 27.8°C, Seattle 30.7°C, Vancouver 27.3°C, Monterrey 37°C, Guadalajara 30°C, Mexico City 26.8°C

TARGETED VIOLENCE IN THE US:
- US will continue to see increase in targeted attacks by individuals who blame specific companies or people
- Likely targets: Political and media figures, individuals working in finance, healthcare, and technology
- December 2024: Killing of United Healthcare executive prompted social channel overflow with conspiracy narratives
- 2025: Attacks against NFL and CDC; arson at Tesla dealerships by those opposed to Elon Musk's activities with US Government
- Political polarization through 2026 midterm elections will amplify rhetoric
- Property associated with tech industry may be damaged or destroyed due to symbolic value

KEY TREND — SEVERE WEATHER AND FIFA WORLD CUP:
- Extreme weather will have increased influence on 2026 FIFA World Cup
- Only four of 16 stadiums with retractable roofs and climate-controlled capabilities (Atlanta, Dallas, Houston, Vancouver)
- Match kick-off times confirmed only after December draw

====================================================================
EUROPE
====================================================================

EXECUTIVE SUMMARY:
US and European divisions over the enduring Russia-Ukraine conflict will likely deepen in 2026, with Washington favoring secondary measures and episodic diplomacy while Europe advances rolling sanctions. Compliance gaps will present risks for foreign businesses seeking to operate in Russia, where risks of legal complexity, detention, and corruption remain. Countries on the EU's eastern flank will grapple with Russian influence, pressure on populist leaders, and volatile elections.

KEY JUDGMENTS:
- EU Russia policy will fragment, driving policy uncertainty and uneven compliance regimes
- Operating in Russia remains high-risk amid legal obstacles, asset controls, corruption, and detention exposure
- Asset-recovery and re-entry signals will surface, but clashing US/EU/G7 regimes and reputational blowback will deter moves
- Hungary, Serbia, and Georgia remain polarized; Romania and Moldova consolidate pro-EU control

EUROPE-US DIVISIONS OVER RUSSIA-UKRAINE:
- US and European visions of how to end the conflict remain far apart
- Washington open to Ukrainian territorial concessions for peace; European leaders reject land swaps
- Hungary and Slovakia prioritizing national interests; EU finding it increasingly difficult to impose harshest sanctions
- August 2025 Alaska summit: Russian presidential decree enabling ExxonMobil to recover stake in Sakhalin-1 oil and gas project
- Foreign nationals from NATO countries: Elevated potential for arrest and detention
- Some Western firms — especially those with seized stakes — will increasingly seek recovery or limited re-entry in 2026

COUNTRY-SPECIFIC ANALYSIS:

Hungary: April 2026 general election. Viktor Orbán could lose after 15 years. Peter Magyar (Tisza party — Respect and Freedom) main contender. Russia's 2022 invasion of Ukraine exacerbated Budapest-Brussels tensions. Russian cyberspace and online discourse will see increase in misleading narratives. Opposition mobilizations likely through early 2026.

Slovakia: Prime Minister Robert Fico faces growing international isolation. Opposition-led mass rallies continuing through 2026 ahead of general elections scheduled for 2027. Fico criticised for closeness to Putin. Slovakia is only EU/NATO leader to attend 2025 Shanghai Cooperation Organization summit in China.

Serbia: Mass anti-government protests by pro-EU opposition parties will likely destabilize Serbia through 2026. Demonstrators pressing for early elections and President Aleksandar Vucic's resignation. Near-daily rallies in Belgrade. Russian authorities have intervened, claiming protest movement is Western-orchestrated.

Georgia: Relatively EU-skeptic government (Georgian Dream party) consolidating control. Nationwide anti-government protest movement continued through 2025. EU sanctioning senior government figures for alleged corruption and human rights violations.

Romania: Centrist, pro-EU government after Nicusor Dan won presidency on anti-corruption platform (May 2025), defeating first-round leader George Simion (EU-skeptic populist). Constitutional court overturned November 2024 result (Calin Georgescu won first round) citing evidence of Russian-backed interference.

Moldova: Pro-EU forces consolidating institutional control. 2025: Judicial authorities banned pro-Russian Heart of Moldova and Moldova Mare parties for alleged Moscow-backed misconduct. Russia intensifying pressure via disinformation, support for anti-government protest groups.

KEY TREND — AVIATION CYBERSECURITY:
Aviation operates as one of the world's most intricate structural networks, spanning airlines, airports, suppliers, and regulators. September 2025: Attack on check-in and boarding software provider disrupted operations at European airports including London Heathrow, Berlin Brandenburg, Brussels, and Porto.

Cyberattack types and likely impacts:
- DDoS attacks on reservation systems → Passenger disruption, revenue loss, reputational damage
- Ransomware targeting operational IT → Grounding of fleets, flight cancellations, safety risks
- Application compromise in critical systems → Data theft, regulatory penalties
- Signal jamming (GNSS interference) → Flight delays, rerouting costs, increased fuel burn
- Supplier/contractor breaches → Cascade effects across airlines, airports, regulators

MITIGATION: Modernize cyber resilience programs (IT and OT integration), expand joint threat intelligence sharing, invest in workforce development and training, segment IT and OT networks, audit vendor and supplier security practices.

====================================================================
ASIA-PACIFIC
====================================================================

EXECUTIVE SUMMARY:
Sino-American competition and US policy uncertainty are pushing Asia-Pacific governments towards heightened nationalism, protectionism, and rearmament, making brief, localized crises at sea and along disputed borders likely through 2026. Maritime flashpoints in the South China Sea and Taiwan Strait — and sporadic land-border clashes in South and Southeast Asia — will periodically disrupt sea lines of communication (SLOCs), overland routes, and travel.

KEY JUDGMENTS:
- Tensions will persist between Taipei and Beijing, falling short of direct confrontation, as Beijing prioritizes non-military tactics
- Security incidents and close calls will occur around temporary SLOCs and along busy airline corridors where ongoing regional arms buildup raises risk of miscalculation
- Unresolved territorial disputes, particularly in South and Southeast Asia, will likely cause intermittent border closures and cargo/travel delays
- Rising global trade competition and nationalism will likely fuel unrest in already unstable states

SOUTH CHINA SEA:
- China's maritime assertiveness will continue due to strategic proximity, importance, and commercial value of SLOCs
- Hotspots around Scarborough Shoal and the Spratly Islands remain most vulnerable
- Defense spending across Asia rising, driven by US policy uncertainty, regional threat perceptions, and capabilities races
- Washington called on key partners to raise defense spending to 5% of GDP (Japan, South Korea, and Taiwan)

TAIWAN STRAIT:
- Tensions persist between Taipei and Beijing; direct confrontation unlikely
- Beijing employing "three warfares" strategy: Economic pressure, influence operations, and legal measures for peaceful reunification
- Taiwan strengthening military deterrence: US naval systems, F-16 aircraft upgrades, drone/anti-drone capabilities
- Even a brief standoff could close vital airspace or sea lanes, causing weeks of disruption across supply chains

BORDER DISPUTES:

India-Pakistan: Periodic Line of Control (LoC) flare-ups will worsen already severely limited bilateral trade and transit routes. India's May 2025 political decision to eliminate distinctions between non-state actors and their state sponsors raises prospect of broader retaliation. India withdrew from Indus River Water Treaty, heightening water-security concerns.

Afghanistan-Pakistan: Durand Line remains high-risk zone for cargo transport and cross-border operations through 2026. Mass-casualty attacks in major Pakistani cities by TTP. Bilateral trade reduced from USD 2.5 billion to USD 1 billion in 2025 (border closures).

Thailand-Cambodia: July 2025 border clashes around disputed temple areas caused dozens of casualties and displaced 300,000 people. Sporadic border skirmishes persist, flare-up risks along the border remain high.

TRADE COMPETITION AND RISING NATIONALISM:
- US-China trade competition key manifestation of broader geopolitical rivalry
- Changes to raw material export restrictions (e.g., between Australia and the US) demonstrate critical resources being used as strategic tools
- China's revised data protection laws effective January 1, 2026: Stricter cross-border data transfer reviews, localization obligations, executive liability
- Nationalism coinciding with small-scale targeted violence in Japan (lone attackers targeting Japanese nationals in China) and South Korea (anti-Chinese incidents)

KEY COUNTRY RISKS:
- Bangladesh: Interim government's 2025 ban of Awami League under terrorism legislation. Risk of minority discrimination and impactful unrest. Islamist parties mobilizing ahead of mid-February 2026 elections.
- Indonesia: Violent protests over lawmakers' perks. President Prabowo broadening military's roles in civilian affairs. August 2026 deadline set by student groups for institutional reforms.
- Myanmar: Delayed elections (slated December 2025-early 2026) unlikely to deliver stability. Risk of further conflict.
- Thailand: March 2026 general election. Declining support for traditionally powerful parties. Nationalist sentiment and fragmented coalitions likely to delay government formation.

====================================================================
MIDDLE EAST & NORTH AFRICA
====================================================================

EXECUTIVE SUMMARY:
In 2026, the Middle East's security environment will be shaped by the enduring consequences of the Israel-Hamas conflict. A US-brokered ceasefire has reduced large-scale fighting but remains fragile as Israeli-Palestinian tensions and rivalries among Arab states persist. The prior grey-zone equilibrium has been disrupted, weighing on travel, supply chains, and operational resilience.

KEY JUDGMENTS:
- The Israel-Hamas conflict and Iran-Israel balancing act will continue to influence the region's geopolitical and security landscape
- Further direct Iran-Israel conflict will cause recurring travel, supply chain, and business disruption
- Failure to secure peace in Gaza will likely deepen Israel's diplomatic isolation and spur protests and boycotts
- North Africa, though less affected, is likely to remain unstable and more autocratic

PERSISTING ISRAEL-HAMAS CONFLICT:
- Israel relying on US-backed Gaza Reconstruction, Economic Acceleration and Transformation (GREAT) plan — requires departure of a quarter of Gaza's population
- September 2025: UN General Assembly — dozens of Western governments including Australia, Canada, France, and the UK — officially recognized Palestine
- UN General Assembly backed French-Saudi proposal envisioning a permanent ceasefire and the release of all hostages
- November 18: UN Security Council passed US-drafted resolution supporting Trump's peace plan for Gaza (implies eventual independent Palestinian state but gives no timeline or guarantees)
- Israel's isolation growing: More countries could recognize Palestine in 2026. Spain cancelled USD 825 million arms deal. Türkiye declared Israel a "terror state," cutting off direct trade ties (May 2024) and closing airspace to Israeli aircraft (August 2025). European Commission proposed unprecedented measures including suspending trade concessions.

IRAN-ISRAEL BALANCING ACT — THREE SCENARIOS:
1. Direct War Resumes: Highly Destabilizing (Moderate Likelihood). Another direct war would follow similar trajectory to June 2025 12-day war. Would upend energy markets, disrupt maritime routes, and severely undermine efforts to stabilize regional economies. Iran rebuilding nuclear and military capabilities under sanctions.
2. New Nuclear Agreement: More Stable (Low Likelihood). New deal would create more stable environment in 2026. However, trust remains a major obstacle.
3. Grey-Zone Status Quo: Ongoing Instability (Most Likely). Iran and Israel resume grey-zone conflict, relying on proxies, cyber tactics, and covert operations to destabilize each other. Violence cyclical and intense but stopping short of full-scale war.

JUNE 2025: 12-day war between Israel and Iran marked a major escalation in their long-standing rivalry. Iran's June strike on Qatar jeopardized the Gulf's safe-haven perception and shaking investor confidence.

REGIONAL ACTORS:
- Lebanon 2026: Year likely a turning point for Hizballah's influence. UNIFIL plans to depart after 48 years. Lebanese Armed Forces must replace it.
- Syria 2026: Interim President Ahmed Al Sharaa's new government must prove ability to unify and control territory divided along communal lines.
- Iraq: Shi'a militias continuing to destabilize neighboring states.
- Yemen: Al-Houthis continuing to destabilize neighboring states.
- Gulf States: Iran-Israel hostility posing substantial risk to economic growth. Conflict once implausible now appears real for Gulf stability and critical infrastructure.

NORTH AFRICA:
- Algeria, Egypt, Tunisia: Intensifying crackdowns on opposition figures, stoking civil unrest, leaning toward autocratic governance
- Libya: Deeply divided with rival governments and numerous militias competing for control. Kidnapping for ransom remains severe threat. Rising interest in oil sector but significant challenges for investors.

KEY TREND — MARITIME: TRADE POLICY TO DISRUPT SHIPPING THROUGH 2026:
Intensifying geostrategic competition will have significant impacts on maritime trade and security. Tariffs and fees aimed at promoting domestic production and shipbuilding will particularly affect trade routes between China and the Americas.

Tariff impact: US frequently threatening, imposing, retracting, and reinstating tariffs since January 2025. Cargo redirected to alternative ports. Congests secondary hubs, lengthens delivery times, and raises tariff-evasion risks.

Iran's escalation risks: Maritime harassment and tit-for-tat tanker seizures most likely outcomes. Iran could employ limpet mines in the Persian Gulf or UAV strikes in the Arabian Sea.

Russia's shadow fleet: More than 1,000 poorly maintained, under-insured tankers. Heightens environmental and safety risks, particularly in Bosphorus Strait and Baltic Sea. Moscow also accused of using shadow-fleet tankers to conduct intelligence gathering and disruptive activities against NATO-linked infrastructure.

Chokepoints at risk: Strait of Hormuz, Black Sea, Baltic Sea.

MITIGATION: Embed intelligence-led triggers, flexible contracts, layered protection into day-to-day planning. Secure contracts with two alternative ports and inland routes. Maintain financial reserve and automatic route insurance.

====================================================================
SUB-SAHARAN AFRICA
====================================================================

EXECUTIVE SUMMARY:
Over the coming year, the US shift to a more transactional, security-driven approach, coupled with further scaling back of Western engagement, will push Sub-Saharan African governments toward China and non-traditional partners. In this fluid, multipolar landscape, opportunistic African leaders will exercise greater agency through calculated domestic and cross-border power grabs, often at the expense of traditional governance norms.

KEY JUDGMENTS:
- US' transactional approach and reduction in aid expenditure are pushing governments toward China and non-traditional partners, likely raising risk of destabilization and conflict
- Foreign investment offers short-term relief but will erode governance standards and stability
- Several African governments are exercising greater strategic agency
- AI-generated content on social platforms will expand, reshaping sentiment
- Criminal syndicates will escalate deepfake-enabled scams and fraud; businesses and travelers face higher financial and reputational risk

COMPETING FOR INFLUENCE:
- China: Resource-tied loans and state-led development model. 2024 Forum on China-Africa Cooperation commitments. 9-percent average investment growth through 2027, with FDI up by 10 percent in 2026. Projects in Nigeria's rail, Congo's green-energy initiatives fill US funding gaps. Development model will further expand in Ghana and Angola in 2026.
- Russia: Security and information operations supporting Sahel juntas. In Mali and Burkina Faso, Moscow supplies arms, military contractors, and anti-imperialist narratives. By mid-2026, influence will likely extend to Niger.
- Türkiye: 2025 initiatives (Somali port upgrades, oil exploration) marked 15% investment growth, trade projected to rise 8% and investments 20% through 2027. Turkish trainers strengthening Somali forces against al-Shabaab.
- UAE: Maritime and conflict-driven investments tightening control of strategic corridors. UAE port projects in Angola, Somaliland, and across Horn projected to rise 20 percent in 2026. Alleged involvement in Sudan's civil war — alleged arms to RSF per UN reporting, has fractured governance.
- Qatar: Targeted investments reshaping East African politics. Commitments in mining and infrastructure projected to grow 11 percent through 2030. Support for Islamist-leaning groups in Rwanda.
- Red Sea flashpoints: Ethiopia's push for access to Eritrea's Assab port will likely escalate tensions by mid-2026. Russia's planned naval hub in Sudan backed by 25-percent increase.
- Minerals (DRC and beyond): China's cobalt lead faces growing competition from UAE and Türkiye. UAE mining investments up 20 percent. Turkish energy projects up 15 percent.

KEY RISKS FOR BUSINESSES:
- Fiscal stress: Budget shortfalls drove Nigeria's 2025 fuel protests, Kenya's teachers' strikes, and Uganda's hospital shortages. Expect fresh demonstrations across urban centers.
- Resource disputes: Tensions over mining rights in Zambia and Congo; access to Assab port (Ethiopia)
- Jihadist threats: Al-Shabaab and Boko Haram/ISWAP expanding in Horn and Lake Chad regions
- Maritime exposure: Somalia's 2025 piracy surge raising Red Sea and East Africa-Suez route risks
- Proxy conflicts: UAE involvement in Sudan will exacerbate grievances and complicate evacuation and overland routing plans

AI DISINFORMATION AND CRIME IN SUB-SAHARAN AFRICA:
- Pan-Africanist-aligned social accounts running extensive campaigns supporting Burkina Faso's President Ibrahim Traoré. Hundreds of deepfakes and fabricated speeches surging May 2025.
- South Africa: 1,200% increase in deepfake manipulation in 2025 (TransUnion). Kenya and Nigeria also saw significant increases.
- Criminal groups increasingly using deepfakes and AI tools: Fraudulent insurance claims, fake storefronts, AI voices impersonating bank staff, deepfake videos of politicians falsely endorsing products.
- 2026 election risk: Benin, Uganda, Republic of Congo, Zambia, South Sudan — AI-enabled disinformation expected to spike.
- Sahel pro-Traoré narratives: Anti-French sentiment, erosion of ECOWAS cohesion, jihadist expansion.

RECOMMENDATIONS:
- Awareness and training: Understand current scam patterns and deepfake risks during verification
- Monitoring and response: Stand up online threat monitoring and crisis-communications playbooks
- Exposure is broad: Assume criminals will target indiscriminately
- Trusted intelligence: Maintain access to reliable reporting on active disinformation/fraud campaigns
- Elections and unrest: Expect AI-enabled disinformation to spike during political tension
- Sahel exposure management: Limit activity to short-duration projects under explicit government or international mission security coordination

====================================================================
GLOBAL HEALTH
====================================================================

MISINFORMATION AND DISINFORMATION POSE A SIGNIFICANT THREAT TO GLOBAL HEALTH

EXECUTIVE SUMMARY:
Health-related misinformation and disinformation will remain one of the most pressing challenges to global health security. False narratives — particularly around vaccines — undermine trust in institutions, weaken immunization programs, and erode pandemic preparedness.

KEY JUDGMENTS:
- False and misleading health information will continue to undermine public trust, fueling systemic vulnerabilities
- Vaccine hesitancy, sustained by false narratives, will contribute to stagnant or declining immunization coverage and recurring outbreaks of preventable diseases
- Organizations that invest in transparent communication, evidence-based policies, and partnerships with trusted providers will be better positioned to manage misinformation risks
- Pandemic preparedness will weaken as eroded trust undermines compliance with emergency measures and slows rapid response

THREAT LANDSCAPE:
- Health-related misinformation and disinformation will continue to threaten global health systems
- Vaccine hesitancy shaped by "3 Cs": Complacency (false sense of security from past immunization success), Confidence (trust in vaccines/institutions undermined by misinformation), Convenience (barriers such as access, affordability, and clear communication)
- In 2024, over 14 million children worldwide estimated to have missed their first dose of DTP1 vaccine by end of first year of life
- Major measles outbreaks in 2023 and 2025, including setbacks in regions that had previously controlled the disease

CONSEQUENCES: Erosion of confidence fuels resistance to public health measures, leading to vaccine refusal, reliance on alternative medicine, and disregard for professional guidance. Existing inequities expected to deepen as communities with limited access to healthcare and reliable information remain vulnerable.

GLOBAL HEALTH SECURITY — CONSISTENT STANDARDS OF MEDICAL CARE ACROSS BORDERS:
Crisis24 Medical Director Craig Stark, MD, FACP: Medical governance model ensures evidence-based consistency across global healthcare systems. Pre-travel medical guidance is a core part of Crisis24's care model. Medical teams work closely with operations and security teams to ensure that clinical insights translate into timely and coordinated action.

REAL-WORLD EXAMPLES:
- Traveler sustained dog bite in rural area treated at local clinic. Crisis24 reviewed case — plan did not meet international standards for rabies post-exposure care. Team coordinated move to nearby country where vaccine and RIG were available.
- University faculty member in Addis Ababa, Ethiopia, developed pneumonia with complications requiring intensive monitoring. Crisis24 maintained daily contact with treating team for nearly two weeks.

====================================================================
THE EXPERTS' TAKE
====================================================================

AI AND SECURITY: REIMAGINING GLOBAL RISK MANAGEMENT
(Crisis24 VPs Cathy Gill, Product Management and Chris Hurst, AI and Innovation)

Key insights:
- Nearly two-thirds of security leaders believe we have entered a new post-COVID inflection point
- Crisis24 Horizon: Unified platform detecting approximately 20,000 candidate incidents daily
- "Ask Horizon" assistant: Conversational AI for proactive risk management and crisis response
- Latest Event Synopsis: AI-generated summary of all alerts in a location in one brief
- Framework: "Human in the loop" (HITL) and "human on the loop" (HOTL) firmly in place for critical decisions
- Evolution path: "Agentic assistants" → "human-agent teams" → "human-led, agent orchestrated"
- Responsible AI: Transparency, accountability, and human agency, with clear audit trails
- Goal: Enable predictive risk modeling that anticipates vulnerabilities before they manifest
- Humans remain central: AI excels at "what" and "when," while humans provide the "why" and own the decision of what action to take

NAVIGATING TOMORROW'S CYBER THREATS: AI, LAYERED SECURITY, AND PROACTIVE DEFENSE
(Crisis24 Director of Cybersecurity Ghonche Alavi and Senior Consultant Ante Batović, PhD)

Key insights:
- AI has fundamentally changed threat actor operations. Voice and video can now be convincingly impersonated.
- Family offices concerned about two-factor authentication for large transfers
- Over-reliance on technology and neglecting organizational culture are major blind spots
- Supply chain vulnerabilities: Companies often lack visibility into vendor cyber resilience
- Layered security: Executive protection, privacy programs, and digital footprint management combined
- Recent UK Jaguar Land Rover (JLR) incident: Even large organizations can be crippled if unprepared. Unsophisticated actors using ransomware-as-a-service can inflict massive damage.
- Insider threats: AI analyzing behaviors and patterns across large populations
- Crypto executives: LinkedIn profiles, podcasts, social media revealing holdings creates prime targets
- Holistic approach: Not just technical side; structure, governance, and enterprise risk management ensuring cyber fits into the broader risk picture

REDEFINING INTELLIGENCE FOR THE C-SUITE AND BOARDS (Crisis24 AiiA Powered by Palantir)
(Geoffrey Hills, Managing Director and Ansel Stein, VP Operations)

Key insights:
- AiiA: Designed to close gap between operational intelligence and C-suite/board-level strategic clarity
- Pulls structured and unstructured data from public sources worldwide
- "President's Brief": Every morning, C-level executives receive AI-generated briefing tailored to their organization's priorities. Format modeled after intelligence briefings provided to heads-of-state.
- Intelligence Priority Framework built from each client's public corporate documents
- Different prioritized insights for CFO vs. Chief Supply Chain Officer vs. Chief Security Officer
- Trust-by-design: Every insight auditable with complete source citations and provenance. Only public sources — no proprietary client data ingested.
- "AiiA shifts the conversation from reactive risk management to proactive opportunity identification"
- Partnership with Palantir provides AI infrastructure, while Crisis24 provides intelligence selection, integration, and operational oversight
- Expanding capabilities: Global supply chain monitoring, commodity risk analysis, food and critical infrastructure sectors

====================================================================
RISK ASSESSMENT RATINGS
====================================================================

Crisis24's country-specific security and risk rating maps provide informed indicators of security conditions for a high-level understanding of a country's threat profile. Each country rated on a scale from 1–5:
1 - Minimal
2 - Low
3 - Moderate
4 - High
5 - Extreme

The 2026 Global Risk Forecast includes eight risk assessment maps: an overall security and risk rating map, specialized category maps, and a master map reflecting the overall country rating with high and/or severe specialized threats specific to each country.

Download maps: https://bit.ly/GRF26maps

====================================================================
ABOUT CRISIS24
====================================================================

Crisis24, a global, AI-enhanced provider of travel risk management, mass communications, critical event management, crisis-security consulting, personal protection solutions and global medical concierge capabilities, allows prominent organizations, disruptive brands and influential people to operate with confidence in an uncertain world. Backed by proprietary AI-enabled SaaS technologies, advanced Global Operations Centers, and the largest team of private sector intelligence analysts in the world, Crisis24 delivers localized insights and global perspectives alongside medical, security, crisis response and consultancy services as a preferred partner for Fortune 500 corporations.

© 2026 GardaWorld. All rights reserved.
`

async function generateSummary(content) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: 'You are a security intelligence analyst. Summarise the following document in 2-3 sentences for use as a search preview. Be specific and factual.',
    messages: [{ role: 'user', content: content.slice(0, 6000) }],
  })
  return message.content[0].text
}

async function getAdminUserId() {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'developer'])
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function main() {
  console.log('Looking up admin user...')
  const createdBy = await getAdminUserId()
  if (!createdBy) {
    console.error('❌  No admin/developer user found in profiles table')
    process.exit(1)
  }
  console.log('Admin user:', createdBy)

  console.log('Generating summary via Claude...')
  const summary = await generateSummary(CONTENT)
  console.log('Summary:', summary)

  // Check if already uploaded
  const { data: existing } = await supabase
    .from('cairo_knowledge')
    .select('id')
    .eq('source_file', 'Crisis24_GRF2026_Report_DIGITAL.pdf')
    .maybeSingle()

  if (existing) {
    console.log('⚠️  Already uploaded (id:', existing.id, '). Delete it first if you want to re-upload.')
    process.exit(0)
  }

  console.log('Inserting into cairo_knowledge...')
  const { data, error } = await supabase
    .from('cairo_knowledge')
    .insert({
      title:             'Crisis24 Global Risk Forecast 2026',
      type:              'report',
      content:           CONTENT.trim(),
      summary,
      source_file:       'Crisis24_GRF2026_Report_DIGITAL.pdf',
      countries:         [],
      regions:           ['Global', 'Middle East', 'Africa', 'Asia-Pacific', 'Europe', 'Americas', 'Sub-Saharan Africa', 'North Africa'],
      threat_categories: ['Geopolitical', 'Terrorism', 'Cybersecurity', 'Crime', 'Natural Disaster', 'Health', 'Maritime', 'Aviation', 'AI & Technology'],
      tags:              ['crisis24', 'grf2026', 'annual-forecast', '2026', 'global-risk', 'gardaworld'],
      org_id:            null,
      created_by:        createdBy,
    })
    .select('id, title, summary')
    .single()

  if (error) {
    console.error('❌  Insert failed:', error.message)
    process.exit(1)
  }

  console.log('✅  Uploaded to CAIRO knowledge base!')
  console.log('   ID:', data.id)
  console.log('   Title:', data.title)
  console.log('   Summary:', data.summary)
}

main().catch(err => { console.error(err); process.exit(1) })
