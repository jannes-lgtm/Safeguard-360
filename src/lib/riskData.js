/**
 * src/lib/riskData.js
 * Shared country risk dataset — used by CountryRiskReport and GSOC WatchBoard.
 * Base risk levels are static defaults; live data from AI briefings can override.
 */

export const RISK_MAP = {
  // ── Critical ────────────────────────────────────────────────────────────────
  'Somalia':                       { lat: 2.0469,   lon: 45.3182,  risk: 'Critical', region: 'Africa'       },
  'South Sudan':                   { lat: 4.8594,   lon: 31.5713,  risk: 'Critical', region: 'Africa'       },
  'Sudan':                         { lat: 15.5007,  lon: 32.5599,  risk: 'Critical', region: 'Africa'       },
  'Libya':                         { lat: 32.9020,  lon: 13.1800,  risk: 'Critical', region: 'Africa'       },
  'Syria':                         { lat: 33.5102,  lon: 36.2913,  risk: 'Critical', region: 'Middle East'  },
  'Yemen':                         { lat: 15.3694,  lon: 44.1910,  risk: 'Critical', region: 'Middle East'  },
  'Iraq':                          { lat: 33.3152,  lon: 44.3661,  risk: 'Critical', region: 'Middle East'  },
  'Afghanistan':                   { lat: 34.5553,  lon: 69.2075,  risk: 'Critical', region: 'Asia'         },
  'Democratic Republic of Congo':  { lat: -4.3217,  lon: 15.3222,  risk: 'Critical', region: 'Africa'       },
  'Mali':                          { lat: 12.3714,  lon: -8.0000,  risk: 'Critical', region: 'Africa'       },  // FCDO: advise against all travel
  'Niger':                         { lat: 13.5137,  lon: 2.1098,   risk: 'Critical', region: 'Africa'       },  // FCDO: advise against all travel
  'Burkina Faso':                  { lat: 12.3647,  lon: -1.5354,  risk: 'Critical', region: 'Africa'       },  // FCDO: advise against all travel
  'Central African Republic':      { lat: 4.3947,   lon: 18.5582,  risk: 'Critical', region: 'Africa'       },  // FCDO: advise against all travel
  'Myanmar':                       { lat: 19.7633,  lon: 96.0785,  risk: 'Critical', region: 'Asia'         },  // FCDO: advise against all travel — active civil war
  'Haiti':                         { lat: 18.5944,  lon: -72.3074, risk: 'Critical', region: 'Americas'     },  // FCDO: advise against all travel — gang state collapse
  'Ukraine':                       { lat: 50.4501,  lon: 30.5234,  risk: 'Critical', region: 'Europe'       },  // FCDO: advise against all travel — active war
  'Russia':                        { lat: 55.7558,  lon: 37.6173,  risk: 'Critical', region: 'Europe'       },  // FCDO: advise against all travel
  'Iran':                          { lat: 35.6892,  lon: 51.3890,  risk: 'Critical', region: 'Middle East'  },  // FCDO: advise against all travel

  // ── High ────────────────────────────────────────────────────────────────────
  'Nigeria':                       { lat: 9.0765,   lon: 7.3986,   risk: 'High',     region: 'Africa'       },
  'Chad':                          { lat: 12.1348,  lon: 15.0557,  risk: 'High',     region: 'Africa'       },
  'Ethiopia':                      { lat: 9.0320,   lon: 38.7469,  risk: 'High',     region: 'Africa'       },
  'Mozambique':                    { lat: -25.9692, lon: 32.5732,  risk: 'High',     region: 'Africa'       },
  'Eritrea':                       { lat: 15.3228,  lon: 38.9251,  risk: 'High',     region: 'Africa'       },
  'Burundi':                       { lat: -3.3869,  lon: 29.9102,  risk: 'High',     region: 'Africa'       },
  'Guinea-Bissau':                 { lat: 11.8037,  lon: -15.1804, risk: 'High',     region: 'Africa'       },
  'Guinea':                        { lat: 9.6412,   lon: -13.5784, risk: 'Medium',   region: 'Africa'       },  // military junta but FCDO Level 1 — CAIRO assesses live
  'Cameroon':                      { lat: 3.8480,   lon: 11.5021,  risk: 'High',     region: 'Africa'       },  // Anglophone crisis + Boko Haram north
  'Togo':                          { lat: 6.1375,   lon: 1.2124,   risk: 'High',     region: 'Africa'       },  // Sahel insurgency spreading south
  'Benin':                         { lat: 6.3676,   lon: 2.4252,   risk: 'High',     region: 'Africa'       },  // Sahel insurgency spreading south
  'Gabon':                         { lat: -0.8037,  lon: 11.6094,  risk: 'High',     region: 'Africa'       },  // post-coup instability
  'Lebanon':                       { lat: 33.8886,  lon: 35.4955,  risk: 'High',     region: 'Middle East'  },
  'Israel':                        { lat: 31.7683,  lon: 35.2137,  risk: 'High',     region: 'Middle East'  },
  'West Bank':                     { lat: 31.9522,  lon: 35.2332,  risk: 'High',     region: 'Middle East'  },
  'Pakistan':                      { lat: 33.6844,  lon: 73.0479,  risk: 'High',     region: 'Asia'         },
  'Honduras':                      { lat: 14.0723,  lon: -87.2062, risk: 'High',     region: 'Americas'     },
  'Guatemala':                     { lat: 14.6349,  lon: -90.5069, risk: 'High',     region: 'Americas'     },
  'Ecuador':                       { lat: -0.1807,  lon: -78.4678, risk: 'High',     region: 'Americas'     },
  'Nicaragua':                     { lat: 12.1328,  lon: -86.2976, risk: 'High',     region: 'Americas'     },
  'Jamaica':                       { lat: 17.9927,  lon: -76.7936, risk: 'High',     region: 'Americas'     },
  'Venezuela':                     { lat: 10.4806,  lon: -66.9036, risk: 'High',     region: 'Americas'     },  // FCDO Level 3+, state collapse indicators
  'Colombia':                      { lat: 4.7110,   lon: -74.0721, risk: 'High',     region: 'Americas'     },  // FCDO Level 3 for significant areas
  'Mexico':                        { lat: 19.4326,  lon: -99.1332, risk: 'High',     region: 'Americas'     },  // FCDO Level 3/4 for multiple states

  // ── Medium ──────────────────────────────────────────────────────────────────
  'Kenya':                         { lat: -1.2921,  lon: 36.8219,  risk: 'Medium',   region: 'Africa'       },
  'Uganda':                        { lat: 0.3476,   lon: 32.5825,  risk: 'Medium',   region: 'Africa'       },
  'Tanzania':                      { lat: -6.1722,  lon: 35.7395,  risk: 'Medium',   region: 'Africa'       },
  'Zimbabwe':                      { lat: -17.8292, lon: 31.0522,  risk: 'Medium',   region: 'Africa'       },
  'Zambia':                        { lat: -15.4167, lon: 28.2833,  risk: 'Medium',   region: 'Africa'       },
  'Egypt':                         { lat: 30.0444,  lon: 31.2357,  risk: 'Medium',   region: 'Africa'       },
  'Algeria':                       { lat: 36.7372,  lon: 3.0865,   risk: 'Medium',   region: 'Africa'       },
  'Tunisia':                       { lat: 36.8190,  lon: 10.1658,  risk: 'Medium',   region: 'Africa'       },
  'Angola':                        { lat: -8.8383,  lon: 13.2344,  risk: 'Medium',   region: 'Africa'       },
  'Sierra Leone':                  { lat: 8.4897,   lon: -13.2344, risk: 'Medium',   region: 'Africa'       },
  'Mauritania':                    { lat: 18.0735,  lon: -15.9582, risk: 'Medium',   region: 'Africa'       },
  'Ivory Coast':                   { lat: 5.3600,   lon: -4.0083,  risk: 'Medium',   region: 'Africa'       },
  'Liberia':                       { lat: 6.2907,   lon: -10.7605, risk: 'Medium',   region: 'Africa'       },
  'Madagascar':                    { lat: -18.7669, lon: 46.8691,  risk: 'Medium',   region: 'Africa'       },
  'Djibouti':                      { lat: 11.5720,  lon: 43.1456,  risk: 'Medium',   region: 'Africa'       },
  'Equatorial Guinea':             { lat: 3.7523,   lon: 8.7742,   risk: 'Medium',   region: 'Africa'       },
  'Republic of Congo':             { lat: -4.2662,  lon: 15.2832,  risk: 'Medium',   region: 'Africa'       },
  'Eswatini':                      { lat: -26.3054, lon: 31.1367,  risk: 'Medium',   region: 'Africa'       },
  'Lesotho':                       { lat: -29.3142, lon: 27.4869,  risk: 'Medium',   region: 'Africa'       },
  'Comoros':                       { lat: -11.7022, lon: 43.2551,  risk: 'Medium',   region: 'Africa'       },
  'South Africa':                  { lat: -25.7461, lon: 28.1881,  risk: 'Medium',   region: 'Africa'       },  // FCDO Level 2 — high crime, carjacking, gang violence
  'Jordan':                        { lat: 31.9539,  lon: 35.9106,  risk: 'Medium',   region: 'Middle East'  },
  'Saudi Arabia':                  { lat: 24.7136,  lon: 46.6753,  risk: 'Medium',   region: 'Middle East'  },
  'Turkey':                        { lat: 39.9334,  lon: 32.8597,  risk: 'Medium',   region: 'Europe'       },
  'Brazil':                        { lat: -15.7801, lon: -47.9292, risk: 'Medium',   region: 'Americas'     },
  'El Salvador':                   { lat: 13.6929,  lon: -89.2182, risk: 'Medium',   region: 'Americas'     },
  'Bolivia':                       { lat: -16.5000, lon: -68.1500, risk: 'Medium',   region: 'Americas'     },
  'Peru':                          { lat: -12.0464, lon: -77.0428, risk: 'Medium',   region: 'Americas'     },
  'Paraguay':                      { lat: -25.2867, lon: -57.6470, risk: 'Medium',   region: 'Americas'     },
  'Cuba':                          { lat: 23.1136,  lon: -82.3666, risk: 'Medium',   region: 'Americas'     },
  'Dominican Republic':            { lat: 18.4861,  lon: -69.9312, risk: 'Medium',   region: 'Americas'     },
  'Trinidad and Tobago':           { lat: 10.6549,  lon: -61.5019, risk: 'Medium',   region: 'Americas'     },
  'Belize':                        { lat: 17.2510,  lon: -88.7590, risk: 'Medium',   region: 'Americas'     },
  'Suriname':                      { lat: 5.8520,   lon: -55.2038, risk: 'Medium',   region: 'Americas'     },
  'Indonesia':                     { lat: -6.2088,  lon: 106.8456, risk: 'Medium',   region: 'Asia'         },
  'Philippines':                   { lat: 14.5995,  lon: 120.9842, risk: 'Medium',   region: 'Asia'         },
  'India':                         { lat: 28.6139,  lon: 77.2090,  risk: 'Medium',   region: 'Asia'         },

  // ── Low ─────────────────────────────────────────────────────────────────────
  'Ghana':                         { lat: 5.6037,   lon: -0.1870,  risk: 'High',     region: 'Africa'       },
  'Rwanda':                        { lat: -1.9441,  lon: 30.0619,  risk: 'Low',      region: 'Africa'       },
  'Senegal':                       { lat: 14.7167,  lon: -17.4677, risk: 'Low',      region: 'Africa'       },
  'Morocco':                       { lat: 33.9716,  lon: -6.8498,  risk: 'Low',      region: 'Africa'       },
  'Botswana':                      { lat: -24.6282, lon: 25.9231,  risk: 'Low',      region: 'Africa'       },
  'Namibia':                       { lat: -22.5609, lon: 17.0658,  risk: 'Low',      region: 'Africa'       },
  'Malawi':                        { lat: -13.9626, lon: 33.7741,  risk: 'Low',      region: 'Africa'       },
  'Gambia':                        { lat: 13.4531,  lon: -16.5780, risk: 'Low',      region: 'Africa'       },
  'Cabo Verde':                    { lat: 14.9330,  lon: -23.5133, risk: 'Low',      region: 'Africa'       },
  'Mauritius':                     { lat: -20.1654, lon: 57.4896,  risk: 'Low',      region: 'Africa'       },
  'Seychelles':                    { lat: -4.6796,  lon: 55.4920,  risk: 'Low',      region: 'Africa'       },
  'Sao Tome and Principe':         { lat: 0.1864,   lon: 6.6131,   risk: 'Low',      region: 'Africa'       },
  'Kuwait':                        { lat: 29.3759,  lon: 47.9774,  risk: 'Low',      region: 'Middle East'  },
  'Oman':                          { lat: 23.6140,  lon: 58.5922,  risk: 'Low',      region: 'Middle East'  },
  'Qatar':                         { lat: 25.2854,  lon: 51.5310,  risk: 'Low',      region: 'Middle East'  },
  'Bahrain':                       { lat: 26.0667,  lon: 50.5577,  risk: 'Low',      region: 'Middle East'  },
  'Argentina':                     { lat: -34.6037, lon: -58.3816, risk: 'Low',      region: 'Americas'     },
  'Chile':                         { lat: -33.4569, lon: -70.6483, risk: 'Low',      region: 'Americas'     },
  'Uruguay':                       { lat: -34.9011, lon: -56.1645, risk: 'Low',      region: 'Americas'     },
  'Costa Rica':                    { lat: 9.9281,   lon: -84.0907, risk: 'Low',      region: 'Americas'     },
  'Panama':                        { lat: 8.9936,   lon: -79.5197, risk: 'Low',      region: 'Americas'     },
  'Guyana':                        { lat: 6.8013,   lon: -58.1551, risk: 'Low',      region: 'Americas'     },
  'Bahamas':                       { lat: 25.0343,  lon: -77.3963, risk: 'Low',      region: 'Americas'     },
  'Barbados':                      { lat: 13.1939,  lon: -59.5432, risk: 'Low',      region: 'Americas'     },
  'Romania':                       { lat: 44.4268,  lon: 26.1025,  risk: 'Low',      region: 'Europe'       },
  'Serbia':                        { lat: 44.8176,  lon: 20.4633,  risk: 'Low',      region: 'Europe'       },
  'United Kingdom':                { lat: 51.5074,  lon: -0.1278,  risk: 'Low',      region: 'Europe'       },
  'France':                        { lat: 48.8566,  lon: 2.3522,   risk: 'Low',      region: 'Europe'       },
  'Germany':                       { lat: 52.5200,  lon: 13.4050,  risk: 'Low',      region: 'Europe'       },
  'Greece':                        { lat: 37.9838,  lon: 23.7275,  risk: 'Low',      region: 'Europe'       },
  'Italy':                         { lat: 41.9028,  lon: 12.4964,  risk: 'Low',      region: 'Europe'       },
  'Netherlands':                   { lat: 52.3676,  lon: 4.9041,   risk: 'Low',      region: 'Europe'       },
  'Poland':                        { lat: 52.2297,  lon: 21.0122,  risk: 'Low',      region: 'Europe'       },
  'Portugal':                      { lat: 38.7223,  lon: -9.1393,  risk: 'Low',      region: 'Europe'       },
  'Spain':                         { lat: 40.4168,  lon: -3.7038,  risk: 'Low',      region: 'Europe'       },
  'Sweden':                        { lat: 59.3293,  lon: 18.0686,  risk: 'Low',      region: 'Europe'       },
  'Switzerland':                   { lat: 46.9481,  lon: 7.4474,   risk: 'Low',      region: 'Europe'       },
  'United States':                 { lat: 38.9072,  lon: -77.0369, risk: 'Low',      region: 'Americas'     },
  'Australia':                     { lat: -35.2809, lon: 149.1300, risk: 'Low',      region: 'Oceania'      },
  'Singapore':                     { lat: 1.3521,   lon: 103.8198, risk: 'Low',      region: 'Asia'         },
  'Japan':                         { lat: 35.6762,  lon: 139.6503, risk: 'Low',      region: 'Asia'         },
  'United Arab Emirates':          { lat: 24.4539,  lon: 54.3773,  risk: 'High',     region: 'Middle East'  },  // FCDO Level 3 — regional escalation (Iran/US/Israel)
}

export const RISK_CIRCLE_STYLE = {
  Critical: { color: '#dc2626', stroke: '#b91c1c', radius: 18 },
  High:     { color: '#ea580c', stroke: '#c2410c', radius: 14 },
  Medium:   { color: '#eab308', stroke: '#ca8a04', radius: 11 },
  Low:      { color: '#22c55e', stroke: '#16a34a', radius: 8  },
}

export function buildRiskGeoJSON(filter = 'All') {
  return {
    type: 'FeatureCollection',
    features: Object.entries(RISK_MAP)
      .filter(([, c]) => filter === 'All' || c.region === filter)
      .map(([name, c]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
        properties: { name, risk: c.risk, region: c.region },
      })),
  }
}
