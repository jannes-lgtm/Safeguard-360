// Country-specific police / crime intelligence registry
// Routes to the best available source per country
// Where no live API exists, provides official source links + ACLED fallback

const REGISTRY = {
  'south africa': {
    country: 'South Africa',
    agency: 'SAPS — South African Police Service',
    dataType: 'Quarterly crime statistics by station and category',
    updateFrequency: 'Quarterly',
    liveApi: false,
    categories: [
      'Murder', 'Sexual Offences', 'Assault GBH', 'Common Assault',
      'Aggravated Robbery', 'Common Robbery', 'Carjacking',
      'Residential Burglary', 'Business Burglary', 'Theft of Motor Vehicle',
      'Drug-related Crime',
    ],
    highRiskAreas: [
      { area: 'Cape Flats, Western Cape', risk: 'Critical', note: 'Highest murder rate nationally — gang violence' },
      { area: 'Khayelitsha, Western Cape', risk: 'Critical', note: 'Extreme violent crime' },
      { area: 'Johannesburg CBD', risk: 'High', note: 'High robbery and assault' },
      { area: 'Durban Central, KZN', risk: 'High', note: 'Elevated violent crime' },
      { area: 'Pietermaritzburg, KZN', risk: 'High', note: 'High murder and robbery' },
      { area: 'East London, Eastern Cape', risk: 'High', note: 'Elevated contact crime' },
      { area: 'Sandton / Rosebank', risk: 'Medium', note: 'Smash-and-grab, vehicle theft' },
      { area: 'Pretoria CBD', risk: 'Medium', note: 'Business burglary, vehicle crime' },
    ],
    latestPeriod: 'April 2023 – March 2024',
    sourceUrl: 'https://www.saps.gov.za/services/crimestats.php',
    acledCoverage: true,
  },
  'kenya': {
    country: 'Kenya',
    agency: 'National Police Service Kenya',
    dataType: 'Annual crime statistics — limited public release',
    updateFrequency: 'Annual (irregular)',
    liveApi: false,
    categories: ['Robbery', 'Assault', 'Burglary', 'Vehicle Theft', 'Fraud', 'Drug Offences'],
    highRiskAreas: [
      { area: 'Nairobi CBD / River Road', risk: 'High', note: 'Pickpocketing, mugging, robbery' },
      { area: 'Mombasa Old Town', risk: 'High', note: 'Petty crime and robbery' },
      { area: 'Eastleigh, Nairobi', risk: 'Critical', note: 'Al-Shabaab activity, carjacking' },
      { area: 'Westlands / Karen', risk: 'Medium', note: 'Residential burglary, vehicle crime' },
      { area: 'Lamu County', risk: 'High', note: 'Insurgent activity near Somalia border' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.npscommunication.go.ke',
    acledCoverage: true,
  },
  'nigeria': {
    country: 'Nigeria',
    agency: 'Nigeria Police Force (NPF)',
    dataType: 'Limited public statistics — ACLED is primary source',
    updateFrequency: 'Irregular',
    liveApi: false,
    categories: ['Armed Robbery', 'Kidnapping', 'Banditry', 'Cybercrime', 'Terrorism'],
    highRiskAreas: [
      { area: 'Lagos Island / Apapa', risk: 'High', note: 'Armed robbery, traffic crime' },
      { area: 'North West (Zamfara, Katsina, Sokoto)', risk: 'Critical', note: 'Banditry, mass kidnappings' },
      { area: 'North East (Borno, Yobe, Adamawa)', risk: 'Critical', note: 'Boko Haram / ISWAP activity' },
      { area: 'South East (Imo, Anambra)', risk: 'High', note: 'IPOB-linked violence, sit-at-home' },
      { area: 'Niger Delta', risk: 'High', note: 'Militant activity, oil bunkering' },
      { area: 'Abuja FCT', risk: 'Medium', note: 'Kidnapping on outskirts, petty crime in centre' },
    ],
    latestPeriod: '2023 (ACLED)',
    sourceUrl: 'https://www.npf.gov.ng',
    acledCoverage: true,
  },
  'ghana': {
    country: 'Ghana',
    agency: 'Ghana Police Service (GPS)',
    dataType: 'Annual crime report',
    updateFrequency: 'Annual',
    liveApi: false,
    categories: ['Theft', 'Robbery', 'Deception/Fraud', 'Assault', 'Cybercrime'],
    highRiskAreas: [
      { area: 'Accra CBD / Jamestown', risk: 'Medium', note: 'Pickpocketing, petty theft' },
      { area: 'Accra Suburbs (Tema)', risk: 'Medium', note: 'Burglary, vehicle crime' },
      { area: 'Kumasi Central Market', risk: 'Medium', note: 'Pickpocketing, bag-snatching' },
      { area: 'Northern Region', risk: 'Low-Medium', note: 'Chieftaincy conflicts' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.police.gov.gh',
    acledCoverage: true,
  },
  'tanzania': {
    country: 'Tanzania',
    agency: 'Tanzania Police Force',
    dataType: 'Limited public statistics',
    updateFrequency: 'Irregular',
    liveApi: false,
    categories: ['Robbery', 'Burglary', 'Vehicle Theft', 'Assault'],
    highRiskAreas: [
      { area: 'Dar es Salaam CBD', risk: 'Medium', note: 'Pickpocketing, mugging after dark' },
      { area: 'Zanzibar Stone Town', risk: 'Medium', note: 'Petty theft, occasional assault' },
      { area: 'Mwanza', risk: 'Medium', note: 'Petty crime around lake port area' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.polisi.go.tz',
    acledCoverage: true,
  },
  'zambia': {
    country: 'Zambia',
    agency: 'Zambia Police Service',
    dataType: 'Annual crime statistics',
    updateFrequency: 'Annual',
    liveApi: false,
    categories: ['Theft', 'Burglary', 'Robbery', 'Assault', 'Vehicle Theft'],
    highRiskAreas: [
      { area: 'Lusaka CBD', risk: 'Medium', note: 'Bag-snatching, pickpocketing' },
      { area: 'Copperbelt (Ndola, Kitwe)', risk: 'Medium', note: 'Vehicle and property crime' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.zambiapolice.gov.zm',
    acledCoverage: true,
  },
  'mozambique': {
    country: 'Mozambique',
    agency: 'Polícia da República de Moçambique (PRM)',
    dataType: 'Very limited public data — ACLED primary source',
    updateFrequency: 'Irregular',
    liveApi: false,
    categories: ['Armed Robbery', 'Terrorism', 'Kidnapping', 'Vehicle Crime'],
    highRiskAreas: [
      { area: 'Cabo Delgado Province', risk: 'Critical', note: 'Active Islamist insurgency (ASWJ)' },
      { area: 'Maputo CBD', risk: 'Medium', note: 'Mugging, vehicle crime' },
      { area: 'Beira', risk: 'Medium', note: 'Petty crime, post-cyclone instability' },
    ],
    latestPeriod: '2023 (ACLED)',
    sourceUrl: 'https://www.mint.gov.mz',
    acledCoverage: true,
  },
  'botswana': {
    country: 'Botswana',
    agency: 'Botswana Police Service (BPS)',
    dataType: 'Annual crime report',
    updateFrequency: 'Annual',
    liveApi: false,
    categories: ['Theft', 'Burglary', 'Assault', 'Fraud'],
    highRiskAreas: [
      { area: 'Gaborone CBD', risk: 'Low', note: 'Generally safe, petty theft at markets' },
      { area: 'Kasane (tourism area)', risk: 'Low', note: 'Wildlife-related incidents, petty theft' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.bps.gov.bw',
    acledCoverage: true,
  },
  'zimbabwe': {
    country: 'Zimbabwe',
    agency: 'Zimbabwe Republic Police (ZRP)',
    dataType: 'Limited public statistics',
    updateFrequency: 'Irregular',
    liveApi: false,
    categories: ['Robbery', 'Vehicle Theft', 'Assault', 'Fraud'],
    highRiskAreas: [
      { area: 'Harare CBD', risk: 'Medium', note: 'Mugging, scams targeting tourists/business visitors' },
      { area: 'Bulawayo', risk: 'Medium', note: 'Petty crime' },
      { area: 'Border crossings (Beitbridge)', risk: 'High', note: 'Smuggling, corruption, violent crime' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.zrp.gov.zw',
    acledCoverage: true,
  },
  'uganda': {
    country: 'Uganda',
    agency: 'Uganda Police Force (UPF)',
    dataType: 'Annual crime report — publicly available',
    updateFrequency: 'Annual',
    liveApi: false,
    categories: ['Theft', 'Robbery', 'Assault', 'Sexual Offences', 'Fraud'],
    highRiskAreas: [
      { area: 'Kampala CBD', risk: 'Medium', note: 'Boda-boda crime, pickpocketing' },
      { area: 'Karamoja Region', risk: 'High', note: 'Armed cattle raiding, inter-clan violence' },
    ],
    latestPeriod: '2022',
    sourceUrl: 'https://www.upf.go.ug',
    acledCoverage: true,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { country } = req.query

  if (!country) {
    // Return list of all covered countries
    return res.json({
      countries: Object.values(REGISTRY).map(c => ({
        country: c.country,
        agency: c.agency,
        acledCoverage: c.acledCoverage,
        liveApi: c.liveApi,
        sourceUrl: c.sourceUrl,
      })),
      total: Object.keys(REGISTRY).length,
    })
  }

  const key = country.toLowerCase().trim()
  const data = REGISTRY[key]

  if (!data) {
    return res.json({
      country,
      found: false,
      message: 'No local police data registry for this country. ACLED coverage available for most African nations.',
      acledFallback: true,
      sourceUrl: `https://acleddata.com`,
    })
  }

  return res.json({ ...data, found: true })
}
