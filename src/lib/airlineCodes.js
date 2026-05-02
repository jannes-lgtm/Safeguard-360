// IATA (2-char) → ICAO (3-char) airline code map
// Focused on MEA routes + major global carriers
export const IATA_TO_ICAO = {
  // Africa & Middle East
  'EK': 'UAE', // Emirates
  'EY': 'ETD', // Etihad
  'QR': 'QTR', // Qatar Airways
  'SA': 'SAA', // South African Airways
  'ET': 'ETH', // Ethiopian Airlines
  'KQ': 'KQA', // Kenya Airways
  'MS': 'MSR', // EgyptAir
  'WB': 'RWD', // RwandAir
  'TK': 'THY', // Turkish Airlines
  'AT': 'RAM', // Royal Air Maroc
  'FZ': 'FDB', // flydubai
  'G9': 'ABY', // Air Arabia
  'SV': 'SVA', // Saudia
  'GF': 'GFA', // Gulf Air
  'ME': 'MEA', // Middle East Airlines
  'RJ': 'RJA', // Royal Jordanian
  'PW': 'PRF', // Precision Air
  'TC': 'THA', // Air Tanzania
  'UM': 'AZW', // Zimbabwe Airways
  'ZH': 'ZAM', // Zambia Airways
  // Europe
  'BA': 'BAW', // British Airways
  'LH': 'DLH', // Lufthansa
  'AF': 'AFR', // Air France
  'KL': 'KLM', // KLM
  'VS': 'VIR', // Virgin Atlantic
  'LX': 'SWR', // Swiss
  'OS': 'AUA', // Austrian
  'IB': 'IBE', // Iberia
  'FR': 'RYR', // Ryanair
  'U2': 'EZY', // easyJet
  // Americas
  'UA': 'UAL', // United
  'AA': 'AAL', // American
  'DL': 'DAL', // Delta
  'AC': 'ACA', // Air Canada
  'LA': 'LAN', // LATAM
  // Asia-Pacific
  'QF': 'QFA', // Qantas
  'SQ': 'SIA', // Singapore Airlines
  'CX': 'CPA', // Cathay Pacific
  'NH': 'ANA', // ANA
  'JL': 'JAL', // Japan Airlines
  'OZ': 'AAR', // Asiana
  'KE': 'KAL', // Korean Air
}

/**
 * Convert an IATA or mixed flight number to ICAO format.
 * e.g. "BA001" → "BAW001",  "EK202" → "UAE202"
 * Returns the original string if conversion isn't possible.
 */
export function toIcao(flightNumber) {
  if (!flightNumber) return flightNumber
  const upper = flightNumber.toUpperCase().replace(/\s/g, '')

  // Already a 3-letter ICAO prefix — return as-is
  if (/^[A-Z]{3}\d/.test(upper)) return upper

  // 2-char IATA prefix (letters, or letter+digit combos like "U2")
  const match = upper.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d+[A-Z]?)$/)
  if (match) {
    const [, prefix, number] = match
    const icaoPrefix = IATA_TO_ICAO[prefix]
    if (icaoPrefix) return `${icaoPrefix}${number}`
  }

  return upper
}

/**
 * Returns true if the flight number looks like an IATA code that we can convert.
 */
export function isKnownIata(flightNumber) {
  if (!flightNumber) return false
  const upper = flightNumber.toUpperCase().replace(/\s/g, '')
  const match = upper.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])\d/)
  if (!match) return false
  return !!IATA_TO_ICAO[match[1]] && !/^[A-Z]{3}\d/.test(upper)
}
