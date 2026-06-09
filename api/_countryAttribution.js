/**
 * api/_countryAttribution.js
 *
 * Production-Grade Country Attribution Engine — Phase 2 rebuild.
 *
 * Replaces the previous substring `text.includes(alias)` matching that
 * caused catastrophic false-attribution:
 *   - "isis" matched "crisis" → every article mentioning a crisis was tagged Iraq
 *   - "mali" matched "somalia" → every Somali article was tagged Mali
 *   - "niger" matched "nigeria" → every Nigerian article was tagged Niger
 *   - "anc" matched "circumstance", "performance" etc → SA false flood
 *
 * Architecture:
 *   attributeArticle(text, candidateCountry)
 *     → { confidence, isPrimary, mentionedCountries, method, signals }
 *
 *   filterByPrimaryAttribution(articles, country, minConfidence)
 *     → articles[] where this country is the PRIMARY subject
 *
 * Confidence tiers:
 *   ≥ 0.80  STRONG   — country name in title, or unique actor match
 *   ≥ 0.60  GOOD     — country name in body + city/capital corroboration
 *   ≥ 0.45  MODERATE — country name in body only
 *   ≥ 0.25  WEAK     — secondary mention or regional signal only
 *   < 0.25  REJECT   — insufficient signal to attribute
 *
 * Primary vs Secondary:
 *   Primary  (confidence ≥ 0.45) — article is ABOUT this country
 *   Secondary (confidence ≥ 0.15) — country is MENTIONED, not the subject
 *   Only Primary countries affect CAIRO scoring and Trend indicators.
 *   Secondary countries are stored for reference only.
 *
 * Special territory handling:
 *   Gaza / West Bank / Palestinian Territories → palestine
 *   Hezbollah                                  → lebanon (primary)
 *   Hamas / Islamic Jihad                      → palestine (primary)
 *   Houthis / Ansar Allah                      → yemen (primary)
 *   IRGC / Revolutionary Guard                 → iran (primary)
 *   Al-Shabaab                                 → somalia primary, kenya/ethiopia secondary
 *   Boko Haram / ISWAP                         → nigeria primary, cameroon/niger/chad secondary
 *   M23 / ADF                                  → drc (primary)
 *   JNIM / Ansarul Islam                       → mali primary, bf/niger secondary
 *
 * Target: > 95% attribution precision across Africa and Middle East.
 */

// ── Word-boundary regex builder ───────────────────────────────────────────────
// Creates a regex that matches the term as a whole word (not as a substring).
// e.g. wb('mali') will match "Mali" but NOT "Somalia" or "anomalies"
//      wb('niger') will match "Niger" but NOT "Nigeria"
//      wb('isis') will match "ISIS" but NOT "crisis"
function wb(term) {
  // Escape regex special chars in the term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i')
}

// Compile a list of terms into a single alternation regex (all word-bounded)
function wbList(terms) {
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i')
}

// ── COUNTRY SIGNAL DEFINITIONS ────────────────────────────────────────────────
//
// Each country entry defines:
//   name:    canonical country name (used for output)
//   exact:   patterns that STRONGLY indicate this country is the primary subject
//   cities:  city names that confirm geographic location
//   actors:  unique armed groups, organizations, leaders specific to this country
//   aliases: additional name variants (still word-bounded)
//   regional: lower-confidence regional signals (adds weak score only)
//   exclude: patterns that override a match (false positive killers)
//
// IMPORTANT: all terms here are matched with word boundaries.
// Short terms that commonly appear as parts of other words are EXCLUDED.

const COUNTRY_SIGNALS = {

  // ── AFRICA: West ────────────────────────────────────────────────────────────

  nigeria: {
    name: 'Nigeria',
    exact: ['Nigeria', 'Nigerian'],
    cities: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt', 'Kaduna', 'Maiduguri', 'Ibadan', 'Benin City', 'Jos', 'Aba', 'Warri', 'Enugu'],
    actors: ['Boko Haram', 'ISWAP', 'IPOB', 'Biafra', 'Fulani', 'bandits', 'Buhari', 'Tinubu', 'EFCC', 'DSS Nigeria', 'Niger Delta'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  ghana: {
    name: 'Ghana',
    exact: ['Ghana', 'Ghanaian'],
    cities: ['Accra', 'Kumasi', 'Tamale'],
    actors: ['Mahama', 'Bawumia', 'NDC', 'NPP', 'Akufo-Addo'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  mali: {
    name: 'Mali',
    // NOTE: "mali" alone is NOT in exact because it matches "Somalia".
    // We use "Mali" (capital M context) + corroboration.
    exact: ['Mali', 'Malian'],
    cities: ['Bamako', 'Gao', 'Timbuktu', 'Kidal', 'Mopti', 'Ségou', 'Segou'],
    actors: ['JNIM', 'Wagner Mali', 'FAMA', 'Azawad', 'Tuareg', 'CMA Mali'],
    aliases: [],
    regional: ['Sahel'],   // weak signal only — shared with BF/Niger/Chad
    exclude: ['Somalia', 'Somali'],  // anti-pattern: if "Somalia" appears, don't claim Mali match from "mali" substring
  },

  'burkina faso': {
    name: 'Burkina Faso',
    exact: ['Burkina Faso', 'Burkinabe', 'Burkinabè'],
    cities: ['Ouagadougou', 'Bobo-Dioulasso', 'Ouahigouya'],
    actors: ['Ansarul Islam', 'JNIM', 'Traore', 'Ibrahim Traore', 'MPSR'],
    aliases: ['Burkina'],
    regional: ['Sahel'],
    exclude: [],
  },

  niger: {
    name: 'Niger',
    // CRITICAL: "niger" alone matches "nigeria". Use word boundary + exclude Nigeria.
    exact: ['Niger', 'Nigerien'],
    cities: ['Niamey', 'Zinder', 'Agadez', 'Maradi', 'Tahoua'],
    actors: ['CNSP', 'Tchiani', 'Tiani', 'JNIM Niger'],
    aliases: [],
    regional: ['Sahel'],
    // If "Nigeria" or "Nigerian" appears prominently, this is likely mismatched
    exclude: ['Nigeria', 'Nigerian'],
  },

  senegal: {
    name: 'Senegal',
    exact: ['Senegal', 'Senegalese'],
    cities: ['Dakar', 'Ziguinchor', 'Saint-Louis'],
    actors: ['Faye', 'Sonko', 'PASTEF', 'MFDC', 'Casamance'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  guinea: {
    name: 'Guinea',
    exact: ['Guinea', 'Guinean'],
    cities: ['Conakry', 'Kankan', 'Kindia'],
    actors: ['CNRD', 'Mamadi Doumbouya', 'Doumbouya'],
    aliases: [],
    regional: [],
    // Exclude Guinea-Bissau and Equatorial Guinea specific terms
    exclude: ['Guinea-Bissau', 'Equatorial Guinea'],
  },

  'guinea-bissau': {
    name: 'Guinea-Bissau',
    exact: ['Guinea-Bissau', 'Guinea Bissau'],
    cities: ['Bissau'],
    actors: [],
    aliases: [],
    regional: [],
    exclude: [],
  },

  'sierra leone': {
    name: 'Sierra Leone',
    exact: ['Sierra Leone'],
    cities: ['Freetown'],
    actors: ['Bio', 'Julius Maada Bio', 'SLPP'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  liberia: {
    name: 'Liberia',
    exact: ['Liberia', 'Liberian'],
    cities: ['Monrovia'],
    actors: ['Boakai', 'Unity Party'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  'ivory coast': {
    name: 'Ivory Coast',
    exact: ["Côte d'Ivoire", "Cote d'Ivoire", 'Ivory Coast', 'Ivorian'],
    cities: ['Abidjan', 'Yamoussoukro', 'Bouaké', 'Bouake'],
    actors: ['Ouattara', 'Alassane', 'PDCI', 'FPI'],
    aliases: ["Côte d'Ivoire"],
    regional: [],
    exclude: [],
  },

  benin: {
    name: 'Benin',
    exact: ['Benin', 'Beninese'],
    cities: ['Cotonou', 'Porto-Novo', 'Parakou'],
    actors: ['Talon', 'CRIET'],
    aliases: [],
    regional: [],
    // Avoid matching "Benin City" (in Nigeria)
    exclude: ['Benin City'],
  },

  togo: {
    name: 'Togo',
    exact: ['Togo', 'Togolese'],
    cities: ['Lomé', 'Lome'],
    actors: ['Gnassingbé', 'Gnassingbe', 'Faure'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  mauritania: {
    name: 'Mauritania',
    exact: ['Mauritania', 'Mauritanian'],
    cities: ['Nouakchott', 'Nouadhibou'],
    actors: ['Ghazouani'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  // ── AFRICA: Central ─────────────────────────────────────────────────────────

  cameroon: {
    name: 'Cameroon',
    exact: ['Cameroon', 'Cameroonian'],
    cities: ['Yaoundé', 'Yaounde', 'Douala', 'Bamenda', 'Garoua', 'Maroua'],
    actors: ['Ambazonia', 'Anglophone', 'Amba Boys', 'CPDM', 'Biya', 'Paul Biya', 'NOSO'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  chad: {
    name: 'Chad',
    exact: ['Chad', 'Chadian'],
    cities: ["N'Djamena", 'Ndjamena', 'Sarh', 'Moundou', 'Abéché', 'Abeche'],
    actors: ['Déby', 'Deby', 'Idriss', 'Mahamat', 'MPS', 'FACT', 'CNT Chad'],
    aliases: [],
    regional: ['Lake Chad', 'Sahel'],
    exclude: [],
  },

  'central african republic': {
    name: 'Central African Republic',
    exact: ['Central African Republic', 'CAR', 'centrafricaine'],
    cities: ['Bangui', 'Berberati', 'Bambari'],
    actors: ['FACA', 'Wagner CAR', 'MINUSCA', 'CPC', 'Touadéra', 'Touadera', 'FPRC', 'UPC'],
    aliases: ['CAR'],
    regional: [],
    exclude: ['South African Republic', 'African Republic of'],
  },

  'democratic republic of congo': {
    name: 'Democratic Republic of Congo',
    exact: ['Democratic Republic of Congo', 'Democratic Republic of the Congo', 'DRC', 'DR Congo'],
    cities: ['Kinshasa', 'Goma', 'Lubumbashi', 'Bukavu', 'Beni', 'Butembo', 'Kisangani', 'Mbuji-Mayi', 'Bunia', 'Kolwezi'],
    actors: ['M23', 'ADF', 'FDLR', 'MONUSCO', 'Tshisekedi', 'Kivu', 'Ituri', 'Wazalendo', 'Red Tabara', 'Mai-Mai'],
    aliases: ['Congo-Kinshasa', 'Zaire', 'Congolese'],
    regional: [],
    // Note: must NOT match "Republic of Congo" (Brazzaville) — different country
    exclude: [],
  },

  'republic of congo': {
    name: 'Republic of Congo',
    exact: ['Republic of Congo', 'Republic of the Congo', 'Congo-Brazzaville'],
    cities: ['Brazzaville', 'Pointe-Noire'],
    actors: ['Sassou Nguesso', 'PCT'],
    aliases: ['Congo-Brazzaville'],
    regional: [],
    exclude: ['Democratic Republic', 'DRC', 'DR Congo'],
  },

  gabon: {
    name: 'Gabon',
    exact: ['Gabon', 'Gabonese'],
    cities: ['Libreville', 'Port-Gentil'],
    actors: ['CTRI', 'Nguema', 'Brice Oligui', 'PDG Gabon'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  'equatorial guinea': {
    name: 'Equatorial Guinea',
    exact: ['Equatorial Guinea'],
    cities: ['Malabo', 'Bata'],
    actors: ['Obiang', 'PDGE'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  // ── AFRICA: East ────────────────────────────────────────────────────────────

  kenya: {
    name: 'Kenya',
    exact: ['Kenya', 'Kenyan'],
    cities: ['Nairobi', 'Mombasa', 'Kisumu', 'Eldoret', 'Nakuru', 'Garissa', 'Lamu', 'Mandera'],
    actors: ['Ruto', 'Odinga', 'Jubilee Kenya', 'UDA Kenya', 'KDF', 'GSU Kenya', 'Gen Z Kenya'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  ethiopia: {
    name: 'Ethiopia',
    exact: ['Ethiopia', 'Ethiopian'],
    cities: ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Bahir Dar', 'Hawassa', 'Jimma', 'Jijiga'],
    actors: ['TPLF', 'Tigray', 'ENDF', 'Fano', 'OLA', 'Oromo Liberation Army', 'Abiy Ahmed', 'Abiy'],
    aliases: ['Addis Ababa'],
    regional: [],
    exclude: [],
  },

  somalia: {
    name: 'Somalia',
    exact: ['Somalia', 'Somali'],
    cities: ['Mogadishu', 'Hargeisa', 'Kismayo', 'Bosasso', 'Garowe', 'Baidoa', 'Beledweyne'],
    actors: ['Al-Shabaab', 'Al Shabaab', 'ATMIS', 'AMISOM', 'Somali National Army', 'SNA', 'Puntland', 'Jubaland', 'Somaliland', 'Hassan Sheikh'],
    aliases: ['Puntland', 'Jubaland', 'Somaliland'],
    regional: [],
    exclude: [],
  },

  sudan: {
    name: 'Sudan',
    exact: ['Sudan', 'Sudanese'],
    cities: ['Khartoum', 'Omdurman', 'Port Sudan', 'El Fasher', 'Kassala', 'Nyala', 'El Geneina', 'Wad Madani'],
    actors: ['SAF', 'RSF', 'Rapid Support Forces', 'Dagalo', 'Hemeti', 'Burhan', 'Darfur', 'SLA', 'JEM'],
    aliases: ['Darfur'],
    regional: [],
    // Exclude South Sudan specific
    exclude: ['South Sudan', 'Juba'],
  },

  'south sudan': {
    name: 'South Sudan',
    exact: ['South Sudan', 'South Sudanese'],
    cities: ['Juba', 'Wau', 'Malakal', 'Yambio'],
    actors: ['SPLM', 'SPLA', 'Kiir', 'Salva Kiir', 'Machar', 'Riek Machar', 'SSOMA'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  eritrea: {
    name: 'Eritrea',
    exact: ['Eritrea', 'Eritrean'],
    cities: ['Asmara', 'Massawa', 'Assab'],
    actors: ['PFDJ', 'Isaias', 'Afwerki', 'EDF'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  djibouti: {
    name: 'Djibouti',
    exact: ['Djibouti', 'Djiboutian'],
    cities: ['Djibouti City'],
    actors: ['Guelleh', 'RPP'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  uganda: {
    name: 'Uganda',
    exact: ['Uganda', 'Ugandan'],
    cities: ['Kampala', 'Entebbe', 'Gulu', 'Jinja', 'Mbarara', 'Lira'],
    actors: ['Museveni', 'Bobi Wine', 'NRM Uganda', 'LRA', 'UPDF', 'NUP Uganda'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  rwanda: {
    name: 'Rwanda',
    exact: ['Rwanda', 'Rwandan'],
    cities: ['Kigali', 'Gisenyi', 'Huye'],
    actors: ['Kagame', 'RPF', 'FDLR Rwanda', 'RDF'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  burundi: {
    name: 'Burundi',
    exact: ['Burundi', 'Burundian'],
    cities: ['Bujumbura', 'Gitega'],
    actors: ['Ndayishimiye', 'CNDD-FDD', 'Imbonerakure'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  tanzania: {
    name: 'Tanzania',
    exact: ['Tanzania', 'Tanzanian'],
    cities: ['Dar es Salaam', 'Dodoma', 'Arusha', 'Zanzibar', 'Mwanza', 'Tanga', 'Mbeya'],
    actors: ['Hassan', 'Samia Hassan', 'CCM Tanzania', 'Chadema'],
    aliases: ['Zanzibar'],
    regional: [],
    exclude: [],
  },

  // ── AFRICA: Southern ────────────────────────────────────────────────────────

  'south africa': {
    name: 'South Africa',
    exact: ['South Africa', 'South African'],
    cities: ['Johannesburg', 'Cape Town', 'Pretoria', 'Durban', 'Port Elizabeth', 'Bloemfontein', 'Soweto', 'Polokwane', 'Nelspruit'],
    actors: ['ANC', 'DA South Africa', 'EFF', 'Ramaphosa', 'Cyril Ramaphosa', 'Eskom', 'loadshedding', 'load shedding', 'Zuma', 'Jacob Zuma'],
    aliases: ['eNCA', 'SAPS', 'SANDF'],
    regional: [],
    // "ANC" as standalone word is fine now with word boundary
    // but we add extra checks: only match if additional SA signals present
    exclude: [],
    // Flag: ANC alone is weak — only raise confidence if other signals present
    weakActors: ['ANC'],
  },

  mozambique: {
    name: 'Mozambique',
    exact: ['Mozambique', 'Mozambican'],
    cities: ['Maputo', 'Beira', 'Nampula', 'Pemba', 'Quelimane', 'Tete', 'Cabo Delgado'],
    actors: ['Ansar al-Sunna', 'Al-Shabaab Mozambique', 'RENAMO', 'FRELIMO', 'Nyusi', 'Mondlane'],
    aliases: ['Cabo Delgado'],
    regional: [],
    exclude: [],
  },

  zimbabwe: {
    name: 'Zimbabwe',
    exact: ['Zimbabwe', 'Zimbabwean'],
    cities: ['Harare', 'Bulawayo', 'Mutare'],
    actors: ['Mnangagwa', 'ZANU-PF', 'CCC', 'Nelson Chamisa', 'ZEC', 'ZIMDEF'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  zambia: {
    name: 'Zambia',
    exact: ['Zambia', 'Zambian'],
    cities: ['Lusaka', 'Ndola', 'Kitwe', 'Livingstone'],
    actors: ['Hichilema', 'UPND', 'PF Zambia'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  angola: {
    name: 'Angola',
    exact: ['Angola', 'Angolan'],
    cities: ['Luanda', 'Huambo', 'Lobito', 'Lubango'],
    actors: ['Lourenço', 'João Lourenço', 'MPLA', 'UNITA Angola', 'FAA Angola'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  malawi: {
    name: 'Malawi',
    exact: ['Malawi', 'Malawian'],
    cities: ['Lilongwe', 'Blantyre', 'Mzuzu'],
    actors: ['Chakwera', 'MCP Malawi', 'UTM'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  // ── AFRICA: North ────────────────────────────────────────────────────────────

  egypt: {
    name: 'Egypt',
    exact: ['Egypt', 'Egyptian'],
    cities: ['Cairo', 'Alexandria', 'Luxor', 'Aswan', 'Sharm el-Sheikh', 'Port Said', 'Ismailia', 'Suez'],
    actors: ['Sisi', 'Al-Sisi', 'Muslim Brotherhood Egypt', 'EAF', 'SCAF Egypt'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  libya: {
    name: 'Libya',
    exact: ['Libya', 'Libyan'],
    cities: ['Tripoli', 'Benghazi', 'Misrata', 'Sirte', 'Sabha', 'Tobruk'],
    actors: ['Haftar', 'GNU Libya', 'LNA', 'GNA', 'Dbeibeh', 'Dabaiba'],
    aliases: [],
    regional: [],
    // Note: "Tripoli" also appears in Lebanon — handled by Lebanon entry
    exclude: [],
  },

  tunisia: {
    name: 'Tunisia',
    exact: ['Tunisia', 'Tunisian'],
    cities: ['Tunis', 'Sfax', 'Sousse', 'Bizerte'],
    actors: ['Saied', 'Kais Saied', 'Ennahda'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  algeria: {
    name: 'Algeria',
    exact: ['Algeria', 'Algerian'],
    cities: ['Algiers', 'Oran', 'Constantine', 'Annaba'],
    actors: ['Tebboune', 'ANP Algeria', 'FLN', 'Hirak'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  morocco: {
    name: 'Morocco',
    exact: ['Morocco', 'Moroccan'],
    cities: ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir'],
    actors: ['Mohammed VI', 'FAR Morocco', 'POLISARIO', 'Western Sahara', 'Sahrawi'],
    aliases: ['Western Sahara'],
    regional: [],
    exclude: [],
  },

  // ── MIDDLE EAST ──────────────────────────────────────────────────────────────

  lebanon: {
    name: 'Lebanon',
    exact: ['Lebanon', 'Lebanese'],
    cities: ['Beirut', 'Sidon', 'Tyre', 'Tripoli'],  // NB: "Tripoli" also in Libya
    actors: ['Hezbollah', 'Hizballah', 'Hizb Allah', 'UNIFIL', 'LAF', 'Lebanese Armed Forces', 'Amal Movement'],
    aliases: [],
    regional: [],
    // Note: Hezbollah alone is a STRONG Lebanon signal
    exclude: [],
  },

  syria: {
    name: 'Syria',
    exact: ['Syria', 'Syrian'],
    cities: ['Damascus', 'Aleppo', 'Idlib', 'Homs', 'Latakia', 'Deir ez-Zor', 'Raqqa', 'Kobane', 'Qamishli'],
    actors: ['HTS', 'Hayat Tahrir al-Sham', 'SDF', 'SDG Syria', 'SAA', 'Assad', 'al-Assad', 'Jolani', 'al-Jolani'],
    aliases: ['Syrian civil war', 'Syrian conflict'],
    regional: [],
    // CRITICAL: Gaza is NOT Syria. Explicitly exclude Gaza/West Bank from Syria attribution
    exclude: ['Gaza', 'West Bank', 'Gaza Strip', 'Palestinian territories'],
  },

  iraq: {
    name: 'Iraq',
    exact: ['Iraq', 'Iraqi'],
    cities: ['Baghdad', 'Basra', 'Erbil', 'Mosul', 'Najaf', 'Karbala', 'Kirkuk', 'Sulaymaniyah', 'Tikrit', 'Fallujah'],
    actors: ['PMU', 'Popular Mobilization Units', 'Hashd', 'Peshmerga', 'KRG', 'Kurdistan Regional Government', 'Sudani', 'Mohammed Shia al-Sudani'],
    aliases: ['Kurdistan Iraq', 'Iraqi Kurdistan'],
    regional: [],
    // CRITICAL: "isis" alone NOT here. "crisis" would have matched otherwise.
    // "ISIL"/"ISIS" as standalone words are allowed via actors:
    actors2: ['Islamic State Iraq', 'ISIS Iraq', 'ISIL Iraq'],  // only match when Iraq context confirmed
    exclude: [],
  },

  iran: {
    name: 'Iran',
    exact: ['Iran', 'Iranian'],
    cities: ['Tehran', 'Mashhad', 'Tabriz', 'Ahvaz', 'Zahedan', 'Isfahan', 'Shiraz', 'Bandar Abbas'],
    actors: ['IRGC', 'Islamic Revolutionary Guard', 'Quds Force', 'Khamenei', 'Khomeini', 'Raisi', 'Pezeshkian', 'Rouhani'],
    aliases: ['Persian'],
    regional: [],
    exclude: [],
  },

  yemen: {
    name: 'Yemen',
    exact: ['Yemen', 'Yemeni'],
    cities: ["Sana'a", 'Sanaa', 'Aden', 'Hudaydah', 'Taiz', 'Marib', 'Mukalla', 'Hodeidah'],
    actors: ['Houthis', 'Houthi', 'Ansar Allah', 'Ansarallah', 'Abdulmalik al-Houthi'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  israel: {
    name: 'Israel',
    exact: ['Israel', 'Israeli'],
    cities: ['Tel Aviv', 'Jerusalem', 'Haifa', 'Beer Sheva', 'Netanya'],
    actors: ['IDF', 'Israel Defense Forces', 'Mossad', 'Netanyahu', 'Gantz', 'Knesset', 'Iron Dome'],
    aliases: [],
    regional: [],
    // IMPORTANT: Hamas, Gaza, Rafah → attribute to Palestine, not Israel (unless explicitly "Israeli")
    // IDF IS an Israel signal even when operating in Gaza
    exclude: [],
  },

  palestine: {
    name: 'Palestine',
    exact: ['Palestine', 'Palestinian', 'Gaza Strip', 'West Bank', 'Gaza City', 'Rafah', 'Khan Younis'],
    cities: ['Gaza', 'Ramallah', 'Nablus', 'Hebron', 'Jenin', 'Rafah', 'Khan Younis', 'Jabalia'],
    actors: ['Hamas', 'Islamic Jihad', 'Fatah', 'PA', 'Palestinian Authority', 'UNRWA', 'Abbas', 'Sinwar', 'Haniyeh'],
    aliases: ['occupied territories', 'occupied Palestinian', 'West Bank settlements'],
    regional: [],
    exclude: [],
  },

  jordan: {
    name: 'Jordan',
    exact: ['Jordan', 'Jordanian'],
    cities: ['Amman', 'Aqaba', 'Irbid', 'Zarqa'],
    actors: ['Abdullah', 'King Abdullah', 'JAF', 'Jordanian Armed Forces', 'GID Jordan'],
    aliases: [],
    regional: [],
    // "Jordan" also appears as a personal name — require additional signals if only a name match
    exclude: [],
    nameAmbiguous: true,  // flag that country name appears as personal name
  },

  saudi_arabia: {
    name: 'Saudi Arabia',
    exact: ['Saudi Arabia', 'Saudi', 'Saudis'],
    cities: ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Tabuk', 'NEOM'],
    actors: ['MBS', 'Mohammed bin Salman', 'Crown Prince', 'ARAMCO', 'Saudi Aramco', 'Houthi attack Saudi', 'Vision 2030'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  uae: {
    name: 'UAE',
    exact: ['United Arab Emirates', 'UAE', 'Emirati'],
    cities: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Fujairah'],
    actors: ['MBZ', 'Sheikh Mohammed', 'ADNOC', 'UAE Armed Forces', 'EDGE UAE'],
    aliases: ['Emirates'],
    regional: [],
    exclude: [],
  },

  kuwait: {
    name: 'Kuwait',
    exact: ['Kuwait', 'Kuwaiti'],
    cities: ['Kuwait City'],
    actors: ['Emir Kuwait', 'KOC', 'KUNA'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  qatar: {
    name: 'Qatar',
    exact: ['Qatar', 'Qatari'],
    cities: ['Doha'],
    actors: ['Al Thani', 'QNA', 'Qatar Armed Forces', 'QIA'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  bahrain: {
    name: 'Bahrain',
    exact: ['Bahrain', 'Bahraini'],
    cities: ['Manama'],
    actors: ['Al Khalifa', 'BDF Bahrain', 'NSA Bahrain'],
    aliases: [],
    regional: [],
    exclude: [],
  },

  oman: {
    name: 'Oman',
    exact: ['Oman', 'Omani'],
    cities: ['Muscat', 'Salalah', 'Nizwa'],
    actors: ['Sultan Haitham', 'RAF Oman', 'SAF Oman'],
    aliases: [],
    regional: [],
    exclude: [],
  },
}

// ── Special territory normalizations ──────────────────────────────────────────
// Maps article-level entity to canonical country in our system.
// When these signals appear, override attribution to specified country.
const TERRITORY_OVERRIDES = [
  // Palestinian territories → palestine
  { patterns: [/\bGaza\b/i, /\bGaza Strip\b/i, /\bGaza City\b/i, /\bRafah\b/i, /\bKhan Younis\b/i, /\bJabalia\b/i], country: 'palestine', confidence: 0.85 },
  { patterns: [/\bWest Bank\b/i, /\bRamallah\b/i, /\bNablus\b/i, /\bJenin\b/i, /\bHebron\b/i], country: 'palestine', confidence: 0.80 },
  { patterns: [/\bHamas\b/i, /\bIslamic Jihad\b/i, /\bPIJ\b/i], country: 'palestine', confidence: 0.80 },
  { patterns: [/\bUNRWA\b/i], country: 'palestine', confidence: 0.70 },

  // Hezbollah → Lebanon
  { patterns: [/\bHezbollah\b/i, /\bHizballah\b/i, /\bHizb Allah\b/i, /\bHizbullah\b/i], country: 'lebanon', confidence: 0.85 },

  // Houthis → Yemen
  { patterns: [/\bHouthis?\b/i, /\bHouthi\b/i, /\bAnsar Allah\b/i, /\bAnsarallah\b/i], country: 'yemen', confidence: 0.85 },

  // IRGC → Iran
  { patterns: [/\bIRGC\b/i, /\bIslamic Revolutionary Guard\b/i, /\bQuds Force\b/i], country: 'iran', confidence: 0.85 },

  // Al-Shabaab → Somalia
  { patterns: [/\bAl-Shabaab\b/i, /\bAl Shabaab\b/i, /\bASM\b/i, /\bATMIS\b/i], country: 'somalia', confidence: 0.80 },

  // Boko Haram / ISWAP → Nigeria
  { patterns: [/\bBoko Haram\b/i, /\bISWAP\b/i], country: 'nigeria', confidence: 0.80 },

  // M23 → DRC
  { patterns: [/\bM23\b/i, /\bADF\b/i, /\bMONUSCO\b/i], country: 'democratic republic of congo', confidence: 0.80 },

  // JNIM → Mali
  { patterns: [/\bJNIM\b/i, /\bJamaat Nusrat al-Islam\b/i], country: 'mali', confidence: 0.80 },

  // RSF → Sudan
  { patterns: [/\bRSF\b/i, /\bRapid Support Forces\b/i, /\bHemeti\b/i], country: 'sudan', confidence: 0.85 },

  // Wagner (context-dependent — multiple African countries, lower confidence)
  { patterns: [/\bWagner\b/i], country: null, confidence: 0.0 },  // null = context needed
]

// ── Compile patterns once at module load ──────────────────────────────────────
// Builds optimized regex patterns from the COUNTRY_SIGNALS definitions
const _compiled = {}

for (const [key, entry] of Object.entries(COUNTRY_SIGNALS)) {
  _compiled[key] = {
    name: entry.name,
    // Exact name patterns (strong signal)
    exactRe: entry.exact.length ? wbList(entry.exact) : null,
    // City patterns (medium signal)
    cityRe: entry.cities.length ? wbList(entry.cities) : null,
    // Actor patterns (strong signal for unique organizations/leaders)
    actorRe: entry.actors.length ? wbList(entry.actors) : null,
    // Alias patterns (medium signal)
    aliasRe: entry.aliases?.length ? wbList(entry.aliases) : null,
    // Regional patterns (weak signal)
    regionalRe: entry.regional?.length ? wbList(entry.regional) : null,
    // Exclusion patterns (these kill a false match)
    excludeRe: entry.exclude?.length ? wbList(entry.exclude) : null,
    // Weak actors that need corroboration
    weakActorRe: entry.weakActors?.length ? wbList(entry.weakActors) : null,
    // Name-ambiguous flag (like Jordan which is also a personal name)
    nameAmbiguous: entry.nameAmbiguous || false,
  }
}

// ── Extract article text fields ────────────────────────────────────────────────
function extractText(article) {
  const title   = (article.title || '').trim()
  const summary = (article.summary || article.description || '').trim()
  const full    = `${title} ${summary}`.trim()
  return { title, summary, full }
}

// ── Core attribution function ─────────────────────────────────────────────────
/**
 * Scores how strongly an article is attributed to a given country.
 *
 * @param {string} title    — article title
 * @param {string} body     — article summary/description
 * @param {string} countryKey — lowercase country key (e.g. 'iraq', 'south africa')
 * @returns {{ confidence: number, signals: string[], method: string }}
 */
export function scoreArticleForCountry(title, body, countryKey) {
  const key = countryKey.toLowerCase().trim()
  const c   = _compiled[key]
  if (!c) return { confidence: 0, signals: [], method: 'no_definition' }

  const titleLower = title.toLowerCase()
  const bodyLower  = body.toLowerCase()
  const fullLower  = `${titleLower} ${bodyLower}`

  const signals = []
  let score = 0

  // ── Exclusion check (hard override) ───────────────────────────────────────
  // If an exclusion pattern is present, this article is NOT about this country.
  if (c.excludeRe && c.excludeRe.test(fullLower)) {
    // Check if exclusion appears in a dominant way (not just a passing mention)
    const excludeInTitle = c.excludeRe.test(titleLower)
    if (excludeInTitle) {
      return { confidence: 0, signals: ['EXCLUDED:title'], method: 'excluded' }
    }
    // If exclusion only in body but country name in title, still valid
    // (e.g. "Iraq article" mentioning "Nigeria" in passing — still Iraq)
    if (!c.exactRe?.test(titleLower)) {
      return { confidence: 0, signals: ['EXCLUDED:body'], method: 'excluded' }
    }
  }

  // ── Exact name match ───────────────────────────────────────────────────────
  if (c.exactRe) {
    const inTitle = c.exactRe.test(titleLower)
    const inBody  = c.exactRe.test(bodyLower)

    if (inTitle) {
      score += 0.70
      signals.push('exact:title')
    }
    if (inBody && !inTitle) {
      score += 0.45
      signals.push('exact:body')
    }
    if (inBody && inTitle) {
      score += 0.10  // bonus for both
      signals.push('exact:both')
    }

    // Name-ambiguous countries (like Jordan) need corroboration
    if (c.nameAmbiguous && inTitle && !c.cityRe?.test(fullLower) && !c.actorRe?.test(fullLower)) {
      score -= 0.25  // penalty without corroboration
      signals.push('ambiguous:name_only')
    }
  }

  // ── City match ─────────────────────────────────────────────────────────────
  if (c.cityRe) {
    const inTitle = c.cityRe.test(titleLower)
    const inBody  = c.cityRe.test(bodyLower)

    if (inTitle) {
      score += 0.35
      signals.push('city:title')
    } else if (inBody) {
      score += 0.20
      signals.push('city:body')
    }
  }

  // ── Actor match (armed groups, leaders, institutions) ─────────────────────
  if (c.actorRe) {
    const inTitle = c.actorRe.test(titleLower)
    const inBody  = c.actorRe.test(bodyLower)

    if (inTitle) {
      score += 0.50
      signals.push('actor:title')
    } else if (inBody) {
      score += 0.30
      signals.push('actor:body')
    }
  }

  // ── Weak actors (need corroboration) ──────────────────────────────────────
  if (c.weakActorRe && c.weakActorRe.test(fullLower)) {
    if (score > 0.2) {
      score += 0.15  // corroborated weak actor
      signals.push('weak_actor:corroborated')
    } else {
      score += 0.05  // standalone weak actor — very low contribution
      signals.push('weak_actor:standalone')
    }
  }

  // ── Alias match ────────────────────────────────────────────────────────────
  if (c.aliasRe) {
    const inTitle = c.aliasRe.test(titleLower)
    const inBody  = c.aliasRe.test(bodyLower)

    if (inTitle) {
      score += 0.30
      signals.push('alias:title')
    } else if (inBody) {
      score += 0.15
      signals.push('alias:body')
    }
  }

  // ── Regional signal (weak — shared with multiple countries) ───────────────
  if (c.regionalRe && c.regionalRe.test(fullLower) && score < 0.3) {
    // Only add regional signal if we don't already have a country signal
    // (prevents "Sahel" alone causing attribution to Mali/BF/Niger/Chad all at once)
    score += 0.08
    signals.push('regional:body')
  }

  // ── Cap and return ─────────────────────────────────────────────────────────
  const confidence = Math.min(1.0, Math.round(score * 100) / 100)
  const method = signals.length
    ? signals[0].split(':')[0]
    : 'no_signal'

  return { confidence, signals, method }
}

// ── Territory override check ───────────────────────────────────────────────────
/**
 * Checks if article matches a TERRITORY_OVERRIDE rule.
 * Returns { country, confidence } or null.
 */
export function checkTerritoryOverride(title, body) {
  const fullLower = `${title} ${body}`.toLowerCase()
  const matches = []

  for (const rule of TERRITORY_OVERRIDES) {
    if (!rule.country) continue  // skip context-dependent rules
    const matched = rule.patterns.some(p => p.test(fullLower))
    if (matched) {
      matches.push({ country: rule.country, confidence: rule.confidence })
    }
  }

  if (!matches.length) return null

  // Return highest-confidence territory match
  return matches.sort((a, b) => b.confidence - a.confidence)[0]
}

// ── Main attribution function ─────────────────────────────────────────────────
/**
 * Fully attributes an article, returning:
 *   primaryCountry     — canonical country name (or null if no match)
 *   primaryKey         — lowercase key for the primary country
 *   confidence         — 0-1 attribution confidence
 *   mentionedCountries — array of secondary countries (mentioned, not primary)
 *   method             — attribution method (exact, city, actor, territory, etc.)
 *   signals            — matched signals list
 *
 * @param {object} article — { title, summary, description }
 * @param {string} candidateCountry — the country we're checking attribution for
 * @returns {object}
 */
export function attributeArticle(article, candidateCountry) {
  const { title, summary, full } = extractText(article)
  const key = candidateCountry.toLowerCase().trim()

  // ── Territory override takes priority ────────────────────────────────────
  const override = checkTerritoryOverride(title, summary)
  if (override) {
    // If the override points to this candidate, return high confidence
    const overrideKey = override.country.toLowerCase().replace(/\s+/g, ' ')
    if (overrideKey === key) {
      return {
        primaryCountry: COUNTRY_SIGNALS[key]?.name || candidateCountry,
        primaryKey: key,
        confidence: override.confidence,
        mentionedCountries: [],
        method: 'territory_override',
        signals: ['territory_override'],
      }
    }
    // The override points to a DIFFERENT country — this article is NOT primarily about candidateCountry
    // (e.g., Gaza article being checked against Syria — territory says Palestine, not Syria)
    // Still run the normal scoring but apply a penalty
    const score = scoreArticleForCountry(title, full, key)
    if (score.confidence >= 0.45) {
      // Valid secondary mention despite override going elsewhere
      return {
        primaryCountry: null,
        primaryKey: null,
        confidence: Math.max(0, score.confidence - 0.3),  // penalty
        mentionedCountries: [COUNTRY_SIGNALS[overrideKey]?.name].filter(Boolean),
        method: 'secondary_mention',
        signals: score.signals,
      }
    }
    return {
      primaryCountry: null,
      primaryKey: null,
      confidence: 0,
      mentionedCountries: [COUNTRY_SIGNALS[overrideKey]?.name].filter(Boolean),
      method: 'territory_override_rejected',
      signals: ['territory_override_rejected'],
    }
  }

  // ── Standard scoring ──────────────────────────────────────────────────────
  const score = scoreArticleForCountry(title, full, key)
  const isPrimary = score.confidence >= 0.45

  return {
    primaryCountry: isPrimary ? (COUNTRY_SIGNALS[key]?.name || candidateCountry) : null,
    primaryKey: isPrimary ? key : null,
    confidence: score.confidence,
    mentionedCountries: [],
    method: score.method,
    signals: score.signals,
  }
}

// ── Batch article filtering ────────────────────────────────────────────────────
/**
 * Filters a list of articles to those primarily about a given country.
 * Returns articles sorted by attribution confidence (highest first).
 *
 * @param {object[]} articles    — raw feed articles
 * @param {string}   country     — country name to filter for
 * @param {number}   minConf     — minimum confidence threshold (default 0.45)
 * @returns {object[]}           — filtered + annotated articles
 */
export function filterByPrimaryAttribution(articles, country, minConf = 0.45) {
  if (!articles?.length) return []

  const results = []

  for (const article of articles) {
    const attr = attributeArticle(article, country)
    if (attr.confidence >= minConf) {
      results.push({
        ...article,
        _attribution: attr,
      })
    }
  }

  // Sort by confidence descending
  return results.sort((a, b) => b._attribution.confidence - a._attribution.confidence)
}

// ── Coverage check ────────────────────────────────────────────────────────────
/**
 * Returns the list of all supported country keys.
 */
export function getSupportedCountries() {
  return Object.keys(COUNTRY_SIGNALS)
}

/**
 * Returns the canonical name for a country key.
 */
export function getCanonicalName(key) {
  return COUNTRY_SIGNALS[key.toLowerCase()]?.name || null
}

// ── Normalization helpers ─────────────────────────────────────────────────────
/**
 * Normalizes a country name string to its lookup key.
 * Handles common variants like "côte d'ivoire" → "ivory coast".
 */
const NAME_NORMALIZATIONS = {
  "côte d'ivoire": 'ivory coast',
  "cote d'ivoire": 'ivory coast',
  'democratic republic of the congo': 'democratic republic of congo',
  'dr congo': 'democratic republic of congo',
  'drc': 'democratic republic of congo',
  'uae': 'uae',
  'united arab emirates': 'uae',
  'saudi arabia': 'saudi_arabia',
  'south sudan': 'south sudan',
  'south africa': 'south africa',
  'burkina faso': 'burkina faso',
  'sierra leone': 'sierra leone',
  'guinea-bissau': 'guinea-bissau',
  'republic of congo': 'republic of congo',
  'republic of the congo': 'republic of congo',
  'central african republic': 'central african republic',
  'car': 'central african republic',
  'ivory coast': 'ivory coast',
  'west bank': 'palestine',
  'gaza': 'palestine',
  'gaza strip': 'palestine',
  'palestine': 'palestine',
  'palestinian territories': 'palestine',
  'occupied palestinian territories': 'palestine',
}

export function normalizeCountryKey(name) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  return NAME_NORMALIZATIONS[lower] || lower.replace(/\s+/g, ' ')
}
