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
  // ── Africa ───────────────────────────────────────────────────────────────────
  'Angola':                       { lat: -8.8368,  lon:  13.2343 },
  'Botswana':                     { lat: -24.6282, lon:  25.9231 },
  'Burkina Faso':                 { lat: 12.3647,  lon:  -1.5354 },
  'Cameroon':                     { lat:  3.8480,  lon:  11.5021 },
  'Central African Republic':     { lat:  4.3947,  lon:  18.5582 },
  'Chad':                         { lat: 12.1048,  lon:  15.0445 },
  'Democratic Republic of Congo': { lat: -4.4419,  lon:  15.2663 },
  'Egypt':                        { lat: 30.0444,  lon:  31.2357 },
  'Ethiopia':                     { lat:  9.0250,  lon:  38.7469 },
  'Ghana':                        { lat:  5.6037,  lon:  -0.1870 },
  'Guinea':                       { lat:  9.6412,  lon: -13.5784 },
  'Kenya':                        { lat: -1.2921,  lon:  36.8219 },
  'Libya':                        { lat: 32.8872,  lon:  13.1913 },
  'Malawi':                       { lat: -13.9626, lon:  33.7741 },
  'Mali':                         { lat: 12.6392,  lon:  -8.0029 },
  'Mauritania':                   { lat: 18.0858,  lon: -15.9785 },
  'Morocco':                      { lat: 34.0209,  lon:  -6.8416 },
  'Mozambique':                   { lat: -25.9653, lon:  32.5892 },
  'Namibia':                      { lat: -22.5609, lon:  17.0658 },
  'Niger':                        { lat: 13.5137,  lon:   2.1098 },
  'Nigeria':                      { lat:  9.0765,  lon:   7.3986 },
  'Rwanda':                       { lat: -1.9441,  lon:  30.0619 },
  'Senegal':                      { lat: 14.7167,  lon: -17.4677 },
  'Sierra Leone':                 { lat:  8.4657,  lon: -13.2317 },
  'Somalia':                      { lat:  2.0469,  lon:  45.3182 },
  'South Africa':                 { lat: -25.7479, lon:  28.2293 },
  'South Sudan':                  { lat:  4.8594,  lon:  31.5713 },
  'Sudan':                        { lat: 15.5007,  lon:  32.5599 },
  'Tanzania':                     { lat: -6.1722,  lon:  35.7395 },
  'Tunisia':                      { lat: 36.8190,  lon:  10.1658 },
  'Uganda':                       { lat:  0.3476,  lon:  32.5825 },
  'Zambia':                       { lat: -15.4166, lon:  28.2833 },
  'Zimbabwe':                     { lat: -17.8252, lon:  31.0335 },
  // ── Middle East ──────────────────────────────────────────────────────────────
  'Iran':                         { lat: 35.6892,  lon:  51.3890 },
  'Iraq':                         { lat: 33.3152,  lon:  44.3661 },
  'Jordan':                       { lat: 31.9539,  lon:  35.9106 },
  'Lebanon':                      { lat: 33.8938,  lon:  35.5018 },
  'Saudi Arabia':                 { lat: 24.6877,  lon:  46.7219 },
  'Syria':                        { lat: 33.5102,  lon:  36.2913 },
  'United Arab Emirates':         { lat: 24.4539,  lon:  54.3773 },
  'Yemen':                        { lat: 15.3694,  lon:  44.1910 },
  // ── Europe ───────────────────────────────────────────────────────────────────
  'France':                       { lat: 48.8566,  lon:   2.3522 },
  'Germany':                      { lat: 52.5200,  lon:  13.4050 },
  'Greece':                       { lat: 37.9838,  lon:  23.7275 },
  'Italy':                        { lat: 41.9028,  lon:  12.4964 },
  'Netherlands':                  { lat: 52.3676,  lon:   4.9041 },
  'Poland':                       { lat: 52.2297,  lon:  21.0122 },
  'Portugal':                     { lat: 38.7223,  lon:  -9.1393 },
  'Romania':                      { lat: 44.4268,  lon:  26.1025 },
  'Russia':                       { lat: 55.7558,  lon:  37.6173 },
  'Serbia':                       { lat: 44.8176,  lon:  20.4633 },
  'Spain':                        { lat: 40.4168,  lon:  -3.7038 },
  'Sweden':                       { lat: 59.3293,  lon:  18.0686 },
  'Switzerland':                  { lat: 46.9481,  lon:   7.4474 },
  'Turkey':                       { lat: 39.9334,  lon:  32.8597 },
  'Ukraine':                      { lat: 50.4501,  lon:  30.5234 },
  'United Kingdom':               { lat: 51.5074,  lon:  -0.1278 },
  // ── Asia ─────────────────────────────────────────────────────────────────────
  'Afghanistan':                  { lat: 34.5553,  lon:  69.2075 },
  'India':                        { lat: 28.6139,  lon:  77.2090 },
  'Indonesia':                    { lat: -6.2088,  lon: 106.8456 },
  'Japan':                        { lat: 35.6762,  lon: 139.6503 },
  'Myanmar':                      { lat: 19.7633,  lon:  96.0785 },
  'Pakistan':                     { lat: 33.6844,  lon:  73.0479 },
  'Philippines':                  { lat: 14.5995,  lon: 120.9842 },
  'Singapore':                    { lat:  1.3521,  lon: 103.8198 },
  // ── Americas ─────────────────────────────────────────────────────────────────
  'Brazil':                       { lat: -15.7801, lon: -47.9292 },
  'Colombia':                     { lat:  4.7110,  lon: -74.0721 },
  'Haiti':                        { lat: 18.5944,  lon: -72.3074 },
  'Mexico':                       { lat: 19.4326,  lon: -99.1332 },
  'United States':                { lat: 38.9072,  lon: -77.0369 },
  'Venezuela':                    { lat: 10.4806,  lon: -66.9036 },
  // ── Oceania ──────────────────────────────────────────────────────────────────
  'Australia':                    { lat: -35.2809, lon: 149.1300 },
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
  // ── Middle East additions ─────────────────────────────────────────────────
  'Iran':                         ['iran', 'iranian', 'tehran', 'irgc', 'revolutionary guard', 'khamenei', 'rouhani', 'persian'],
  'United Arab Emirates':         ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'sharjah', 'emirati'],
  // ── Europe ───────────────────────────────────────────────────────────────
  'France':                       ['france', 'french', 'paris', 'marseille', 'lyon', 'macron', 'île-de-france'],
  'Germany':                      ['germany', 'german', 'berlin', 'munich', 'hamburg', 'frankfurt', 'bundeswehr'],
  'Greece':                       ['greece', 'greek', 'athens', 'thessaloniki', 'crete', 'santorini', 'mykonos', 'piraeus', 'hellenic'],
  'Italy':                        ['italy', 'italian', 'rome', 'milan', 'naples', 'venice', 'sicily', 'sardinia', 'florence', 'turin'],
  'Netherlands':                  ['netherlands', 'dutch', 'amsterdam', 'rotterdam', 'the hague', 'den haag', 'holland'],
  'Poland':                       ['poland', 'polish', 'warsaw', 'krakow', 'gdansk', 'wroclaw'],
  'Portugal':                     ['portugal', 'portuguese', 'lisbon', 'porto', 'algarve', 'madeira', 'azores'],
  'Romania':                      ['romania', 'romanian', 'bucharest', 'cluj', 'timisoara', 'transylvania'],
  'Russia':                       ['russia', 'russian', 'moscow', 'kremlin', 'putin', 'wagner', 'fsb', 'svr', 'rosatom', 'gazprom', 'st. petersburg', 'saint petersburg'],
  'Serbia':                       ['serbia', 'serbian', 'belgrade', 'novi sad', 'vucic', 'kosovo'],
  'Spain':                        ['spain', 'spanish', 'madrid', 'barcelona', 'seville', 'valencia', 'bilbao', 'catalonia', 'basque', 'eta', 'canary islands'],
  'Sweden':                       ['sweden', 'swedish', 'stockholm', 'gothenburg', 'malmö', 'malmo'],
  'Switzerland':                  ['switzerland', 'swiss', 'bern', 'zurich', 'geneva', 'davos'],
  'Turkey':                       ['turkey', 'turkish', 'ankara', 'istanbul', 'erdogan', 'pkk', 'kurdish', 'izmir', 'antalya'],
  'Ukraine':                      ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'kharkiv', 'odessa', 'mariupol', 'zaporizhzhia', 'zelensky', 'donbas', 'donbass', 'crimea'],
  'United Kingdom':               ['united kingdom', 'uk', 'britain', 'british', 'london', 'england', 'scotland', 'wales', 'mi5', 'mi6'],
  // ── Asia ─────────────────────────────────────────────────────────────────
  'Afghanistan':                  ['afghanistan', 'afghan', 'kabul', 'kandahar', 'taliban', 'isis-k', 'isil-k', 'nis-k', 'herat'],
  'India':                        ['india', 'indian', 'new delhi', 'delhi', 'mumbai', 'kashmir', 'modi', 'naxal', 'maoist'],
  'Indonesia':                    ['indonesia', 'indonesian', 'jakarta', 'bali', 'papua', 'sulawesi', 'kkb'],
  'Japan':                        ['japan', 'japanese', 'tokyo', 'osaka', 'fukushima'],
  'Myanmar':                      ['myanmar', 'burma', 'burmese', 'naypyidaw', 'yangon', 'tatmadaw', 'pdf', 'sac', 'arsa', 'rohingya', 'chin'],
  'Pakistan':                     ['pakistan', 'pakistani', 'islamabad', 'karachi', 'lahore', 'ttp', 'tehrik-i-taliban', 'isi', 'balochistan', 'bla', 'peshawar'],
  'Philippines':                  ['philippines', 'philippine', 'filipino', 'manila', 'mindanao', 'abu sayyaf', 'npa', 'milf', 'bangsamoro'],
  'Singapore':                    ['singapore', 'singaporean'],
  // ── Americas ─────────────────────────────────────────────────────────────
  'Brazil':                       ['brazil', 'brazilian', 'brasília', 'brasilia', 'rio de janeiro', 'são paulo', 'sao paulo', 'amazon', 'lula'],
  'Colombia':                     ['colombia', 'colombian', 'bogotá', 'bogota', 'medellín', 'medellin', 'farc', 'eln', 'clan del golfo', 'cali'],
  'Haiti':                        ['haiti', 'haitian', 'port-au-prince', 'g9', 'viv ansanm', 'gang', 'ariel henry'],
  'Mexico':                       ['mexico', 'mexican', 'mexico city', 'guadalajara', 'monterrey', 'cartel', 'cjng', 'sinaloa', 'jalisco'],
  'United States':                ['united states', 'usa', 'us ', 'american', 'washington dc', 'new york', 'los angeles'],
  'Venezuela':                    ['venezuela', 'venezuelan', 'caracas', 'maduro', 'guaido', 'psuv', 'colectivos'],
  // ── Africa additions ─────────────────────────────────────────────────────
  'Burkina Faso':                 ['burkina faso', 'burkinabe', 'ouagadougou', 'jnim', 'gsim', 'traore', 'ahvpa', 'sahel'],
  'Central African Republic':     ['central african republic', 'car', 'bangui', 'wagner', 'anti-balaka', 'seleka', 'upc', 'faca'],
  'Guinea':                       ['guinea', 'guinean', 'conakry', 'mamadi doumbouya', 'cnrd'],
  'Malawi':                       ['malawi', 'malawian', 'lilongwe', 'blantyre'],
  // ── Oceania ──────────────────────────────────────────────────────────────
  'Australia':                    ['australia', 'australian', 'canberra', 'sydney', 'melbourne', 'brisbane', 'perth'],
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
