// Shared intelligence data: city→country, country terms, coordinates
// Used by IntelBrief, Dashboard, Tracker, Alerts

// ── City → Country lookup ─────────────────────────────────────────────────────
const RAW_CITY_MAP = {
  // Angola
  'luanda': 'Angola', 'lobito': 'Angola', 'huambo': 'Angola',
  // Botswana
  'gaborone': 'Botswana', 'francistown': 'Botswana',
  // Cameroon
  'yaounde': 'Cameroon', 'yaoundé': 'Cameroon', 'douala': 'Cameroon',
  // Chad
  "n'djamena": 'Chad', 'ndjamena': 'Chad', 'moundou': 'Chad',
  // DRC
  'kinshasa': 'Democratic Republic of Congo', 'lubumbashi': 'Democratic Republic of Congo',
  'goma': 'Democratic Republic of Congo', 'bunia': 'Democratic Republic of Congo',
  'bukavu': 'Democratic Republic of Congo', 'beni': 'Democratic Republic of Congo',
  // Egypt
  'cairo': 'Egypt', 'alexandria': 'Egypt', 'giza': 'Egypt', 'luxor': 'Egypt', 'hurghada': 'Egypt',
  // Ethiopia
  'addis ababa': 'Ethiopia', 'addis': 'Ethiopia', 'dire dawa': 'Ethiopia', 'mekelle': 'Ethiopia',
  // Ghana
  'accra': 'Ghana', 'kumasi': 'Ghana', 'tamale': 'Ghana',
  // Iraq
  'baghdad': 'Iraq', 'erbil': 'Iraq', 'mosul': 'Iraq', 'basra': 'Iraq',
  'sulaymaniyah': 'Iraq', 'kirkuk': 'Iraq',
  // Jordan
  'amman': 'Jordan', 'zarqa': 'Jordan', 'aqaba': 'Jordan', 'irbid': 'Jordan',
  // Kenya
  'nairobi': 'Kenya', 'mombasa': 'Kenya', 'kisumu': 'Kenya', 'nakuru': 'Kenya', 'eldoret': 'Kenya',
  // Lebanon
  'beirut': 'Lebanon', 'sidon': 'Lebanon', 'tyre': 'Lebanon',
  // Libya
  'tripoli': 'Libya', 'benghazi': 'Libya', 'misrata': 'Libya', 'tobruk': 'Libya',
  // Mali
  'bamako': 'Mali', 'timbuktu': 'Mali', 'gao': 'Mali', 'mopti': 'Mali',
  // Mauritania
  'nouakchott': 'Mauritania', 'nouadhibou': 'Mauritania',
  // Morocco
  'rabat': 'Morocco', 'casablanca': 'Morocco', 'marrakech': 'Morocco',
  'fez': 'Morocco', 'tangier': 'Morocco', 'agadir': 'Morocco',
  // Mozambique
  'maputo': 'Mozambique', 'beira': 'Mozambique', 'pemba': 'Mozambique',
  'nampula': 'Mozambique', 'tete': 'Mozambique',
  // Namibia
  'windhoek': 'Namibia', 'walvis bay': 'Namibia', 'swakopmund': 'Namibia',
  // Niger
  'niamey': 'Niger', 'zinder': 'Niger', 'agadez': 'Niger',
  // Nigeria
  'abuja': 'Nigeria', 'lagos': 'Nigeria', 'kano': 'Nigeria',
  'port harcourt': 'Nigeria', 'kaduna': 'Nigeria', 'ibadan': 'Nigeria',
  'maiduguri': 'Nigeria', 'jos': 'Nigeria',
  // Rwanda
  'kigali': 'Rwanda', 'butare': 'Rwanda',
  // Saudi Arabia
  'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia', 'mecca': 'Saudi Arabia',
  'medina': 'Saudi Arabia', 'dammam': 'Saudi Arabia', 'khobar': 'Saudi Arabia',
  // Senegal
  'dakar': 'Senegal', 'saint-louis': 'Senegal', 'ziguinchor': 'Senegal',
  // Sierra Leone
  'freetown': 'Sierra Leone', 'bo': 'Sierra Leone',
  // Somalia
  'mogadishu': 'Somalia', 'hargeisa': 'Somalia', 'bosaso': 'Somalia', 'kismayo': 'Somalia',
  // South Africa
  'johannesburg': 'South Africa', 'joburg': 'South Africa', 'jnb': 'South Africa',
  'cape town': 'South Africa', 'pretoria': 'South Africa', 'tshwane': 'South Africa',
  'durban': 'South Africa', 'port elizabeth': 'South Africa', 'gqeberha': 'South Africa',
  'bloemfontein': 'South Africa', 'east london': 'South Africa',
  // South Sudan
  'juba': 'South Sudan', 'wau': 'South Sudan', 'malakal': 'South Sudan',
  // Sudan
  'khartoum': 'Sudan', 'omdurman': 'Sudan', 'port sudan': 'Sudan', 'el fasher': 'Sudan',
  // Syria
  'damascus': 'Syria', 'aleppo': 'Syria', 'homs': 'Syria', 'latakia': 'Syria', 'idlib': 'Syria',
  // Tanzania
  'dar es salaam': 'Tanzania', 'dodoma': 'Tanzania', 'zanzibar': 'Tanzania',
  'arusha': 'Tanzania', 'mwanza': 'Tanzania',
  // Tunisia
  'tunis': 'Tunisia', 'sfax': 'Tunisia', 'sousse': 'Tunisia',
  // Uganda
  'kampala': 'Uganda', 'entebbe': 'Uganda', 'gulu': 'Uganda', 'mbarara': 'Uganda',
  // Yemen
  "sana'a": 'Yemen', 'sanaa': 'Yemen', 'aden': 'Yemen', 'hodeidah': 'Yemen', 'mukalla': 'Yemen',
  // Zambia
  'lusaka': 'Zambia', 'ndola': 'Zambia', 'kitwe': 'Zambia', 'livingstone': 'Zambia',
  // Zimbabwe
  'harare': 'Zimbabwe', 'bulawayo': 'Zimbabwe', 'mutare': 'Zimbabwe',
}

export function cityToCountry(city) {
  if (!city) return null
  return RAW_CITY_MAP[city.toLowerCase().trim()] || null
}

// ── Country coordinates (capital city lat/lon for weather) ─────────────────────
export const COUNTRY_META = {
  'Angola':                       { lat: -8.8368,  lon: 13.2343 },
  'Botswana':                     { lat: -24.6282, lon: 25.9231 },
  'Cameroon':                     { lat:  3.8480,  lon: 11.5021 },
  'Chad':                         { lat: 12.1048,  lon: 15.0445 },
  'Democratic Republic of Congo': { lat: -4.4419,  lon: 15.2663 },
  'Egypt':                        { lat: 30.0444,  lon: 31.2357 },
  'Ethiopia':                     { lat:  9.0250,  lon: 38.7469 },
  'Ghana':                        { lat:  5.6037,  lon: -0.1870 },
  'Iraq':                         { lat: 33.3152,  lon: 44.3661 },
  'Jordan':                       { lat: 31.9539,  lon: 35.9106 },
  'Kenya':                        { lat: -1.2921,  lon: 36.8219 },
  'Lebanon':                      { lat: 33.8938,  lon: 35.5018 },
  'Libya':                        { lat: 32.8872,  lon: 13.1913 },
  'Mali':                         { lat: 12.6392,  lon: -8.0029 },
  'Mauritania':                   { lat: 18.0858,  lon: -15.9785 },
  'Morocco':                      { lat: 34.0209,  lon: -6.8416 },
  'Mozambique':                   { lat: -25.9653, lon:  32.5892 },
  'Namibia':                      { lat: -22.5609, lon:  17.0658 },
  'Niger':                        { lat: 13.5137,  lon:  2.1098  },
  'Nigeria':                      { lat:  9.0765,  lon:  7.3986  },
  'Rwanda':                       { lat: -1.9441,  lon: 30.0619  },
  'Saudi Arabia':                 { lat: 24.6877,  lon: 46.7219  },
  'Senegal':                      { lat: 14.7167,  lon: -17.4677 },
  'Sierra Leone':                 { lat:  8.4657,  lon: -13.2317 },
  'Somalia':                      { lat:  2.0469,  lon: 45.3182  },
  'South Africa':                 { lat: -25.7479, lon:  28.2293 },
  'South Sudan':                  { lat:  4.8594,  lon: 31.5713  },
  'Sudan':                        { lat: 15.5007,  lon: 32.5599  },
  'Syria':                        { lat: 33.5102,  lon: 36.2913  },
  'Tanzania':                     { lat: -6.1722,  lon: 35.7395  },
  'Tunisia':                      { lat: 36.8190,  lon: 10.1658  },
  'Uganda':                       { lat:  0.3476,  lon: 32.5825  },
  'Yemen':                        { lat: 15.3694,  lon: 44.1910  },
  'Zambia':                       { lat: -15.4166, lon: 28.2833  },
  'Zimbabwe':                     { lat: -17.8252, lon: 31.0335  },
}

// ── Country terms (aliases, demonyms, cities, armed groups) ───────────────────
export const COUNTRY_TERMS = {
  'Angola':                       ['angola', 'angolan', 'luanda', 'lobito'],
  'Botswana':                     ['botswana', 'batswana', 'gaborone'],
  'Cameroon':                     ['cameroon', 'cameroonian', 'yaoundé', 'yaounde', 'douala', 'ambazonia', 'anglophone'],
  'Chad':                         ['chad', 'chadian', "n'djamena", 'ndjamena', 'lake chad', 'boko haram'],
  'Democratic Republic of Congo': ['democratic republic of congo', 'drc', 'dr congo', 'congo', 'congolese', 'kinshasa', 'goma', 'bukavu', 'bunia', 'ituri', 'kivu', 'm23', 'adf'],
  'Egypt':                        ['egypt', 'egyptian', 'cairo', 'sinai', 'alexandria', 'sisi'],
  'Ethiopia':                     ['ethiopia', 'ethiopian', 'addis ababa', 'addis', 'tigray', 'amhara', 'oromia', 'tplf', 'fano'],
  'Ghana':                        ['ghana', 'ghanaian', 'accra', 'kumasi'],
  'Iraq':                         ['iraq', 'iraqi', 'baghdad', 'erbil', 'mosul', 'basra', 'isis', 'isil', 'daesh', 'peshmerga', 'pmc', 'kurdistan'],
  'Jordan':                       ['jordan', 'jordanian', 'amman', 'zarqa'],
  'Kenya':                        ['kenya', 'kenyan', 'nairobi', 'mombasa', 'al-shabaab', 'garissa', 'lamu', 'mandera'],
  'Lebanon':                      ['lebanon', 'lebanese', 'beirut', 'hezbollah', 'south lebanon', 'sidon', 'tyre'],
  'Libya':                        ['libya', 'libyan', 'tripoli', 'benghazi', 'misrata', 'haftar', 'gna', 'lna'],
  'Mali':                         ['mali', 'malian', 'bamako', 'timbuktu', 'gao', 'jnim', 'gsim', 'wagner', 'sahel'],
  'Mauritania':                   ['mauritania', 'mauritanian', 'nouakchott'],
  'Morocco':                      ['morocco', 'moroccan', 'rabat', 'casablanca', 'marrakech', 'western sahara'],
  'Mozambique':                   ['mozambique', 'mozambican', 'maputo', 'cabo delgado', 'pemba', ' ISIS mozambique', 'ansar al-sunna'],
  'Namibia':                      ['namibia', 'namibian', 'windhoek', 'walvis bay'],
  'Niger':                        ['niger', 'nigerien', 'niamey', 'agadez', 'cnsp'],
  'Nigeria':                      ['nigeria', 'nigerian', 'abuja', 'lagos', 'boko haram', 'iswap', 'kano', 'kaduna', 'niger delta', 'biafra', 'ipob', 'bandits'],
  'Rwanda':                       ['rwanda', 'rwandan', 'kigali', 'kagame'],
  'Saudi Arabia':                 ['saudi arabia', 'saudi', 'riyadh', 'jeddah', 'mecca', 'medina', 'ksa', 'aramco'],
  'Senegal':                      ['senegal', 'senegalese', 'dakar', 'casamance'],
  'Sierra Leone':                 ['sierra leone', 'sierra leonean', 'freetown'],
  'Somalia':                      ['somalia', 'somali', 'mogadishu', 'al-shabaab', 'al shabaab', 'hargeisa', 'puntland', 'amisom', 'atmis'],
  'South Africa':                 ['south africa', 'south african', 'johannesburg', 'joburg', 'cape town', 'pretoria', 'durban', 'eskom', 'load shedding', 'anc', 'zuma'],
  'South Sudan':                  ['south sudan', 'south sudanese', 'juba', 'wau', 'malakal', 'splm'],
  'Sudan':                        ['sudan', 'sudanese', 'khartoum', 'omdurman', 'rsf', 'rapid support forces', 'darfur', 'saf'],
  'Syria':                        ['syria', 'syrian', 'damascus', 'aleppo', 'homs', 'hts', 'idlib', 'hayat tahrir'],
  'Tanzania':                     ['tanzania', 'tanzanian', 'dar es salaam', 'zanzibar', 'arusha', 'dodoma'],
  'Tunisia':                      ['tunisia', 'tunisian', 'tunis', 'sfax'],
  'Uganda':                       ['uganda', 'ugandan', 'kampala', 'entebbe', 'lra', 'adf'],
  'Yemen':                        ['yemen', 'yemeni', "sana'a", 'sanaa', 'aden', 'hodeidah', 'houthi', 'ansarallah'],
  'Zambia':                       ['zambia', 'zambian', 'lusaka', 'ndola'],
  'Zimbabwe':                     ['zimbabwe', 'zimbabwean', 'harare', 'bulawayo', 'mnangagwa', 'zanu'],
}

export function matchesCountry(text, country) {
  const terms = COUNTRY_TERMS[country]
  if (!terms || !text) return false
  const lower = text.toLowerCase()
  return terms.some(t => lower.includes(t))
}

// ── Risk severity colours ─────────────────────────────────────────────────────
export const SEVERITY_STYLE = {
  Critical: { bg: 'bg-red-100',    border: 'border-red-300',    text: 'text-red-800',    dot: 'bg-red-500'    },
  High:     { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500' },
  Medium:   { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  Low:      { bg: 'bg-green-100',  border: 'border-green-300',  text: 'text-green-800',  dot: 'bg-green-500'  },
}

// Feeds to query for country-specific intel articles
export const INTEL_FEEDS = [
  { id: 'african-arguments', name: 'African Arguments' },
  { id: 'osac',              name: 'OSAC'              },
  { id: 'gdelt',             name: 'GDELT'             },
  { id: 'who-outbreak',      name: 'WHO'               },
  { id: 'un-ocha',           name: 'OCHA'              },
  { id: 'acled',             name: 'ACLED'             },
]
