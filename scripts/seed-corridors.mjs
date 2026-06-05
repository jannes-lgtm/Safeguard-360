/**
 * scripts/seed-corridors.mjs
 *
 * Bulk-inserts new traffic corridors into Supabase.
 * Run: node --env-file=.env scripts/seed-corridors.mjs
 *
 * Regions: Zambia Copperbelt, DRC Copperbelt, Sudan, Chad, Morocco
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ equivalents).')
  process.exit(1)
}

const supabase = createClient(url, key)

const corridors = [

  // ── Zambia ──────────────────────────────────────────────────────────────────
  {
    name: 'Lusaka → Ndola', country: 'Zambia', region: 'Copperbelt',
    origin_name: 'Lusaka',      origin_lat:  -15.4167, origin_lon: 28.2833,
    dest_name:   'Ndola',       dest_lat:    -12.9587, dest_lon:   28.6366,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Ndola → Kitwe', country: 'Zambia', region: 'Copperbelt',
    origin_name: 'Ndola',       origin_lat:  -12.9587, origin_lon: 28.6366,
    dest_name:   'Kitwe',       dest_lat:    -12.8024, dest_lon:   28.2132,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Kitwe → Chingola', country: 'Zambia', region: 'Copperbelt',
    origin_name: 'Kitwe',       origin_lat:  -12.8024, origin_lon: 28.2132,
    dest_name:   'Chingola',    dest_lat:    -12.5333, dest_lon:   27.8667,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Ndola → Solwezi', country: 'Zambia', region: 'Copperbelt',
    origin_name: 'Ndola',       origin_lat:  -12.9587, origin_lon: 28.6366,
    dest_name:   'Solwezi',     dest_lat:    -12.1833, dest_lon:   26.3833,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Lusaka → Livingstone', country: 'Zambia', region: 'Southern Zambia',
    origin_name: 'Lusaka',      origin_lat:  -15.4167, origin_lon: 28.2833,
    dest_name:   'Livingstone', dest_lat:    -17.8667, dest_lon:   25.8500,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Lusaka → Chipata', country: 'Zambia', region: 'Eastern Zambia',
    origin_name: 'Lusaka',      origin_lat:  -15.4167, origin_lon: 28.2833,
    dest_name:   'Chipata',     dest_lat:    -13.6444, dest_lon:   32.6511,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Lusaka → Kasumbalesa (Border)', country: 'Zambia', region: 'Copperbelt',
    origin_name: 'Lusaka',          origin_lat:  -15.4167, origin_lon: 28.2833,
    dest_name:   'Kasumbalesa',     dest_lat:    -11.7833, dest_lon:   27.8000,
    route_type: 'border', is_active: true,
  },

  // ── DRC Copperbelt ──────────────────────────────────────────────────────────
  {
    name: 'Lubumbashi → Kolwezi', country: 'Democratic Republic of Congo', region: 'Copperbelt',
    origin_name: 'Lubumbashi',  origin_lat:  -11.6609, origin_lon: 27.4794,
    dest_name:   'Kolwezi',     dest_lat:    -10.7167, dest_lon:   25.4667,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Lubumbashi → Likasi', country: 'Democratic Republic of Congo', region: 'Copperbelt',
    origin_name: 'Lubumbashi',  origin_lat:  -11.6609, origin_lon: 27.4794,
    dest_name:   'Likasi',      dest_lat:    -10.9833, dest_lon:   26.7333,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Likasi → Kolwezi', country: 'Democratic Republic of Congo', region: 'Copperbelt',
    origin_name: 'Likasi',      origin_lat:  -10.9833, origin_lon: 26.7333,
    dest_name:   'Kolwezi',     dest_lat:    -10.7167, dest_lon:   25.4667,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Kolwezi → Fungurume', country: 'Democratic Republic of Congo', region: 'Copperbelt',
    origin_name: 'Kolwezi',     origin_lat:  -10.7167, origin_lon: 25.4667,
    dest_name:   'Fungurume',   dest_lat:    -10.5833, dest_lon:   26.3333,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Lubumbashi → Kasumbalesa (Border)', country: 'Democratic Republic of Congo', region: 'Copperbelt',
    origin_name: 'Lubumbashi',  origin_lat:  -11.6609, origin_lon: 27.4794,
    dest_name:   'Kasumbalesa', dest_lat:    -11.7833, dest_lon:   27.8000,
    route_type: 'border', is_active: true,
  },
  {
    name: 'Lubumbashi → Mbuji-Mayi', country: 'Democratic Republic of Congo', region: 'DRC Mining Corridor',
    origin_name: 'Lubumbashi',  origin_lat:  -11.6609, origin_lon: 27.4794,
    dest_name:   'Mbuji-Mayi',  dest_lat:     -6.1500, dest_lon:   23.6000,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Kinshasa → Matadi', country: 'Democratic Republic of Congo', region: 'DRC West',
    origin_name: 'Kinshasa',    origin_lat:   -4.4419, origin_lon: 15.2663,
    dest_name:   'Matadi',      dest_lat:     -5.8167, dest_lon:   13.4500,
    route_type: 'highway', is_active: true,
  },

  // ── Sudan ───────────────────────────────────────────────────────────────────
  {
    name: 'Khartoum → Port Sudan', country: 'Sudan', region: 'Eastern Sudan',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'Port Sudan',  dest_lat:    19.6158, dest_lon:   37.2164,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Khartoum → Kassala', country: 'Sudan', region: 'Eastern Sudan',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'Kassala',     dest_lat:    15.4500, dest_lon:   36.4000,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Khartoum → Wad Madani', country: 'Sudan', region: 'Central Sudan',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'Wad Madani',  dest_lat:    14.4028, dest_lon:   33.5194,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Khartoum → El Obeid', country: 'Sudan', region: 'Central Sudan',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'El Obeid',    dest_lat:    13.1803, dest_lon:   30.2178,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Port Sudan → Kassala', country: 'Sudan', region: 'Eastern Sudan',
    origin_name: 'Port Sudan',  origin_lat:  19.6158, origin_lon: 37.2164,
    dest_name:   'Kassala',     dest_lat:    15.4500, dest_lon:   36.4000,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Khartoum → Omdurman', country: 'Sudan', region: 'Khartoum Metro',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'Omdurman',    dest_lat:    15.6452, dest_lon:   32.4881,
    route_type: 'urban', is_active: true,
  },
  {
    name: 'Khartoum → Nyala', country: 'Sudan', region: 'Darfur',
    origin_name: 'Khartoum',    origin_lat:  15.5007, origin_lon: 32.5599,
    dest_name:   'Nyala',       dest_lat:    12.0490, dest_lon:   24.8816,
    route_type: 'highway', is_active: true,
  },

  // ── Chad ────────────────────────────────────────────────────────────────────
  {
    name: "N'Djamena → Moundou", country: 'Chad', region: 'Southern Chad',
    origin_name: "N'Djamena",   origin_lat:  12.1348, origin_lon: 15.0557,
    dest_name:   'Moundou',     dest_lat:     8.5667, dest_lon:   16.0833,
    route_type: 'highway', is_active: true,
  },
  {
    name: "N'Djamena → Sarh", country: 'Chad', region: 'Southern Chad',
    origin_name: "N'Djamena",   origin_lat:  12.1348, origin_lon: 15.0557,
    dest_name:   'Sarh',        dest_lat:     9.1445, dest_lon:   18.3910,
    route_type: 'highway', is_active: true,
  },
  {
    name: "N'Djamena → Abéché", country: 'Chad', region: 'Eastern Chad',
    origin_name: "N'Djamena",   origin_lat:  12.1348, origin_lon: 15.0557,
    dest_name:   'Abéché',      dest_lat:    13.8292, dest_lon:   20.8324,
    route_type: 'highway', is_active: true,
  },
  {
    name: "N'Djamena → Bongor", country: 'Chad', region: 'Southern Chad',
    origin_name: "N'Djamena",   origin_lat:  12.1348, origin_lon: 15.0557,
    dest_name:   'Bongor',      dest_lat:    10.2833, dest_lon:   15.3667,
    route_type: 'highway', is_active: true,
  },
  {
    name: "N'Djamena → Maroua (Cameroon)", country: 'Chad', region: 'Chad–Cameroon Border',
    origin_name: "N'Djamena",   origin_lat:  12.1348, origin_lon: 15.0557,
    dest_name:   'Maroua',      dest_lat:    10.5956, dest_lon:   14.3241,
    route_type: 'border', is_active: true,
  },

  // ── Morocco ─────────────────────────────────────────────────────────────────
  {
    name: 'Casablanca → Rabat', country: 'Morocco', region: 'Atlantic Corridor',
    origin_name: 'Casablanca',  origin_lat:  33.5731, origin_lon: -7.5898,
    dest_name:   'Rabat',       dest_lat:    34.0133, dest_lon:   -6.8326,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Casablanca → Marrakech', country: 'Morocco', region: 'Atlantic Corridor',
    origin_name: 'Casablanca',  origin_lat:  33.5731, origin_lon: -7.5898,
    dest_name:   'Marrakech',   dest_lat:    31.6295, dest_lon:   -7.9811,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Rabat → Tangier', country: 'Morocco', region: 'Northern Morocco',
    origin_name: 'Rabat',       origin_lat:  34.0133, origin_lon: -6.8326,
    dest_name:   'Tangier',     dest_lat:    35.7595, dest_lon:   -5.8340,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Casablanca → Fes', country: 'Morocco', region: 'Northern Morocco',
    origin_name: 'Casablanca',  origin_lat:  33.5731, origin_lon: -7.5898,
    dest_name:   'Fes',         dest_lat:    34.0181, dest_lon:   -5.0078,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Fes → Meknes', country: 'Morocco', region: 'Northern Morocco',
    origin_name: 'Fes',         origin_lat:  34.0181, origin_lon: -5.0078,
    dest_name:   'Meknes',      dest_lat:    33.8955, dest_lon:   -5.5473,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Marrakech → Agadir', country: 'Morocco', region: 'Southern Morocco',
    origin_name: 'Marrakech',   origin_lat:  31.6295, origin_lon: -7.9811,
    dest_name:   'Agadir',      dest_lat:    30.4278, dest_lon:   -9.5981,
    route_type: 'motorway', is_active: true,
  },
  {
    name: 'Tangier → Tetouan', country: 'Morocco', region: 'Northern Morocco',
    origin_name: 'Tangier',     origin_lat:  35.7595, origin_lon: -5.8340,
    dest_name:   'Tetouan',     dest_lat:    35.5785, dest_lon:   -5.3684,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Casablanca → El Jadida', country: 'Morocco', region: 'Atlantic Corridor',
    origin_name: 'Casablanca',  origin_lat:  33.5731, origin_lon: -7.5898,
    dest_name:   'El Jadida',   dest_lat:    33.2549, dest_lon:   -8.5086,
    route_type: 'highway', is_active: true,
  },

  // ── Mauritania ──────────────────────────────────────────────────────────────
  {
    name: 'Nouakchott → Nouadhibou', country: 'Mauritania', region: 'Coastal Highway',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Nouadhibou',  dest_lat:    20.9310, dest_lon:   -17.0347,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Nouakchott → Rosso (Senegal Border)', country: 'Mauritania', region: 'Southern Mauritania',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Rosso',       dest_lat:    16.5135, dest_lon:   -15.8059,
    route_type: 'border', is_active: true,
  },
  {
    name: 'Nouakchott → Kiffa', country: 'Mauritania', region: 'Eastern Mauritania',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Kiffa',       dest_lat:    16.6228, dest_lon:   -11.4060,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Nouakchott → Néma', country: 'Mauritania', region: 'Eastern Mauritania',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Néma',        dest_lat:    16.6174, dest_lon:    -7.2667,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Nouakchott → Atar', country: 'Mauritania', region: 'Northern Mauritania',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Atar',        dest_lat:    20.5169, dest_lon:   -13.0497,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Atar → Zouerate', country: 'Mauritania', region: 'Northern Mauritania',
    origin_name: 'Atar',        origin_lat:  20.5169, origin_lon: -13.0497,
    dest_name:   'Zouerate',    dest_lat:    22.7333, dest_lon:   -12.4667,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Nouakchott → Kaédi', country: 'Mauritania', region: 'Southern Mauritania',
    origin_name: 'Nouakchott',  origin_lat:  18.0735, origin_lon: -15.9582,
    dest_name:   'Kaédi',       dest_lat:    16.1500, dest_lon:   -13.5000,
    route_type: 'highway', is_active: true,
  },

  // ── Libya ───────────────────────────────────────────────────────────────────
  {
    name: 'Tripoli → Misrata', country: 'Libya', region: 'Coastal Highway',
    origin_name: 'Tripoli',     origin_lat:  32.8872, origin_lon: 13.1913,
    dest_name:   'Misrata',     dest_lat:    32.3754, dest_lon:   15.0925,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Misrata → Sirte', country: 'Libya', region: 'Coastal Highway',
    origin_name: 'Misrata',     origin_lat:  32.3754, origin_lon: 15.0925,
    dest_name:   'Sirte',       dest_lat:    31.2089, dest_lon:   16.5887,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Sirte → Benghazi', country: 'Libya', region: 'Coastal Highway',
    origin_name: 'Sirte',       origin_lat:  31.2089, origin_lon: 16.5887,
    dest_name:   'Benghazi',    dest_lat:    32.1194, dest_lon:   20.0868,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Benghazi → Tobruk', country: 'Libya', region: 'Eastern Libya',
    origin_name: 'Benghazi',    origin_lat:  32.1194, origin_lon: 20.0868,
    dest_name:   'Tobruk',      dest_lat:    32.0858, dest_lon:   23.9589,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Benghazi → Derna', country: 'Libya', region: 'Eastern Libya',
    origin_name: 'Benghazi',    origin_lat:  32.1194, origin_lon: 20.0868,
    dest_name:   'Derna',       dest_lat:    32.7570, dest_lon:   22.6440,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Tripoli → Sabha', country: 'Libya', region: 'Southern Libya',
    origin_name: 'Tripoli',     origin_lat:  32.8872, origin_lon: 13.1913,
    dest_name:   'Sabha',       dest_lat:    27.0374, dest_lon:   14.4290,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Tripoli → Zintan', country: 'Libya', region: 'Western Libya',
    origin_name: 'Tripoli',     origin_lat:  32.8872, origin_lon: 13.1913,
    dest_name:   'Zintan',      dest_lat:    31.9300, dest_lon:   12.2500,
    route_type: 'highway', is_active: true,
  },
  {
    name: 'Tripoli → Tunis (Tunisia Border)', country: 'Libya', region: 'Libya–Tunisia Border',
    origin_name: 'Tripoli',     origin_lat:  32.8872, origin_lon: 13.1913,
    dest_name:   'Tunis',       dest_lat:    36.8190, dest_lon:   10.1658,
    route_type: 'border', is_active: true,
  },
]

console.log(`Inserting ${corridors.length} corridors…`)

const { data, error } = await supabase
  .from('traffic_corridors')
  .insert(corridors)
  .select('id, name')

if (error) {
  console.error('Insert failed:', error.message)
  process.exit(1)
}

console.log(`✓ Inserted ${data.length} corridors:`)
data.forEach(c => console.log(`  [${c.id}] ${c.name}`))
