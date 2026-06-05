/**
 * City-level coordinates for trip destination markers.
 * Used by the World Explorer map — provides precise placement
 * instead of country centroid fallback.
 *
 * Keys are lowercase city names. Look up with:
 *   CITY_COORDS[city.toLowerCase().trim()]
 *
 * Fallback chain: city → country centroid (COUNTRY_META)
 */
export const CITY_COORDS = {
  // ── Sub-Saharan Africa ────────────────────────────────────────────────────────
  'lubumbashi':           { lat: -11.6647, lng:  27.4794 },
  'kinshasa':             { lat:  -4.3220, lng:  15.3220 },
  'goma':                 { lat:  -1.6797, lng:  29.2285 },
  'bukavu':               { lat:  -2.5085, lng:  28.8617 },
  'kisangani':            { lat:   0.5153, lng:  25.1899 },
  'mbuji-mayi':           { lat:  -6.1360, lng:  23.5900 },
  'matadi':               { lat:  -5.8277, lng:  13.4628 },
  'brazzaville':          { lat:  -4.2694, lng:  15.2712 },
  'pointe-noire':         { lat:  -4.7761, lng:  11.8635 },

  'lagos':                { lat:   6.5244, lng:   3.3792 },
  'abuja':                { lat:   9.0579, lng:   7.4951 },
  'port harcourt':        { lat:   4.8156, lng:   7.0498 },
  'kano':                 { lat:  12.0022, lng:   8.5920 },
  'ibadan':               { lat:   7.3776, lng:   3.9470 },
  'enugu':                { lat:   6.4584, lng:   7.5464 },
  'calabar':              { lat:   4.9503, lng:   8.3259 },

  'nairobi':              { lat:  -1.2921, lng:  36.8219 },
  'mombasa':              { lat:  -4.0435, lng:  39.6682 },
  'kisumu':               { lat:  -0.1022, lng:  34.7617 },
  'eldoret':              { lat:   0.5143, lng:  35.2698 },
  'nakuru':               { lat:  -0.3031, lng:  36.0800 },

  'dar es salaam':        { lat:  -6.7924, lng:  39.2083 },
  'arusha':               { lat:  -3.3869, lng:  36.6830 },
  'mwanza':               { lat:  -2.5164, lng:  32.9175 },
  'zanzibar':             { lat:  -6.1659, lng:  39.2026 },
  'dodoma':               { lat:  -6.1722, lng:  35.7395 },
  'mbeya':                { lat:  -8.9000, lng:  33.4500 },

  'kampala':              { lat:   0.3476, lng:  32.5825 },
  'entebbe':              { lat:   0.0619, lng:  32.4638 },
  'gulu':                 { lat:   2.7747, lng:  32.2990 },

  'kigali':               { lat:  -1.9441, lng:  30.0619 },
  'bujumbura':            { lat:  -3.3819, lng:  29.3614 },
  'gitega':               { lat:  -3.4271, lng:  29.9246 },

  'addis ababa':          { lat:   9.0250, lng:  38.7469 },
  'dire dawa':            { lat:   9.5931, lng:  41.8661 },
  'mekelle':              { lat:  13.4967, lng:  39.4753 },

  'mogadishu':            { lat:   2.0469, lng:  45.3182 },
  'hargeisa':             { lat:   9.5600, lng:  44.0650 },
  'bosaso':               { lat:  11.2841, lng:  49.1816 },

  'juba':                 { lat:   4.8594, lng:  31.5713 },
  'wau':                  { lat:   7.7010, lng:  27.9900 },
  'malakal':              { lat:   9.5339, lng:  31.6603 },

  'khartoum':             { lat:  15.5007, lng:  32.5599 },
  'omdurman':             { lat:  15.6500, lng:  32.4800 },
  'port sudan':           { lat:  19.6150, lng:  37.2164 },

  'djibouti':             { lat:  11.5720, lng:  43.1450 },
  'asmara':               { lat:  15.3381, lng:  38.9318 },

  'johannesburg':         { lat: -26.2041, lng:  28.0473 },
  'cape town':            { lat: -33.9249, lng:  18.4241 },
  'durban':               { lat: -29.8587, lng:  31.0218 },
  'pretoria':             { lat: -25.7479, lng:  28.2293 },
  'port elizabeth':       { lat: -33.9608, lng:  25.6022 },
  'gqeberha':             { lat: -33.9608, lng:  25.6022 },
  'east london':          { lat: -33.0153, lng:  27.9116 },
  'bloemfontein':         { lat: -29.0852, lng:  26.1596 },

  'lusaka':               { lat: -15.4166, lng:  28.2833 },
  'ndola':                { lat: -12.9587, lng:  28.6366 },
  'livingstone':          { lat: -17.8516, lng:  25.8572 },
  'kitwe':                { lat: -12.8024, lng:  28.2132 },

  'harare':               { lat: -17.8252, lng:  31.0335 },
  'bulawayo':             { lat: -20.1503, lng:  28.5803 },

  'gaborone':             { lat: -24.6549, lng:  25.9089 },
  'francistown':          { lat: -21.1658, lng:  27.5100 },

  'windhoek':             { lat: -22.5609, lng:  17.0658 },
  'walvis bay':           { lat: -22.9576, lng:  14.5053 },

  'maputo':               { lat: -25.9692, lng:  32.5732 },
  'beira':                { lat: -19.8436, lng:  34.8389 },
  'nampula':              { lat: -15.1164, lng:  39.2666 },

  'lilongwe':             { lat: -13.9626, lng:  33.7741 },
  'blantyre':             { lat: -15.7861, lng:  35.0058 },

  'antananarivo':         { lat: -18.9137, lng:  47.5362 },

  'accra':                { lat:   5.5600, lng:  -0.1969 },
  'kumasi':               { lat:   6.6885, lng:  -1.6244 },

  'abidjan':              { lat:   5.3600, lng:  -4.0083 },
  'yamoussoukro':         { lat:   6.8276, lng:  -5.2893 },

  'dakar':                { lat:  14.7167, lng: -17.4677 },
  'saint-louis':          { lat:  16.0179, lng: -16.4897 },

  'bamako':               { lat:  12.6392, lng:  -8.0029 },
  'ouagadougou':          { lat:  12.3647, lng:  -1.5354 },
  'niamey':               { lat:  13.5137, lng:   2.1098 },
  "n'djamena":            { lat:  12.1048, lng:  15.0445 },
  'ndjamena':             { lat:  12.1048, lng:  15.0445 },
  'bangui':               { lat:   4.3947, lng:  18.5582 },
  'libreville':           { lat:   0.3924, lng:   9.4536 },
  'malabo':               { lat:   3.7500, lng:   8.7833 },
  'yaoundé':              { lat:   3.8480, lng:  11.5021 },
  'yaounde':              { lat:   3.8480, lng:  11.5021 },
  'douala':               { lat:   4.0511, lng:   9.7679 },
  'luanda':               { lat:  -8.8368, lng:  13.2343 },
  'huambo':               { lat: -12.7760, lng:  15.7388 },
  'freetown':             { lat:   8.4657, lng: -13.2317 },
  'conakry':              { lat:   9.6412, lng: -13.5784 },
  'monrovia':             { lat:   6.3156, lng: -10.8074 },
  'banjul':               { lat:  13.4549, lng: -16.5790 },
  'bissau':               { lat:  11.8816, lng: -15.6177 },
  'lome':                 { lat:   6.1375, lng:   1.2123 },
  'cotonou':              { lat:   6.3654, lng:   2.4183 },
  'porto-novo':           { lat:   6.3654, lng:   2.4183 },

  // ── North Africa ─────────────────────────────────────────────────────────────
  'cairo':                { lat:  30.0444, lng:  31.2357 },
  'alexandria':           { lat:  31.2001, lng:  29.9187 },
  'luxor':                { lat:  25.6872, lng:  32.6396 },
  'aswan':                { lat:  24.0889, lng:  32.8998 },

  'tripoli':              { lat:  32.8872, lng:  13.1913 },
  'benghazi':             { lat:  32.1194, lng:  20.0877 },
  'misrata':              { lat:  32.3754, lng:  15.0925 },

  'tunis':                { lat:  36.8190, lng:  10.1658 },
  'sfax':                 { lat:  34.7400, lng:  10.7600 },

  'algiers':              { lat:  36.7538, lng:   3.0588 },
  'oran':                 { lat:  35.6969, lng:  -0.6331 },

  'casablanca':           { lat:  33.5892, lng:  -7.6134 },
  'rabat':                { lat:  34.0209, lng:  -6.8416 },
  'marrakech':            { lat:  31.6295, lng:  -7.9811 },
  'fez':                  { lat:  34.0181, lng:  -5.0078 },
  'tangier':              { lat:  35.7595, lng:  -5.8340 },

  'nouakchott':           { lat:  18.0858, lng: -15.9785 },

  // ── Middle East ───────────────────────────────────────────────────────────────
  'dubai':                { lat:  25.2048, lng:  55.2708 },
  'abu dhabi':            { lat:  24.4539, lng:  54.3773 },
  'sharjah':              { lat:  25.3463, lng:  55.4209 },

  'doha':                 { lat:  25.2854, lng:  51.5310 },
  'riyadh':               { lat:  24.6877, lng:  46.7219 },
  'jeddah':               { lat:  21.4858, lng:  39.1925 },
  'medina':               { lat:  24.5247, lng:  39.5692 },
  'dammam':               { lat:  26.4207, lng:  50.0888 },

  'kuwait city':          { lat:  29.3759, lng:  47.9774 },
  'muscat':               { lat:  23.5880, lng:  58.3829 },
  'manama':               { lat:  26.2154, lng:  50.5832 },

  'amman':                { lat:  31.9539, lng:  35.9106 },
  'aqaba':                { lat:  29.5269, lng:  35.0078 },

  'beirut':               { lat:  33.8938, lng:  35.5018 },
  'damascus':             { lat:  33.5102, lng:  36.2913 },
  'aleppo':               { lat:  36.2021, lng:  37.1343 },

  'baghdad':              { lat:  33.3152, lng:  44.3661 },
  'basra':                { lat:  30.5085, lng:  47.7804 },
  'erbil':                { lat:  36.1912, lng:  44.0092 },
  'sulaymaniyah':         { lat:  35.5571, lng:  45.4329 },

  'tehran':               { lat:  35.6892, lng:  51.3890 },
  'isfahan':              { lat:  32.6546, lng:  51.6680 },
  'mashhad':              { lat:  36.2972, lng:  59.6067 },
  'tabriz':               { lat:  38.0962, lng:  46.2738 },
  'shiraz':               { lat:  29.5918, lng:  52.5836 },

  'sanaa':                { lat:  15.3694, lng:  44.1910 },
  'aden':                 { lat:  12.7794, lng:  45.0367 },
  'hudaydah':             { lat:  14.7978, lng:  42.9547 },

  'kabul':                { lat:  34.5553, lng:  69.2075 },
  'kandahar':             { lat:  31.6289, lng:  65.7372 },
  'mazar-i-sharif':       { lat:  36.7069, lng:  67.1100 },
  'herat':                { lat:  34.3529, lng:  62.2042 },

  'islamabad':            { lat:  33.6844, lng:  73.0479 },
  'karachi':              { lat:  24.8607, lng:  67.0011 },
  'lahore':               { lat:  31.5204, lng:  74.3587 },
  'peshawar':             { lat:  34.0150, lng:  71.5249 },
  'quetta':               { lat:  30.1798, lng:  66.9750 },

  // ── South & Southeast Asia ────────────────────────────────────────────────────
  'dhaka':                { lat:  23.8103, lng:  90.4125 },
  'colombo':              { lat:   6.9271, lng:  79.8612 },
  'kathmandu':            { lat:  27.7172, lng:  85.3240 },
  'mumbai':               { lat:  19.0760, lng:  72.8777 },
  'delhi':                { lat:  28.6139, lng:  77.2090 },
  'new delhi':            { lat:  28.6139, lng:  77.2090 },
  'bangalore':            { lat:  12.9716, lng:  77.5946 },
  'bengaluru':            { lat:  12.9716, lng:  77.5946 },
  'chennai':              { lat:  13.0827, lng:  80.2707 },
  'hyderabad':            { lat:  17.3850, lng:  78.4867 },
  'kolkata':              { lat:  22.5726, lng:  88.3639 },

  'yangon':               { lat:  16.8661, lng:  96.1951 },
  'naypyidaw':            { lat:  19.7633, lng:  96.0785 },
  'phnom penh':           { lat:  11.5625, lng: 104.9160 },
  'vientiane':            { lat:  17.9757, lng: 102.6331 },
  'bangkok':              { lat:  13.7563, lng: 100.5018 },
  'ho chi minh city':     { lat:  10.8231, lng: 106.6297 },
  'hanoi':                { lat:  21.0285, lng: 105.8542 },
  'jakarta':              { lat:  -6.2088, lng: 106.8456 },
  'kuala lumpur':         { lat:   3.1390, lng: 101.6869 },
  'singapore':            { lat:   1.3521, lng: 103.8198 },
  'manila':               { lat:  14.5995, lng: 120.9842 },

  // ── Former Soviet / Central Asia ─────────────────────────────────────────────
  'kyiv':                 { lat:  50.4501, lng:  30.5234 },
  'kharkiv':              { lat:  49.9935, lng:  36.2304 },
  'odessa':               { lat:  46.4825, lng:  30.7233 },
  'moscow':               { lat:  55.7558, lng:  37.6173 },
  'saint petersburg':     { lat:  59.9311, lng:  30.3609 },

  'almaty':               { lat:  43.2220, lng:  76.8512 },
  'nur-sultan':           { lat:  51.1801, lng:  71.4460 },
  'astana':               { lat:  51.1801, lng:  71.4460 },
  'tashkent':             { lat:  41.2995, lng:  69.2401 },
  'bishkek':              { lat:  42.8746, lng:  74.5698 },
  'dushanbe':             { lat:  38.5598, lng:  68.7870 },
  'ashgabat':             { lat:  37.9601, lng:  58.3261 },
  'baku':                 { lat:  40.4093, lng:  49.8671 },
  'tbilisi':              { lat:  41.6938, lng:  44.8015 },
  'yerevan':              { lat:  40.1872, lng:  44.5152 },

  // ── Global hubs ───────────────────────────────────────────────────────────────
  'london':               { lat:  51.5074, lng:  -0.1278 },
  'paris':                { lat:  48.8566, lng:   2.3522 },
  'amsterdam':            { lat:  52.3676, lng:   4.9041 },
  'brussels':             { lat:  50.8503, lng:   4.3517 },
  'berlin':               { lat:  52.5200, lng:  13.4050 },
  'frankfurt':            { lat:  50.1109, lng:   8.6821 },
  'zurich':               { lat:  47.3769, lng:   8.5417 },
  'geneva':               { lat:  46.2044, lng:   6.1432 },
  'rome':                 { lat:  41.9028, lng:  12.4964 },
  'milan':                { lat:  45.4642, lng:   9.1900 },
  'madrid':               { lat:  40.4168, lng:  -3.7038 },
  'barcelona':            { lat:  41.3851, lng:   2.1734 },
  'lisbon':               { lat:  38.7167, lng:  -9.1395 },
  'istanbul':             { lat:  41.0082, lng:  28.9784 },
  'ankara':               { lat:  39.9334, lng:  32.8597 },
  'athens':               { lat:  37.9838, lng:  23.7275 },
  'vienna':               { lat:  48.2082, lng:  16.3738 },
  'warsaw':               { lat:  52.2297, lng:  21.0122 },
  'bucharest':            { lat:  44.4268, lng:  26.1025 },
  'new york':             { lat:  40.7128, lng: -74.0060 },
  'washington':           { lat:  38.9072, lng: -77.0369 },
  'los angeles':          { lat:  34.0522, lng: -118.2437 },
  'chicago':              { lat:  41.8781, lng: -87.6298 },
  'toronto':              { lat:  43.6532, lng: -79.3832 },
  'montreal':             { lat:  45.5017, lng: -73.5673 },
  'mexico city':          { lat:  19.4326, lng: -99.1332 },
  'bogota':               { lat:   4.7110, lng: -74.0721 },
  'lima':                 { lat: -12.0464, lng: -77.0428 },
  'santiago':             { lat: -33.4489, lng: -70.6693 },
  'buenos aires':         { lat: -34.6037, lng: -58.3816 },
  'são paulo':            { lat: -23.5505, lng: -46.6333 },
  'sao paulo':            { lat: -23.5505, lng: -46.6333 },
  'rio de janeiro':       { lat: -22.9068, lng: -43.1729 },
  'tokyo':                { lat:  35.6762, lng: 139.6503 },
  'osaka':                { lat:  34.6937, lng: 135.5023 },
  'seoul':                { lat:  37.5665, lng: 126.9780 },
  'beijing':              { lat:  39.9042, lng: 116.4074 },
  'shanghai':             { lat:  31.2304, lng: 121.4737 },
  'hong kong':            { lat:  22.3193, lng: 114.1694 },
  'taipei':               { lat:  25.0330, lng: 121.5654 },
  'sydney':               { lat: -33.8688, lng: 151.2093 },
  'melbourne':            { lat: -37.8136, lng: 144.9631 },
}

/**
 * Look up city coordinates with case-insensitive matching.
 * Strips common suffixes like "International Airport" etc.
 */
export function getCityCoords(cityName) {
  if (!cityName) return null
  const key = cityName.toLowerCase().trim()
  if (CITY_COORDS[key]) return CITY_COORDS[key]
  // Try first word only (e.g. "Lubumbashi City" → "lubumbashi")
  const firstWord = key.split(/[\s,]+/)[0]
  return CITY_COORDS[firstWord] || null
}
