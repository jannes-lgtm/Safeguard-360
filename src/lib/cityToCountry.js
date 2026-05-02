const CITY_TO_COUNTRY = {
  // Africa
  'lagos': 'Nigeria', 'abuja': 'Nigeria', 'port harcourt': 'Nigeria', 'kano': 'Nigeria',
  'nairobi': 'Kenya', 'mombasa': 'Kenya',
  'johannesburg': 'South Africa', 'joburg': 'South Africa', 'jburg': 'South Africa',
  'cape town': 'South Africa', 'capee town': 'South Africa', 'durban': 'South Africa', 'pretoria': 'South Africa',
  'cairo': 'Egypt', 'alexandria': 'Egypt',
  'accra': 'Ghana', 'kumasi': 'Ghana',
  'kampala': 'Uganda',
  'kinshasa': 'Democratic Republic of the Congo',
  'mogadishu': 'Somalia',
  'addis ababa': 'Ethiopia',
  'kigali': 'Rwanda',
  'dar es salaam': 'Tanzania', 'arusha': 'Tanzania',
  'lusaka': 'Zambia',
  'harare': 'Zimbabwe',
  'maputo': 'Mozambique',
  'luanda': 'Angola',
  'dakar': 'Senegal',
  'abidjan': "Cote d'Ivoire",
  'casablanca': 'Morocco', 'rabat': 'Morocco',
  'tunis': 'Tunisia',
  'tripoli': 'Libya',
  'khartoum': 'Sudan',
  'juba': 'South Sudan',
  'bamako': 'Mali',
  'ouagadougou': 'Burkina Faso',
  'niamey': 'Niger',
  'yaounde': 'Cameroon', 'douala': 'Cameroon',
  'libreville': 'Gabon',
  'windhoek': 'Namibia',
  'gaborone': 'Botswana',
  'antananarivo': 'Madagascar',
  'lome': 'Togo',
  'cotonou': 'Benin',
  'conakry': 'Guinea',
  'freetown': 'Sierra Leone',
  'monrovia': 'Liberia',
  // Middle East
  'dubai': 'United Arab Emirates', 'abu dhabi': 'United Arab Emirates', 'sharjah': 'United Arab Emirates',
  'riyadh': 'Saudi Arabia', 'jeddah': 'Saudi Arabia',
  'doha': 'Qatar',
  'kuwait city': 'Kuwait',
  'muscat': 'Oman',
  'amman': 'Jordan',
  'beirut': 'Lebanon',
  'tel aviv': 'Israel', 'jerusalem': 'Israel',
  'baghdad': 'Iraq',
  'tehran': 'Iran',
  'manama': 'Bahrain',
  'istanbul': 'Turkey', 'ankara': 'Turkey',
  // Europe
  'london': 'United Kingdom', 'manchester': 'United Kingdom', 'edinburgh': 'United Kingdom',
  'paris': 'France', 'lyon': 'France',
  'berlin': 'Germany', 'frankfurt': 'Germany', 'munich': 'Germany', 'hamburg': 'Germany',
  'amsterdam': 'Netherlands',
  'brussels': 'Belgium',
  'rome': 'Italy', 'milan': 'Italy',
  'madrid': 'Spain', 'barcelona': 'Spain',
  'zurich': 'Switzerland', 'geneva': 'Switzerland',
  'vienna': 'Austria',
  'stockholm': 'Sweden',
  'oslo': 'Norway',
  'copenhagen': 'Denmark',
  'helsinki': 'Finland',
  'warsaw': 'Poland',
  'budapest': 'Hungary',
  'prague': 'Czech Republic',
  'athens': 'Greece',
  'lisbon': 'Portugal',
  'moscow': 'Russia', 'kyiv': 'Ukraine',
  // Americas
  'new york': 'United States', 'los angeles': 'United States', 'chicago': 'United States',
  'miami': 'United States', 'washington': 'United States', 'houston': 'United States',
  'san francisco': 'United States', 'dallas': 'United States', 'atlanta': 'United States',
  'toronto': 'Canada', 'vancouver': 'Canada', 'montreal': 'Canada',
  'sao paulo': 'Brazil', 'rio de janeiro': 'Brazil',
  'buenos aires': 'Argentina',
  'bogota': 'Colombia',
  'lima': 'Peru',
  'santiago': 'Chile',
  'mexico city': 'Mexico',
  // Asia-Pacific
  'singapore': 'Singapore',
  'hong kong': 'Hong Kong',
  'tokyo': 'Japan', 'osaka': 'Japan',
  'beijing': 'China', 'shanghai': 'China', 'guangzhou': 'China', 'shenzhen': 'China',
  'mumbai': 'India', 'delhi': 'India', 'new delhi': 'India', 'bangalore': 'India', 'chennai': 'India',
  'bangkok': 'Thailand',
  'kuala lumpur': 'Malaysia',
  'jakarta': 'Indonesia',
  'manila': 'Philippines',
  'sydney': 'Australia', 'melbourne': 'Australia', 'brisbane': 'Australia',
  'auckland': 'New Zealand',
  'seoul': 'South Korea',
  'taipei': 'Taiwan',
  'colombo': 'Sri Lanka',
  'dhaka': 'Bangladesh',
  'karachi': 'Pakistan', 'islamabad': 'Pakistan',
  'kabul': 'Afghanistan',
}

/**
 * Map a city name to its country. Falls back to the input if not found.
 */
export function cityToCountry(city) {
  if (!city) return null
  const lower = city.toLowerCase().trim()
  return CITY_TO_COUNTRY[lower] ?? null
}

/**
 * Return the country for a destination, using city map or falling back to the value itself.
 */
export function resolveCountry(destination) {
  if (!destination) return null
  return cityToCountry(destination) ?? destination.trim()
}
