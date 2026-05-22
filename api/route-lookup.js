/**
 * GET /api/route-lookup?origin=Nairobi&destination=Mombasa
 * GET /api/route-lookup?originLat=...&originLon=...&destLat=...&destLon=...
 *
 * Geocodes origin + destination via HERE Geocoding, then fetches
 * traffic-aware travel times from HERE Routing v8 and Google Routes v2
 * in parallel. Returns combined result including route geometry (GeoJSON).
 */

import { adapt } from './_adapter.js'

const HERE_KEY    = () => process.env.HERE_API_KEY        || ''
const GOOGLE_KEY  = () => process.env.GOOGLE_MAPS_API_KEY || ''
const SB_URL      = () => process.env.SUPABASE_URL        || process.env.VITE_SUPABASE_URL || ''
const SB_KEY      = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

// ── Next weekday 8am departure time (for peak estimate) ───────────────────────
function nextWeekdayPeak() {
  const now = new Date()
  const day = now.getDay()
  const daysAhead = (day === 0) ? 1 : (day === 6) ? 2 : 1
  const peak = new Date(now)
  peak.setDate(now.getDate() + daysAhead)
  peak.setHours(8, 0, 0, 0)
  return peak.toISOString()
}

// ── Route bounding box (capped to avoid Overpass timeouts) ───────────────────
function routeBbox(o, d) {
  const BUFFER = 0.15
  const rawMinLat = Math.min(o.lat, d.lat) - BUFFER
  const rawMaxLat = Math.max(o.lat, d.lat) + BUFFER
  const rawMinLon = Math.min(o.lon, d.lon) - BUFFER
  const rawMaxLon = Math.max(o.lon, d.lon) + BUFFER
  const midLat = (rawMinLat + rawMaxLat) / 2
  const midLon = (rawMinLon + rawMaxLon) / 2
  const MAX = 2.0
  return {
    minLat: Math.max(rawMinLat, midLat - MAX / 2),
    maxLat: Math.min(rawMaxLat, midLat + MAX / 2),
    minLon: Math.max(rawMinLon, midLon - MAX / 2),
    maxLon: Math.min(rawMaxLon, midLon + MAX / 2),
  }
}

// ── City coordinates for proximity scoring ────────────────────────────────────
// [lat, lon] pairs — sampled against route geometry to compute event proximity
const CITY_COORDS = {
  // ── West Africa ──────────────────────────────────────────────────────────────
  'Lagos':            [ 6.5244,   3.3792], 'Abuja':            [ 9.0765,   7.3986],
  'Kano':             [12.0022,   8.5920], 'Port Harcourt':    [ 4.8156,   7.0498],
  'Kaduna':           [10.5264,   7.4380], 'Ibadan':           [ 7.3775,   3.9470],
  'Benin City':       [ 6.3350,   5.6037], 'Enugu':            [ 6.4584,   7.5464],
  'Warri':            [ 5.5167,   5.7500], 'Aba':              [ 5.1066,   7.3664],
  'Maiduguri':        [11.8311,  13.1520], 'Jos':              [ 9.8965,   8.8583],
  'Ilorin':           [ 8.5000,   4.5500], 'Akure':            [ 7.2571,   5.2058],
  'Abidjan':          [ 5.3600,  -4.0083], 'Yamoussoukro':     [ 6.8276,  -5.2893],
  'Accra':            [ 5.6037,  -0.1870], 'Kumasi':           [ 6.6884,  -1.6244],
  'Tamale':           [ 9.4035,  -0.8424], 'Lomé':             [ 6.1375,   1.2123],
  'Cotonou':          [ 6.3654,   2.4183], 'Porto-Novo':       [ 6.4969,   2.6289],
  'Conakry':          [ 9.5370, -13.6773], 'Freetown':         [ 8.4830, -13.2344],
  'Monrovia':         [ 6.2907, -10.7605], 'Bissau':           [11.8636, -15.5977],
  'Dakar':            [14.7167, -17.4677], 'Ziguinchor':       [12.5607, -16.2719],
  'Banjul':           [13.4549, -16.5790], 'Bamako':           [12.6392,  -8.0029],
  'Gao':              [16.2666,  -0.0503], 'Mopti':            [14.4943,  -4.1975],
  'Timbuktu':         [16.7666,  -3.0026], 'Ségou':            [13.4317,  -6.2676],
  'Ouagadougou':      [12.3714,  -1.5197], 'Bobo-Dioulasso':   [11.1771,  -4.2979],
  'Niamey':           [13.5137,   2.1098], 'Zinder':           [13.8070,   8.9895],
  'Agadez':           [16.9742,   7.9992], 'Maradi':           [13.5000,   7.1000],
  'Tahoua':           [14.8892,   5.2642], 'Nouakchott':       [18.0735, -15.9582],
  'Ouahigouya':       [13.5731,  -2.4284],
  // ── Central Africa ───────────────────────────────────────────────────────────
  'Yaoundé':          [ 3.8480,  11.5021], 'Douala':           [ 4.0511,   9.7679],
  'Bamenda':          [ 5.9597,   9.7085], 'Garoua':           [ 9.3017,  13.3942],
  'Maroua':           [10.5956,  14.3241], 'N\'Djamena':       [12.1348,  15.0557],
  'Sarh':             [ 9.1445,  18.3910], 'Moundou':          [ 8.5667,  16.0833],
  'Bangui':           [ 4.3612,  18.5550], 'Libreville':       [ 0.3901,   9.4544],
  'Port-Gentil':      [-0.7193,   8.7815], 'Brazzaville':      [-4.2694,  15.2712],
  'Pointe-Noire':     [-4.7692,  11.8659], 'Kinshasa':         [-4.4419,  15.2663],
  'Goma':             [-1.6796,  29.2278], 'Lubumbashi':       [-11.6609,  27.4794],
  'Bukavu':           [-2.5083,  28.8608], 'Beni':             [ 0.4907,  29.4739],
  'Butembo':          [ 0.1439,  29.2897], 'Kisangani':        [ 0.5167,  25.1906],
  'Mbuji-Mayi':       [-6.1500,  23.6000], 'Kolwezi':          [-10.7167,  25.4667],
  'Matadi':           [-5.8167,  13.4500], 'Malabo':           [ 3.7500,   8.7833],
  'São Tomé':         [ 0.3365,   6.7273],
  // ── East Africa ──────────────────────────────────────────────────────────────
  'Nairobi':          [-1.2921,  36.8219], 'Mombasa':          [-4.0435,  39.6682],
  'Kisumu':           [-0.1022,  34.7617], 'Nakuru':           [-0.3031,  36.0800],
  'Eldoret':          [ 0.5143,  35.2698], 'Garissa':          [-0.4536,  39.6401],
  'Addis Ababa':      [ 9.1450,  40.4897], 'Dire Dawa':        [ 9.5930,  41.8661],
  'Mekelle':          [13.4967,  39.4753], 'Gondar':           [12.6000,  37.4667],
  'Bahir Dar':        [11.5742,  37.3614], 'Hawassa':          [ 7.0621,  38.4761],
  'Jimma':            [ 7.6767,  36.8347], 'Jijiga':           [ 9.3500,  42.7833],
  'Khartoum':         [15.5007,  32.5599], 'Omdurman':         [15.6452,  32.4881],
  'Port Sudan':       [19.6158,  37.2164], 'El Fasher':        [13.6279,  25.3511],
  'Kassala':          [15.4500,  36.4000], 'Nyala':            [12.0490,  24.8816],
  'El Geneina':       [13.4500,  22.4500], 'Wau':              [ 7.7000,  28.0000],
  'Juba':             [ 4.8517,  31.5825], 'Malakal':          [ 9.5333,  31.6583],
  'Asmara':           [15.3381,  38.9317], 'Massawa':          [15.6092,  39.4499],
  'Djibouti City':    [11.5720,  43.1456], 'Kampala':          [ 0.3476,  32.5825],
  'Entebbe':          [ 0.0512,  32.4637], 'Gulu':             [ 2.7749,  32.2990],
  'Jinja':            [ 0.4500,  33.2000], 'Mbarara':          [-0.6167,  30.6500],
  'Lira':             [ 2.2492,  32.8998], 'Kigali':           [-1.9441,  30.0619],
  'Gisenyi':          [-1.7003,  29.2561], 'Bujumbura':        [-3.3869,  29.3619],
  'Gitega':           [-3.4264,  29.9306], 'Dar es Salaam':    [-6.7924,  39.2083],
  'Dodoma':           [-6.1630,  35.7516], 'Arusha':           [-3.3869,  36.6830],
  'Zanzibar':         [-6.1659,  39.2026], 'Mwanza':           [-2.5167,  32.9000],
  'Tanga':            [-5.0686,  39.0988], 'Mbeya':            [-8.9000,  33.4500],
  'Mogadishu':        [ 2.0469,  45.3182], 'Hargeisa':         [ 9.5607,  44.0650],
  'Kismayo':          [-0.3582,  42.5454], 'Bosasso':          [11.2750,  49.1833],
  'Garowe':           [ 8.4054,  48.4845],
  // ── Southern Africa ──────────────────────────────────────────────────────────
  'Johannesburg':     [-26.2041,  28.0473], 'Cape Town':        [-33.9249,  18.4241],
  'Pretoria':         [-25.7479,  28.2293], 'Durban':           [-29.8587,  31.0218],
  'Port Elizabeth':   [-33.9608,  25.5936], 'Bloemfontein':     [-29.1186,  26.2140],
  'East London':      [-33.0153,  27.9116], 'Nelspruit':        [-25.4745,  30.9703],
  'Polokwane':        [-23.9045,  29.4688], 'Pietermaritzburg': [-29.6006,  30.3794],
  'Rustenburg':       [-25.6667,  27.2500], 'Kimberley':        [-28.7282,  24.7499],
  'Maputo':           [-25.9692,  32.5732], 'Beira':            [-19.8437,  34.8389],
  'Nampula':          [-15.1165,  39.2666], 'Pemba':            [-12.9716,  40.5176],
  'Quelimane':        [-17.8787,  36.8883], 'Tete':             [-16.1564,  33.5867],
  'Harare':           [-17.8252,  31.0335], 'Bulawayo':         [-20.1500,  28.5833],
  'Mutare':           [-18.9707,  32.6709], 'Lusaka':           [-15.4167,  28.2833],
  'Ndola':            [-12.9587,  28.6366], 'Kitwe':            [-12.8024,  28.2132],
  'Livingstone':      [-17.8667,  25.8500], 'Lilongwe':         [-13.9669,  33.7873],
  'Blantyre':         [-15.7861,  35.0058], 'Mzuzu':            [-11.4667,  34.0167],
  'Gaborone':         [-24.6282,  25.9231], 'Francistown':      [-21.1667,  27.5167],
  'Windhoek':         [-22.5597,  17.0832], 'Walvis Bay':       [-22.9575,  14.5053],
  'Maseru':           [-29.3167,  27.4833], 'Mbabane':          [-26.3167,  31.1333],
  'Manzini':          [-26.4833,  31.3667], 'Antananarivo':     [-18.9137,  47.5361],
  'Toamasina':        [-18.1492,  49.4023], 'Fianarantsoa':     [-21.4531,  47.0856],
  'Luanda':           [ -8.8390,  13.2894], 'Huambo':           [-12.7756,  15.7390],
  'Lobito':           [-12.3560,  13.5494], 'Lubango':          [-14.9167,  13.5000],
  'Moroni':           [-11.7022,  43.2551], 'Port Louis':       [-20.1609,  57.4977],
  'Antsiranana':      [-12.3500,  49.3000],
  // ── North Africa ─────────────────────────────────────────────────────────────
  'Cairo':            [30.0444,  31.2357], 'Alexandria':       [31.2001,  29.9187],
  'Sharm el-Sheikh':  [27.9158,  34.3300], 'Luxor':            [25.6872,  32.6396],
  'Aswan':            [24.0889,  32.8998], 'Port Said':        [31.2653,  32.3019],
  'Suez':             [29.9737,  32.5263], 'Ismailia':         [30.5965,  32.2715],
  'Tripoli':          [32.8872,  13.1913], 'Benghazi':         [32.1194,  20.0868],
  'Misrata':          [32.3754,  15.0925], 'Sirte':            [31.2089,  16.5887],
  'Sabha':            [27.0374,  14.4290], 'Tunis':            [36.8190,  10.1658],
  'Sfax':             [34.7400,  10.7600], 'Sousse':           [35.8333,  10.6333],
  'Algiers':          [36.7538,   3.0588], 'Oran':             [35.6969,  -0.6331],
  'Constantine':      [36.3650,   6.6147], 'Annaba':           [36.9000,   7.7667],
  'Casablanca':       [33.5731,  -7.5898], 'Rabat':            [34.0133,  -6.8326],
  'Marrakech':        [31.6295,  -7.9811], 'Fes':              [34.0181,  -5.0078],
  'Tangier':          [35.7595,  -5.8340], 'Agadir':           [30.4278,  -9.5981],
  // ── Middle East ──────────────────────────────────────────────────────────────
  'Beirut':           [33.8938,  35.5018], 'Tripoli (LB)':     [34.4367,  35.8497],
  'Sidon':            [33.5622,  35.3714], 'Amman':            [31.9539,  35.9106],
  'Aqaba':            [29.5267,  35.0060], 'Irbid':            [32.5333,  35.8500],
  "Sana'a":           [15.3694,  44.1910], 'Aden':             [12.7797,  45.0095],
  'Hudaydah':         [14.7981,  42.9540], 'Taiz':             [13.5781,  44.0219],
  'Marib':            [15.4690,  45.3240], 'Mukalla':          [14.5383,  49.1284],
  'Baghdad':          [33.3152,  44.3661], 'Basra':            [30.5085,  47.7804],
  'Erbil':            [36.1911,  44.0092], 'Mosul':            [36.3350,  43.1189],
  'Najaf':            [31.9942,  44.3168], 'Karbala':          [32.6136,  44.0242],
  'Kirkuk':           [35.4681,  44.3922], 'Sulaymaniyah':     [35.5573,  45.4350],
  'Damascus':         [33.5138,  36.2765], 'Aleppo':           [36.2021,  37.1343],
  'Idlib':            [35.9306,  36.6340], 'Homs':             [34.7324,  36.7137],
  'Latakia':          [35.5317,  35.7914], 'Deir ez-Zor':      [35.3350,  40.1500],
  'Raqqa':            [35.9500,  39.0167], 'Dubai':            [25.2048,  55.2708],
  'Abu Dhabi':        [24.4539,  54.3773], 'Sharjah':          [25.3463,  55.4209],
  'Riyadh':           [24.7136,  46.6753], 'Jeddah':           [21.4858,  39.1925],
  'Mecca':            [21.3891,  39.8579], 'Medina':           [24.5247,  39.5692],
  'Dammam':           [26.3927,  49.9777], 'Tabuk':            [28.3838,  36.5662],
  'Kuwait City':      [29.3697,  47.9783], 'Doha':             [25.2854,  51.5310],
  'Manama':           [26.2154,  50.5860], 'Muscat':           [23.6139,  58.5930],
  'Salalah':          [17.0151,  54.0924], 'Nizwa':            [22.9333,  57.5333],
  'Ankara':           [39.9334,  32.8597], 'Istanbul':         [41.0082,  28.9784],
  'Izmir':            [38.4237,  27.1428], 'Gaziantep':        [37.0662,  37.3833],
  'Diyarbakir':       [37.9144,  40.2306], 'Adana':            [37.0000,  35.3213],
  'Tehran':           [35.6892,  51.3890], 'Mashhad':          [36.2605,  59.6168],
  'Tabriz':           [38.0800,  46.2919], 'Ahvaz':            [31.3183,  48.6706],
  'Zahedan':          [29.4963,  60.8629], 'Isfahan':          [32.6546,  51.6680],
  'Shiraz':           [29.5918,  52.5837], 'Bandar Abbas':     [27.1832,  56.2666],
  // ── South & Central Asia ──────────────────────────────────────────────────────
  'Kabul':            [34.5553,  69.2075], 'Kandahar':         [31.6289,  65.7372],
  'Herat':            [34.3482,  62.1999], 'Mazar-i-Sharif':   [36.7097,  67.1100],
  'Jalalabad':        [34.4415,  70.4360], 'Kunduz':           [36.7285,  68.8587],
  'Islamabad':        [33.6844,  73.0479], 'Karachi':          [24.8607,  67.0011],
  'Lahore':           [31.5497,  74.3436], 'Rawalpindi':       [33.6007,  73.0679],
  'Peshawar':         [34.0151,  71.5249], 'Multan':           [30.1978,  71.4711],
  'Quetta':           [30.1798,  66.9750], 'Faisalabad':       [31.4504,  73.1350],
  'Dhaka':            [23.8103,  90.4125], 'Chittagong':       [22.3569,  91.7832],
  'Sylhet':           [24.8949,  91.8687], 'Khulna':           [22.8456,  89.5403],
  'Colombo':          [ 6.9271,  79.8612], 'Kandy':            [ 7.2906,  80.6337],
  'Kathmandu':        [27.7172,  85.3240], 'Pokhara':          [28.2096,  83.9856],
  'New Delhi':        [28.6139,  77.2090], 'Mumbai':           [19.0760,  72.8777],
  'Kolkata':          [22.5726,  88.3639], 'Chennai':          [13.0827,  80.2707],
  'Bangalore':        [12.9716,  77.5946], 'Hyderabad':        [17.3850,  78.4867],
  'Ahmedabad':        [23.0225,  72.5714], 'Pune':             [18.5204,  73.8567],
  'Surat':            [21.1702,  72.8311], 'Jaipur':           [26.9124,  75.7873],
  'Lucknow':          [26.8467,  80.9462], 'Bhopal':           [23.2599,  77.4126],
  'Almaty':           [43.2220,  76.8512], 'Astana':           [51.1694,  71.4491],
  'Shymkent':         [42.3417,  69.5901], 'Tashkent':         [41.2995,  69.2401],
  'Samarkand':        [39.6542,  66.9759], 'Namangan':         [41.0000,  71.6667],
  'Dushanbe':         [38.5598,  68.7870], 'Khujand':          [40.2833,  69.6333],
  'Bishkek':          [42.8746,  74.5698], 'Osh':              [40.5333,  72.8000],
  'Ashgabat':         [37.9601,  58.3261], 'Mary':             [37.5933,  61.8319],
  'Baku':             [40.4093,  49.8671], 'Ganja':            [40.6828,  46.3606],
  'Tbilisi':          [41.6938,  44.8015], 'Batumi':           [41.6414,  41.6417],
  'Yerevan':          [40.1872,  44.5152], 'Gyumri':           [40.7942,  43.8453],
  // ── Southeast Asia ────────────────────────────────────────────────────────────
  'Yangon':           [16.8409,  96.1735], 'Mandalay':         [21.9588,  96.0891],
  'Naypyidaw':        [19.7633,  96.0785], 'Mawlamyine':       [16.4833,  97.6333],
  'Bangkok':          [13.7563, 100.5018], 'Chiang Mai':       [18.7883,  98.9853],
  'Kuala Lumpur':     [ 3.1390, 101.6869], 'George Town':      [ 5.4141, 100.3288],
  'Johor Bahru':      [ 1.4927, 103.7414], 'Kota Kinabalu':    [ 5.9788, 116.0735],
  'Jakarta':          [-6.2088, 106.8456], 'Surabaya':         [-7.2575, 112.7521],
  'Bandung':          [-6.9147, 107.6098], 'Medan':            [ 3.5952,  98.6722],
  'Makassar':         [-5.1477, 119.4327], 'Manila':           [14.5995, 120.9842],
  'Davao':            [ 7.1907, 125.4553], 'Cebu City':        [10.3157, 123.8854],
  'Phnom Penh':       [11.5564, 104.9282], 'Siem Reap':        [13.3633, 103.8564],
  'Vientiane':        [17.9757, 102.6331], 'Luang Prabang':    [19.8833, 102.1333],
  'Hanoi':            [21.0285, 105.8542], 'Ho Chi Minh City': [10.8231, 106.6297],
  'Da Nang':          [16.0544, 108.2022], 'Hue':              [16.4637, 107.5909],
  'Singapore':        [ 1.3521, 103.8198],
  // ── Eastern Europe / Conflict Zones ──────────────────────────────────────────
  'Kyiv':             [50.4501,  30.5234], 'Kharkiv':          [49.9935,  36.2304],
  'Odessa':           [46.4825,  30.7233], 'Lviv':             [49.8397,  24.0297],
  'Zaporizhzhia':     [47.8388,  35.1396], 'Dnipro':           [48.4647,  35.0462],
  'Donetsk':          [48.0159,  37.8028], 'Mariupol':         [47.0971,  37.5428],
  'Minsk':            [53.9045,  27.5615], 'Grodno':           [53.6884,  23.8258],
  // ── Latin America ─────────────────────────────────────────────────────────────
  'Bogotá':           [ 4.7110, -74.0721], 'Medellín':         [ 6.2442, -75.5812],
  'Cali':             [ 3.4516, -76.5320], 'Barranquilla':     [10.9685, -74.7813],
  'Caracas':          [10.4806, -66.9036], 'Maracaibo':        [10.6544, -71.6120],
  'Mexico City':      [19.4326, -99.1332], 'Guadalajara':      [20.6597, -103.3496],
  'Monterrey':        [25.6866, -100.3161],'Tijuana':          [32.5149, -117.0382],
  'Port-au-Prince':   [18.5944, -72.3074], 'Cap-Haïtien':      [19.7581, -72.2040],
  'Kingston':         [17.9714, -76.7920], 'Tegucigalpa':      [14.0818, -87.2068],
  'San Salvador':     [13.6929, -89.2182], 'Guatemala City':   [14.6349, -90.5069],
  'Managua':          [12.1364, -86.2514], 'San José':         [ 9.9281, -84.0907],
  'Lima':             [-12.0464, -77.0428],'Quito':            [-0.1807, -78.4678],
  'La Paz':           [-16.5000, -68.1500],'Cochabamba':       [-17.3895, -66.1568],
  'Buenos Aires':     [-34.6037, -58.3816],'Rosario':          [-32.9442, -60.6505],
  'São Paulo':        [-23.5505, -46.6333],'Rio de Janeiro':   [-22.9068, -43.1729],
  'Brasília':         [-15.7801, -47.9292],'Recife':           [-8.0578, -34.8829],
  'Salvador':         [-12.9714, -38.5014],'Fortaleza':        [-3.7172, -38.5434],
  'Santiago':         [-33.4489, -70.6693],'Valparaíso':       [-33.0472, -71.6127],
  'Asunción':         [-25.2867, -57.6470],
  'Montevideo':       [-34.9011, -56.1645],'Guayaquil':        [-2.1894, -79.8891],
  'Cartagena':        [10.3910, -75.4794],
}

// ── Route proximity helpers ───────────────────────────────────────────────────
function distanceToRoute(lat, lon, routeCoords) {
  if (!routeCoords.length) return null
  const step = routeCoords.length > 200 ? Math.ceil(routeCoords.length / 150) : 1
  let min = Infinity
  for (let i = 0; i < routeCoords.length; i += step) {
    const d = haversine(lat, lon, routeCoords[i][1], routeCoords[i][0])
    if (d < min) min = d
  }
  return min
}

function getProximityBand(distKm) {
  if (distKm === null) return { score: 1, label: 'In Country' }
  if (distKm <= 2)     return { score: 4, label: 'On Route'   }
  if (distKm <= 10)    return { score: 3, label: 'Near Route' }
  if (distKm <= 25)    return { score: 2, label: 'Corridor'   }
  if (distKm <= 50)    return { score: 1, label: 'Area'       }
  return                      { score: 0, label: 'Peripheral' }
}

function scoreEventProximity(event, routeCoords) {
  const coords = CITY_COORDS[event.city]
  if (!coords || !routeCoords.length) {
    return { ...event, distKm: null, _lat: null, _lon: null, proximityScore: 1, proximityLabel: 'In Country' }
  }
  const [cLat, cLon] = coords
  const raw  = distanceToRoute(cLat, cLon, routeCoords)
  const dist = raw !== null ? Math.round(raw) : null
  const { score, label } = getProximityBand(dist)
  return { ...event, distKm: dist, _lat: cLat, _lon: cLon, proximityScore: score, proximityLabel: label }
}

// Event types that can directly affect movement operations
const OP_TYPES = new Set([
  'terrorism', 'kidnap_ransom', 'armed_conflict', 'civil_unrest',
  'aviation_disruption', 'border_closure', 'infrastructure',
  'weather_disaster', 'major_event', 'health_emergency',
])

function classifyOperationalImpact(event) {
  const mi = event.movement_impact

  // Platform alerts (alerts table — no event_type, text severity field)
  if (!event.event_type) {
    const sev = String(event.severity || '').toLowerCase()
    if (sev === 'critical' || sev === 'high') return 'Operationally Significant'
    if (sev === 'medium')                      return 'Monitoring'
    return 'Informational'
  }

  // Live intelligence — movement impact is the primary signal
  if (mi === 'severe' || mi === 'significant') return 'Operationally Significant'
  if (mi === 'moderate')                        return 'Monitoring'

  // High severity only actionable when the event TYPE is movement-relevant.
  // Prevents words like "critical"/"killed" in unrelated headlines (defense,
  // geopolitics) from escalating non-operational articles.
  if (OP_TYPES.has(event.event_type)) {
    if (event.severity >= 4) return 'Operationally Significant'
    if (event.severity >= 3) return 'Monitoring'
  }

  return 'Informational'
}

function computeExposureScore(events, here) {
  let score = 0
  const ratio = here?.ratio || 0
  if      (ratio >= 0.75) score += 4
  else if (ratio >= 0.40) score += 3
  else if (ratio >= 0.20) score += 2
  else if (ratio >= 0.08) score += 1

  for (const e of events) {
    const pW = e.proximityScore ?? 1
    const sW = (e.severity ?? 2) / 5
    const mW = e.movement_impact === 'severe'      ? 3
             : e.movement_impact === 'significant' ? 2
             : e.movement_impact === 'moderate'    ? 1 : 0.4
    score += pW * sW * mW * 0.35
  }

  if (score >= 8)   return { status: 'Restricted',        level: 5, color: '#991b1b' }
  if (score >= 5)   return { status: 'Elevated Exposure', level: 4, color: '#dc2626' }
  if (score >= 3)   return { status: 'Degraded',          level: 3, color: '#f97316' }
  if (score >= 1.5) return { status: 'Monitoring',        level: 2, color: '#eab308' }
  return                   { status: 'Stable',            level: 1, color: '#22c55e' }
}

function computeSafeCorridorStatus(exposure, events) {
  const hasCritical    = events.some(e => e.severity >= 4 && (e.proximityScore ?? 0) >= 3)
  const hasSignificant = events.some(e =>
    (e.movement_impact === 'severe' || e.movement_impact === 'significant') && (e.proximityScore ?? 0) >= 2
  )
  if (exposure.level >= 5)                   return { label: 'Movement Restricted',    color: '#991b1b', viable: false    }
  if (exposure.level >= 4 || hasCritical)    return { label: 'Not Recommended',        color: '#dc2626', viable: false    }
  if (exposure.level >= 3 || hasSignificant) return { label: 'Partially Viable',       color: '#f97316', viable: 'partial'}
  if (exposure.level >= 2)                   return { label: 'Viable with Monitoring', color: '#eab308', viable: true     }
  return                                            { label: 'Safe Corridor Confirmed', color: '#AACC00', viable: true     }
}

function computeRouteSegments(routeCoords, scoredEvents) {
  if (routeCoords.length < 4) return null
  const N    = Math.min(8, Math.max(3, Math.floor(routeCoords.length / 20)))
  const size = Math.ceil(routeCoords.length / N)
  const feats = []
  for (let i = 0; i < N; i++) {
    const start = i * size
    const chunk = routeCoords.slice(start, start + size + 1)
    if (chunk.length < 2) continue
    const [mLon, mLat] = chunk[Math.floor(chunk.length / 2)]
    let maxRisk = 0
    for (const e of scoredEvents) {
      if (!e._lat || !e._lon) continue
      const d = haversine(mLat, mLon, e._lat, e._lon)
      if (d > 30) continue
      const r = (e.severity ?? 1) * (e.proximityScore ?? 1) *
        (e.movement_impact === 'severe' ? 3 : e.movement_impact === 'significant' ? 2 : e.movement_impact === 'moderate' ? 1 : 0.5)
      if (r > maxRisk) maxRisk = r
    }
    const color = maxRisk >= 15 ? '#ef4444' : maxRisk >= 8 ? '#f97316' : maxRisk >= 3 ? '#eab308' : '#3b82f6'
    feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: chunk }, properties: { color, risk: Math.round(maxRisk) } })
  }
  return feats.length ? { type: 'FeatureCollection', features: feats } : null
}

function computePeakWindow(recommendations) {
  if (!recommendations?.worst?.length) return null
  const toLabel = h => {
    const s = h < 12 ? 'AM' : 'PM'
    const d = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${d}:00 ${s}`
  }
  const sorted = [...recommendations.worst].sort((a, b) => a.hour - b.hour)
  return sorted.length === 1
    ? toLabel(sorted[0].hour)
    : `${toLabel(sorted[0].hour)} – ${toLabel(sorted[sorted.length - 1].hour + 1)}`
}

// ── Supabase read helper ──────────────────────────────────────────────────────
async function sbGet(path) {
  if (!SB_URL() || !SB_KEY()) return []
  const res = await fetch(`${SB_URL()}/rest/v1/${path}`, {
    headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) return []
  return res.json()
}

// ── HERE Flexible Polyline decoder ────────────────────────────────────────────
// Decodes HERE's compact polyline encoding into GeoJSON [lon, lat] coordinate pairs.
const FP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const FP_DECODE   = Object.fromEntries([...FP_ALPHABET].map((c, i) => [c, i]))

function fpUvarint(enc, idx) {
  let result = 0, shift = 0, i = idx
  while (i < enc.length) {
    const val = FP_DECODE[enc[i++]]
    result |= (val & 0x1f) << shift
    if (!(val & 0x20)) break
    shift += 5
  }
  return { value: result, next: i }
}

function fpSigned(raw) {
  return (raw & 1) ? ~(raw >> 1) : (raw >> 1)
}

function decodeFlexPolyline(encoded) {
  if (!encoded) return null
  try {
    let idx = 0

    const ver = fpUvarint(encoded, idx)
    idx = ver.next
    if (ver.value !== 1) return null

    const hdr = fpUvarint(encoded, idx)
    idx = hdr.next
    const precision = hdr.value & 0x0f
    const thirdDim  = (hdr.value >> 4) & 0x07
    const factor    = Math.pow(10, precision)

    const coords = []
    let lat = 0, lon = 0

    while (idx < encoded.length) {
      const dLat = fpUvarint(encoded, idx); idx = dLat.next
      lat += fpSigned(dLat.value)

      const dLon = fpUvarint(encoded, idx); idx = dLon.next
      lon += fpSigned(dLon.value)

      if (thirdDim) {
        const dZ = fpUvarint(encoded, idx); idx = dZ.next
      }

      coords.push([lon / factor, lat / factor])
    }

    return coords.length ? { type: 'LineString', coordinates: coords } : null
  } catch {
    return null
  }
}

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// ── Find nearest corridor to a given origin+destination pair ──────────────────
function nearestCorridor(corridors, origin, dest) {
  let best = null, bestScore = Infinity
  for (const c of corridors) {
    const d1 = Math.min(
      haversine(origin.lat, origin.lon, c.origin_lat, c.origin_lon),
      haversine(origin.lat, origin.lon, c.dest_lat,   c.dest_lon)
    )
    const d2 = Math.min(
      haversine(dest.lat, dest.lon, c.origin_lat, c.origin_lon),
      haversine(dest.lat, dest.lon, c.dest_lat,   c.dest_lon)
    )
    const score = d1 + d2
    if (score < bestScore) { bestScore = score; best = { ...c, proximityKm: Math.round(score) } }
  }
  return best
}

// ── Build recommendations from pattern rows ───────────────────────────────────
function buildRecommendations(patterns) {
  const valid = patterns.filter(p => p.sample_count >= 2)
  if (!valid.length) return null

  const sorted = [...valid].sort((a,b) =>
    a.avg_congestion - b.avg_congestion || a.avg_delay_secs - b.avg_delay_secs
  )

  const hourLabel = h => {
    const period = h < 12 ? 'AM' : 'PM'
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${display}:00 ${period}`
  }

  const levelLabel = r => {
    if (r >= 0.75) return 'standstill'
    if (r >= 0.40) return 'heavy'
    if (r >= 0.20) return 'moderate'
    if (r >= 0.08) return 'low'
    return 'free'
  }

  const best  = sorted.slice(0, 5).map(p => ({
    day:          DAYS[p.day_of_week],
    hour:         p.hour_of_day,
    hourLabel:    hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    avgTravelSecs:p.avg_travel_secs,
    level:        levelLabel(p.avg_congestion),
    samples:      p.sample_count,
  }))

  const worst = sorted.slice(-3).reverse().map(p => ({
    day:          DAYS[p.day_of_week],
    hour:         p.hour_of_day,
    hourLabel:    hourLabel(p.hour_of_day),
    avgDelaySecs: p.avg_delay_secs,
    level:        levelLabel(p.avg_congestion),
  }))

  const grid = {}
  for (const p of valid) {
    grid[`${p.day_of_week}_${p.hour_of_day}`] = {
      congestion: p.avg_congestion,
      delay:      p.avg_delay_secs,
      samples:    p.sample_count,
    }
  }

  return { best, worst, grid, totalSamples: valid.reduce((s,p) => s + p.sample_count, 0) }
}

// ── HERE Routing: summary only with departure time ───────────────────────────
async function hereRouteSummary(origin, dest, key, departureTime) {
  const params = new URLSearchParams({
    transportMode: 'car',
    origin:        `${origin.lat},${origin.lon}`,
    destination:   `${dest.lat},${dest.lon}`,
    return:        'summary',
    apiKey:        key,
  })
  if (departureTime) params.set('departureTime', departureTime)
  const res = await fetch(`https://router.hereapi.com/v8/routes?${params}`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HERE ${res.status}`)
  const data = await res.json()
  const summary = data?.routes?.[0]?.sections?.[0]?.summary
  if (!summary) throw new Error('No summary')
  return { duration: summary.duration || 0 }
}

// ── Emergency services via Overpass API ───────────────────────────────────────
// Queries around origin AND destination cities (major cities have good OSM coverage)
// rather than the route midpoint bbox which may cross sparse rural areas.
async function queryEmergencyServicesBox(minLat, maxLat, minLon, maxLon) {
  const q = `[out:json][timeout:8];(node["amenity"~"^(hospital|police|fire_station)$"](${minLat},${minLon},${maxLat},${maxLon});way["amenity"~"^(hospital|police|fire_station)$"](${minLat},${minLon},${maxLat},${maxLon}););out center 12;`
  const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(q)}`,
    signal:  AbortSignal.timeout(10000),
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({ elements: [] }))
  return (data.elements || [])
    .map(el => ({
      type: el.tags?.amenity || 'unknown',
      name: el.tags?.name || null,
      lat:  el.lat  ?? el.center?.lat ?? null,
      lon:  el.lon  ?? el.center?.lon ?? null,
    }))
    .filter(e => e.lat && e.lon)
}

async function queryEmergencyServices(originGeo, destGeo) {
  const R = 0.35  // ~38km radius around each city center
  const boxes = [
    [originGeo.lat - R, originGeo.lat + R, originGeo.lon - R, originGeo.lon + R],
    [destGeo.lat   - R, destGeo.lat   + R, destGeo.lon   - R, destGeo.lon   + R],
  ]
  const results = await Promise.allSettled(boxes.map(([a, b, c, d]) => queryEmergencyServicesBox(a, b, c, d)))
  const seen = new Set()
  return results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(s => {
      const key = `${s.type}:${s.name || s.lat}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 12)
}

// ── Route risks from Supabase ─────────────────────────────────────────────────
async function queryRouteRisks(countries) {
  if (!countries.length || !SB_URL() || !SB_KEY()) return { intelligence: [], routeAlerts: [] }
  const list   = countries.map(c => `"${c}"`).join(',')
  const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  const [intel, alertsRes] = await Promise.allSettled([
    sbGet(`live_intelligence?country=in.(${list})&severity=gte.2&is_active=eq.true&ingested_at=gte.${cutoff}&select=event_type,country,city,severity,movement_impact,raw_title,ingested_at&order=severity.desc&limit=15`),
    sbGet(`alerts?country=in.(${list})&status=eq.active&select=title,description,severity,country,city,date_issued&order=date_issued.desc&limit=5`),
  ])
  return {
    intelligence: intel.status === 'fulfilled'     && Array.isArray(intel.value)     ? intel.value     : [],
    routeAlerts:  alertsRes.status === 'fulfilled' && Array.isArray(alertsRes.value) ? alertsRes.value : [],
  }
}

// ── HERE Geocoding v1 ─────────────────────────────────────────────────────────
async function geocode(query, key) {
  const url = `https://geocode.search.hereapi.com/v1/geocode?` +
    new URLSearchParams({ q: query, limit: 1, apiKey: key })
  const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!res.ok) throw new Error(`HERE geocode ${res.status}`)
  const data = await res.json()
  const item = data?.items?.[0]
  if (!item) throw new Error(`No geocode result for "${query}"`)
  return {
    lat:     item.position.lat,
    lon:     item.position.lng,
    label:   item.address?.label || query,
    city:    item.address?.city  || query,
    country: item.address?.countryName || '',
  }
}

// ── HERE Reverse Geocoding ────────────────────────────────────────────────────
async function reverseGeocode(lat, lon, key) {
  const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?` +
    new URLSearchParams({ at: `${lat},${lon}`, limit: 1, apiKey: key })
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
    const data = await res.json()
    const item = data?.items?.[0]
    if (!item) return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
    return {
      lat,
      lon,
      label:   item.address?.label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
      city:    item.address?.city  || item.address?.county || '',
      country: item.address?.countryName || '',
    }
  } catch {
    return { lat, lon, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, city: '', country: '' }
  }
}

// ── HERE Routing v8 ───────────────────────────────────────────────────────────
async function hereRoute(origin, dest, key) {
  const url = `https://router.hereapi.com/v8/routes?` +
    new URLSearchParams({
      transportMode:  'car',
      origin:         `${origin.lat},${origin.lon}`,
      destination:    `${dest.lat},${dest.lon}`,
      return:         'summary,typicalDuration,polyline',
      alternatives:   '2',
      apiKey:         key,
    })
  const res  = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) throw new Error(`HERE routing ${res.status}`)
  const data = await res.json()
  if (!data?.routes?.length) throw new Error('No HERE route')

  const routes = data.routes.map((r, idx) => {
    const section  = r.sections?.[0]
    const summary  = section?.summary
    if (!summary) return null

    const travel   = summary.duration     || 0
    const freeFlow = summary.baseDuration || travel
    const historic = summary.typicalDuration || freeFlow
    const delay    = Math.max(0, travel - freeFlow)
    const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0
    const geometry = decodeFlexPolyline(section?.polyline)

    return {
      index:    idx,
      travel,
      freeFlow,
      historic,
      delay,
      ratio,
      level:    congestionLevel(ratio),
      geometry,
      ok:       true,
    }
  }).filter(Boolean)

  if (!routes.length) throw new Error('No HERE route data')

  const primary = routes[0]
  return {
    ...primary,
    alternatives: routes.slice(1),
  }
}

// ── Google Routes v2 ──────────────────────────────────────────────────────────
async function googleRoute(origin, dest, key) {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin:             { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
      destination:        { location: { latLng: { latitude: dest.lat,   longitude: dest.lon   } } },
      travelMode:         'DRIVE',
      routingPreference:  'TRAFFIC_AWARE',
      departureTime:      new Date(Date.now() + 120000).toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Google Routes ${res.status}: ${body.slice(0, 300)}`)
  }
  const data  = await res.json()
  const route = data?.routes?.[0]
  if (!route) throw new Error('No Google route')

  const travel   = parseInt(route.duration,       10) || 0
  const freeFlow = parseInt(route.staticDuration, 10) || travel
  const delay    = Math.max(0, travel - freeFlow)
  const ratio    = freeFlow > 0 ? +(delay / freeFlow).toFixed(2) : 0
  const distKm   = route.distanceMeters ? Math.round(route.distanceMeters / 100) / 10 : null

  return { travel, freeFlow, delay, ratio, distKm, level: congestionLevel(ratio) }
}

// ── Shared congestion classifier ──────────────────────────────────────────────
function congestionLevel(ratio) {
  if (ratio >= 0.75) return 'standstill'
  if (ratio >= 0.40) return 'heavy'
  if (ratio >= 0.20) return 'moderate'
  if (ratio >= 0.08) return 'low'
  return 'free'
}

// ── Handler ───────────────────────────────────────────────────────────────────
async function _handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const {
    origin: originQ,
    destination: destQ,
    originLat, originLon,
    destLat, destLon,
  } = req.query || {}

  const hasOrigin = originQ || (originLat && originLon)
  const hasDest   = destQ   || (destLat   && destLon)
  if (!hasOrigin || !hasDest) {
    return res.status(400).json({ error: 'origin and destination required' })
  }

  const HERE   = HERE_KEY()
  const GOOGLE = GOOGLE_KEY()
  if (!HERE) return res.status(503).json({ error: 'HERE_API_KEY not configured' })

  try {
    // Resolve each endpoint independently — supports mixed text + coordinate inputs
    const resolveOrigin = (originLat && originLon)
      ? reverseGeocode(parseFloat(originLat), parseFloat(originLon), HERE)
      : geocode(originQ, HERE)

    const resolveDest = (destLat && destLon)
      ? reverseGeocode(parseFloat(destLat), parseFloat(destLon), HERE)
      : geocode(destQ, HERE)

    let originGeo, destGeo, corridors
    ;[originGeo, destGeo, corridors] = await Promise.all([
      resolveOrigin,
      resolveDest,
      sbGet('traffic_corridors?is_active=eq.true&select=id,name,country,origin_lat,origin_lon,dest_lat,dest_lon'),
    ])

    const nearest   = Array.isArray(corridors) ? nearestCorridor(corridors, originGeo, destGeo) : null
    const countries = [...new Set([originGeo.country, destGeo.country].filter(Boolean))]
    const bbox      = routeBbox(originGeo, destGeo)
    const yesterdayISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const peakISO      = nextWeekdayPeak()

    const [hereResult, googleResult, patterns, yesterdayRes, peakRes, routeRisksRes, emergencyRes] =
      await Promise.allSettled([
        hereRoute(originGeo, destGeo, HERE),
        GOOGLE ? googleRoute(originGeo, destGeo, GOOGLE) : Promise.resolve(null),
        nearest
          ? sbGet(`traffic_patterns?corridor_id=eq.${nearest.id}&select=day_of_week,hour_of_day,avg_congestion,avg_delay_secs,avg_travel_secs,sample_count&order=avg_congestion.asc`)
          : Promise.resolve([]),
        hereRouteSummary(originGeo, destGeo, HERE, yesterdayISO),
        hereRouteSummary(originGeo, destGeo, HERE, peakISO),
        queryRouteRisks(countries),
        queryEmergencyServices(originGeo, destGeo),
      ])

    if (hereResult.status === 'rejected') throw new Error(`HERE routing failed: ${hereResult.reason?.message}`)

    const here        = hereResult.value
    const googleError = googleResult.status === 'rejected' ? googleResult.reason?.message : null
    const google      = googleResult.status === 'fulfilled' ? googleResult.value : null
    if (googleError) console.warn('[route-lookup] Google Routes error:', googleError)
    if (yesterdayRes.status === 'rejected') console.warn('[route-lookup] Yesterday ETA:', yesterdayRes.reason?.message)
    if (peakRes.status      === 'rejected') console.warn('[route-lookup] Peak ETA:',      peakRes.reason?.message)
    if (emergencyRes.status === 'rejected') console.warn('[route-lookup] Overpass:',       emergencyRes.reason?.message)

    let consensus = here?.level ?? google?.level ?? 'unknown'
    if (here && google && here.level !== google.level) {
      const order = ['free','low','moderate','heavy','standstill']
      consensus = order[Math.max(order.indexOf(here.level), order.indexOf(google.level))]
    }

    const recommendations = Array.isArray(patterns.value) ? buildRecommendations(patterns.value) : null
    const timeEstimates   = {
      yesterday: yesterdayRes.status === 'fulfilled' ? yesterdayRes.value.duration : null,
      peak:      peakRes.status      === 'fulfilled' ? peakRes.value.duration      : null,
      freeFlow:  here?.freeFlow ?? null,
    }

    // ── Proximity-score intel events against route geometry ───────────────────
    const routeCoords  = here?.geometry?.coordinates || []
    const rawIntel     = routeRisksRes.status === 'fulfilled' ? routeRisksRes.value.intelligence : []
    const rawAlerts    = routeRisksRes.status === 'fulfilled' ? routeRisksRes.value.routeAlerts  : []

    const scoredIntel  = rawIntel
      .map(e => scoreEventProximity(e, routeCoords))
      .filter(e => e.proximityScore > 0)
      .sort((a, b) => (b.severity * b.proximityScore) - (a.severity * a.proximityScore))

    const scoredAlerts = rawAlerts.map(a => ({
      ...a, proximityScore: 1, proximityLabel: 'Alert', distKm: null, _lat: null, _lon: null,
    }))

    const allEvents   = [...scoredAlerts, ...scoredIntel]
    const exposure    = computeExposureScore(allEvents, here)
    const safeCorridor = computeSafeCorridorStatus(exposure, allEvents)
    const routeSegments = computeRouteSegments(routeCoords, scoredIntel)
    const peakWindow  = computePeakWindow(recommendations)

    // Operational alerts: proximity-filtered, movement-relevant only.
    // Platform alerts (no event_type, from alerts table) are country-scoped — keep if non-informational.
    // Live intelligence must have a known city within 25km of the route (prox >= 2).
    // This eliminates country-tagged but geographically irrelevant headlines (e.g. a SA news
    // source reporting on Palestine/Hormuz that gets stored with country='South Africa').
    const operationalAlerts = allEvents
      .filter(e => {
        const oc   = classifyOperationalImpact(e)
        const prox = e.proximityScore ?? 0
        if (oc === 'Informational') return false
        if (!e.event_type) return prox >= 1   // platform alert — country scope is sufficient
        return prox >= 2                       // live intel — must be ≤25km (Corridor or closer)
      })
      .slice(0, 5)
      .map(({ _lat, _lon, ...e }) => ({ ...e, operationalClass: classifyOperationalImpact(e) }))

    const emergencyServices = emergencyRes.status === 'fulfilled' ? emergencyRes.value : []

    return res.status(200).json({
      origin:      originGeo,
      destination: destGeo,
      here:        here   ? { ...here,   ok: true } : { ok: false },
      google:      google ? { ...google, ok: true } : { ok: false },
      consensus,
      distKm:      google?.distKm ?? null,
      nearestCorridor: nearest ? {
        id: nearest.id, name: nearest.name,
        country: nearest.country, proximityKm: nearest.proximityKm,
      } : null,
      googleError,
      recommendations,
      timeEstimates,
      exposure,
      safeCorridor,
      operationalAlerts,
      emergencyServices,
      routeSegments,
      peakWindow,
      generatedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[route-lookup]', err.message)
    return res.status(500).json({ error: err.message })
  }
}

export const handler = adapt(_handler)
export default handler
