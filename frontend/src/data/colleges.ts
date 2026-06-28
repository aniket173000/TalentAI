// Comprehensive Indian college database with alias normalization.
// `name` = canonical display name (what gets stored).
// `aliases` = alternate names / abbreviations matched during search.

export interface CollegeEntry {
  name: string
  aliases: string[]
  category: 'IIT' | 'NIT' | 'IIIT' | 'IIM' | 'Central' | 'Private' | 'State'
}

export const COLLEGE_DB: CollegeEntry[] = [
  // ── IITs ──────────────────────────────────────────────────────────────────
  { name: 'IIT Bombay',        category: 'IIT', aliases: ['iitb','iit-b','iit mumbai','indian institute of technology bombay','indian institute of technology mumbai'] },
  { name: 'IIT Delhi',         category: 'IIT', aliases: ['iitd','iit-d','iit new delhi','indian institute of technology delhi','indian institute of technology new delhi'] },
  { name: 'IIT Madras',        category: 'IIT', aliases: ['iitm','iit-m','iit chennai','indian institute of technology madras','indian institute of technology chennai'] },
  { name: 'IIT Kanpur',        category: 'IIT', aliases: ['iitk','iit-k','indian institute of technology kanpur'] },
  { name: 'IIT Kharagpur',     category: 'IIT', aliases: ['iitkgp','iit-kgp','iit kgp','indian institute of technology kharagpur'] },
  { name: 'IIT Roorkee',       category: 'IIT', aliases: ['iitr','iit-r','indian institute of technology roorkee'] },
  { name: 'IIT Guwahati',      category: 'IIT', aliases: ['iitg','iit-g','indian institute of technology guwahati'] },
  { name: 'IIT Hyderabad',     category: 'IIT', aliases: ['iith','iit-h','indian institute of technology hyderabad'] },
  { name: 'IIT Patna',         category: 'IIT', aliases: ['iitp','iit-p','indian institute of technology patna'] },
  { name: 'IIT Bhubaneswar',   category: 'IIT', aliases: ['iit-bbsr','indian institute of technology bhubaneswar'] },
  { name: 'IIT Jodhpur',       category: 'IIT', aliases: ['iitj','iit-j','indian institute of technology jodhpur'] },
  { name: 'IIT Gandhinagar',   category: 'IIT', aliases: ['iitgn','iit-gn','indian institute of technology gandhinagar'] },
  { name: 'IIT Indore',        category: 'IIT', aliases: ['iiti','iit-i','indian institute of technology indore'] },
  { name: 'IIT Mandi',         category: 'IIT', aliases: ['iitmandi','iit-mandi','indian institute of technology mandi'] },
  { name: 'IIT (BHU) Varanasi',category: 'IIT', aliases: ['iit bhu','iit varanasi','bhu iit','it bhu','iit-bhu','indian institute of technology bhu','indian institute of technology varanasi'] },
  { name: 'IIT Palakkad',      category: 'IIT', aliases: ['iitpkd','iit-pkd','indian institute of technology palakkad'] },
  { name: 'IIT Tirupati',      category: 'IIT', aliases: ['iit-tirupati','indian institute of technology tirupati'] },
  { name: 'IIT Bhilai',        category: 'IIT', aliases: ['iit-bhilai','indian institute of technology bhilai'] },
  { name: 'IIT Goa',           category: 'IIT', aliases: ['iit-goa','indian institute of technology goa'] },
  { name: 'IIT Jammu',         category: 'IIT', aliases: ['iit-jammu','indian institute of technology jammu'] },
  { name: 'IIT Dharwad',       category: 'IIT', aliases: ['iit-dharwad','indian institute of technology dharwad'] },
  { name: 'IIT Ropar',         category: 'IIT', aliases: ['iitrpr','iit-ropar','indian institute of technology ropar'] },
  { name: 'IIT (ISM) Dhanbad', category: 'IIT', aliases: ['ism dhanbad','iit ism','iit-ism','indian school of mines','indian institute of technology indian school of mines'] },

  // ── NITs ──────────────────────────────────────────────────────────────────
  { name: 'NIT Trichy',        category: 'NIT', aliases: ['nitc-trichy','nit-t','nit tiruchirappalli','national institute of technology trichy','national institute of technology tiruchirappalli'] },
  { name: 'NIT Surathkal',     category: 'NIT', aliases: ['nitk','nit karnataka','nit-k','national institute of technology surathkal','national institute of technology karnataka'] },
  { name: 'NIT Warangal',      category: 'NIT', aliases: ['nitw','nit-w','national institute of technology warangal'] },
  { name: 'NIT Calicut',       category: 'NIT', aliases: ['nitc','nit-c','nit kozhikode','national institute of technology calicut','national institute of technology kozhikode'] },
  { name: 'NIT Rourkela',      category: 'NIT', aliases: ['nitr','nit-r','national institute of technology rourkela'] },
  { name: 'MNNIT Allahabad',   category: 'NIT', aliases: ['nit allahabad','nit-a','mnnit','motilal nehru national institute of technology','national institute of technology allahabad'] },
  { name: 'MANIT Bhopal',      category: 'NIT', aliases: ['nit bhopal','manit','maulana azad national institute of technology','national institute of technology bhopal'] },
  { name: 'MNIT Jaipur',       category: 'NIT', aliases: ['nit jaipur','mnit','malaviya national institute of technology','national institute of technology jaipur'] },
  { name: 'SVNIT Surat',       category: 'NIT', aliases: ['nit surat','svnit','sardar vallabhbhai national institute of technology','national institute of technology surat'] },
  { name: 'NIT Durgapur',      category: 'NIT', aliases: ['national institute of technology durgapur'] },
  { name: 'NIT Hamirpur',      category: 'NIT', aliases: ['national institute of technology hamirpur'] },
  { name: 'NIT Kurukshetra',   category: 'NIT', aliases: ['nitkkr','nit-kkr','national institute of technology kurukshetra'] },
  { name: 'VNIT Nagpur',       category: 'NIT', aliases: ['nit nagpur','vnit','visvesvaraya national institute of technology','national institute of technology nagpur'] },
  { name: 'NIT Patna',         category: 'NIT', aliases: ['national institute of technology patna'] },
  { name: 'NIT Silchar',       category: 'NIT', aliases: ['national institute of technology silchar'] },
  { name: 'NIT Jamshedpur',    category: 'NIT', aliases: ['national institute of technology jamshedpur'] },
  { name: 'NIT Agartala',      category: 'NIT', aliases: ['national institute of technology agartala'] },
  { name: 'NIT Delhi',         category: 'NIT', aliases: ['national institute of technology delhi'] },
  { name: 'NIT Srinagar',      category: 'NIT', aliases: ['national institute of technology srinagar'] },
  { name: 'NIT Andhra Pradesh',category: 'NIT', aliases: ['national institute of technology andhra pradesh'] },
  { name: 'NIT Puducherry',    category: 'NIT', aliases: ['national institute of technology puducherry'] },
  { name: 'NIT Sikkim',        category: 'NIT', aliases: ['national institute of technology sikkim'] },
  { name: 'NIT Goa',           category: 'NIT', aliases: ['national institute of technology goa'] },
  { name: 'NIT Manipur',       category: 'NIT', aliases: ['national institute of technology manipur'] },
  { name: 'NIT Meghalaya',     category: 'NIT', aliases: ['national institute of technology meghalaya'] },
  { name: 'NIT Mizoram',       category: 'NIT', aliases: ['national institute of technology mizoram'] },
  { name: 'NIT Nagaland',      category: 'NIT', aliases: ['national institute of technology nagaland'] },
  { name: 'NIT Uttarakhand',   category: 'NIT', aliases: ['national institute of technology uttarakhand'] },
  { name: 'NIT Jalandhar',     category: 'NIT', aliases: ['dr br ambedkar nit','national institute of technology jalandhar'] },
  { name: 'NIT Raipur',        category: 'NIT', aliases: ['national institute of technology raipur'] },
  { name: 'NIT Arunachal Pradesh', category: 'NIT', aliases: ['national institute of technology arunachal'] },

  // ── IIITs ─────────────────────────────────────────────────────────────────
  { name: 'IIIT Hyderabad',    category: 'IIIT', aliases: ['iiit-h','iiit-hyd','international institute of information technology hyderabad','iiith'] },
  { name: 'IIIT Delhi',        category: 'IIIT', aliases: ['iiit-d','iiitd','indraprastha institute of information technology delhi','indraprastha iiit'] },
  { name: 'IIIT Allahabad',    category: 'IIIT', aliases: ['iiita','indian institute of information technology allahabad'] },
  { name: 'IIIT Bangalore',    category: 'IIIT', aliases: ['iiit-b','iiitb','international institute of information technology bangalore'] },
  { name: 'IIIT Lucknow',      category: 'IIIT', aliases: ['iiitl','indian institute of information technology lucknow'] },
  { name: 'IIIT Pune',         category: 'IIIT', aliases: ['iiitp','indian institute of information technology pune'] },
  { name: 'IIIT Gwalior',      category: 'IIIT', aliases: ['iiitm gwalior','abv iiitm','abv-iiitm','atal bihari vajpayee indian institute of information technology and management gwalior'] },
  { name: 'IIIT Jabalpur',     category: 'IIIT', aliases: ['indian institute of information technology design and manufacturing jabalpur'] },
  { name: 'IIIT Kancheepuram', category: 'IIIT', aliases: ['iiit kancheepuram','iiit chennai','indian institute of information technology design and manufacturing kancheepuram'] },
  { name: 'IIIT Kottayam',     category: 'IIIT', aliases: ['indian institute of information technology kottayam'] },
  { name: 'IIIT Manipur',      category: 'IIIT', aliases: ['indian institute of information technology manipur'] },
  { name: 'IIIT Nagpur',       category: 'IIIT', aliases: ['indian institute of information technology nagpur'] },
  { name: 'IIIT Ranchi',       category: 'IIIT', aliases: ['indian institute of information technology ranchi'] },
  { name: 'IIIT Sri City',     category: 'IIIT', aliases: ['indian institute of information technology sri city','iiit sricity'] },
  { name: 'IIIT Vadodara',     category: 'IIIT', aliases: ['indian institute of information technology vadodara'] },
  { name: 'IIIT Una',          category: 'IIIT', aliases: ['indian institute of information technology una'] },
  { name: 'IIIT Sonepat',      category: 'IIIT', aliases: ['indian institute of information technology sonepat'] },
  { name: 'IIIT Surat',        category: 'IIIT', aliases: ['indian institute of information technology surat'] },
  { name: 'IIIT Bhopal',       category: 'IIIT', aliases: ['indian institute of information technology bhopal'] },
  { name: 'IIIT Kalyani',      category: 'IIIT', aliases: ['indian institute of information technology kalyani'] },

  // ── IIMs ──────────────────────────────────────────────────────────────────
  { name: 'IIM Ahmedabad',      category: 'IIM', aliases: ['iima','iim-a','iim-ahmedabad','indian institute of management ahmedabad'] },
  { name: 'IIM Bangalore',      category: 'IIM', aliases: ['iimb','iim-b','iim-bangalore','indian institute of management bangalore'] },
  { name: 'IIM Calcutta',       category: 'IIM', aliases: ['iimc','iim-c','iim kolkata','iim-calcutta','indian institute of management calcutta','indian institute of management kolkata'] },
  { name: 'IIM Lucknow',        category: 'IIM', aliases: ['iiml','iim-l','iim-lucknow','indian institute of management lucknow'] },
  { name: 'IIM Kozhikode',      category: 'IIM', aliases: ['iimk','iim-k','iim calicut','iim-kozhikode','indian institute of management kozhikode'] },
  { name: 'IIM Indore',         category: 'IIM', aliases: ['iimi','iim-i','iim-indore','indian institute of management indore'] },
  { name: 'IIM Shillong',       category: 'IIM', aliases: ['iim-shillong','indian institute of management shillong'] },
  { name: 'IIM Rohtak',         category: 'IIM', aliases: ['iimr','iim-r','iim-rohtak','indian institute of management rohtak'] },
  { name: 'IIM Raipur',         category: 'IIM', aliases: ['iim-raipur','indian institute of management raipur'] },
  { name: 'IIM Ranchi',         category: 'IIM', aliases: ['iim-ranchi','indian institute of management ranchi'] },
  { name: 'IIM Trichy',         category: 'IIM', aliases: ['iim tiruchirappalli','iim-t','iim-trichy','indian institute of management trichy','indian institute of management tiruchirappalli'] },
  { name: 'IIM Udaipur',        category: 'IIM', aliases: ['iim-udaipur','indian institute of management udaipur'] },
  { name: 'IIM Kashipur',       category: 'IIM', aliases: ['iim-kashipur','indian institute of management kashipur'] },
  { name: 'IIM Nagpur',         category: 'IIM', aliases: ['iim-nagpur','indian institute of management nagpur'] },
  { name: 'IIM Visakhapatnam',  category: 'IIM', aliases: ['iim vizag','iim-v','iim-visakhapatnam','indian institute of management visakhapatnam'] },
  { name: 'IIM Bodh Gaya',      category: 'IIM', aliases: ['iim-bodh-gaya','indian institute of management bodh gaya'] },
  { name: 'IIM Jammu',          category: 'IIM', aliases: ['iim-jammu','indian institute of management jammu'] },
  { name: 'IIM Mumbai',         category: 'IIM', aliases: ['iim-mumbai','nitie','national institute of industrial engineering'] },
  { name: 'IIM Sirmaur',        category: 'IIM', aliases: ['iim-sirmaur','indian institute of management sirmaur'] },
  { name: 'IIM Sambalpur',      category: 'IIM', aliases: ['iim-sambalpur','indian institute of management sambalpur'] },

  // ── Central Universities / Institutes ─────────────────────────────────────
  { name: 'IISc Bangalore',     category: 'Central', aliases: ['iisc','indian institute of science','indian institute of science bangalore','tifr equivalent'] },
  { name: 'TISS Mumbai',        category: 'Central', aliases: ['tata institute of social sciences','tiss'] },
  { name: 'University of Delhi',category: 'Central', aliases: ['du','delhi university','delhi uni'] },
  { name: 'JNU',                category: 'Central', aliases: ['jawaharlal nehru university','jnu delhi'] },
  { name: 'BHU Varanasi',       category: 'Central', aliases: ['banaras hindu university','bhu','banaras hindu university varanasi'] },
  { name: 'Jadavpur University',category: 'Central', aliases: ['ju kolkata','jadavpur'] },
  { name: 'Hyderabad Central University', category: 'Central', aliases: ['hcu','university of hyderabad','central university of hyderabad'] },
  { name: 'NID Ahmedabad',      category: 'Central', aliases: ['national institute of design','nid','national institute of design ahmedabad'] },
  { name: 'NIFT Delhi',         category: 'Central', aliases: ['national institute of fashion technology','nift'] },
  { name: 'DTU Delhi',          category: 'Central', aliases: ['delhi technological university','dtu','delhi college of engineering'] },
  { name: 'NSUT Delhi',         category: 'Central', aliases: ['netaji subhas university of technology','nsut','nsit','netaji subhas institute of technology'] },
  { name: 'IGDTUW Delhi',       category: 'Central', aliases: ['indira gandhi delhi technical university for women','igdtuw'] },

  // ── Top Private Colleges ──────────────────────────────────────────────────
  { name: 'BITS Pilani',        category: 'Private', aliases: ['bits-pilani','birla institute of technology and science pilani'] },
  { name: 'BITS Goa',           category: 'Private', aliases: ['bits-goa','birla institute of technology and science goa'] },
  { name: 'BITS Hyderabad',     category: 'Private', aliases: ['bits-hyd','bits hyderabad','birla institute of technology and science hyderabad'] },
  { name: 'VIT Vellore',        category: 'Private', aliases: ['vit','vellore institute of technology','vit-vellore'] },
  { name: 'VIT Chennai',        category: 'Private', aliases: ['vit-c','vit chennai','vellore institute of technology chennai'] },
  { name: 'VIT Bhopal',         category: 'Private', aliases: ['vellore institute of technology bhopal'] },
  { name: 'Manipal Institute of Technology', category: 'Private', aliases: ['mit manipal','manipal','mit mangalore','manipal university'] },
  { name: 'SRM Institute of Science and Technology', category: 'Private', aliases: ['srm','srm university','srm kattankulathur','srm college'] },
  { name: 'Thapar Institute of Engineering and Technology', category: 'Private', aliases: ['thapar','thapar university','tiet','thapar institute'] },
  { name: 'PSG College of Technology', category: 'Private', aliases: ['psg tech','psg coimbatore','psgtech'] },
  { name: 'PES University',     category: 'Private', aliases: ['pesu','pes university bangalore','pesit','people\'s education society university'] },
  { name: 'RV College of Engineering', category: 'Private', aliases: ['rvce','rv college bangalore'] },
  { name: 'BMS College of Engineering', category: 'Private', aliases: ['bmsce','bms college bangalore'] },
  { name: 'MS Ramaiah Institute of Technology', category: 'Private', aliases: ['msrit','ms ramaiah','ramaiah institute bangalore'] },
  { name: 'Nirma University',   category: 'Private', aliases: ['nirma','nirma institute of technology','nirma university ahmedabad'] },
  { name: 'LNMIIT Jaipur',      category: 'Private', aliases: ['lnm institute of information technology','lnmiit'] },
  { name: 'Amity University',   category: 'Private', aliases: ['amity','amity university noida'] },
  { name: 'Symbiosis Institute of Technology', category: 'Private', aliases: ['sit pune','symbiosis','symbiosis international university'] },
  { name: 'Christ University',  category: 'Private', aliases: ['christ college','christ bangalore'] },
  { name: 'Chandigarh University', category: 'Private', aliases: ['cu chandigarh','chandigarh uni'] },
  { name: 'Lovely Professional University', category: 'Private', aliases: ['lpu','lpu phagwara'] },
  { name: 'KJ Somaiya College of Engineering', category: 'Private', aliases: ['kjsce','kj somaiya','somaiya vidyavihar'] },
  { name: 'NMIMS Mumbai',       category: 'Private', aliases: ['nmims','svkm nmims','narsee monjee'] },
  { name: 'ISB Hyderabad',      category: 'Private', aliases: ['isb','indian school of business','isb hyderabad'] },
  { name: 'MDI Gurgaon',        category: 'Private', aliases: ['mdi','management development institute','mdi gurugram'] },
  { name: 'FMS Delhi',          category: 'Private', aliases: ['faculty of management studies','fms','fms delhi university'] },
  { name: 'XLRI Jamshedpur',    category: 'Private', aliases: ['xlri','xavier labour relations institute'] },
  { name: 'SIBM Pune',          category: 'Private', aliases: ['symbiosis institute of business management','sibm'] },
  { name: 'SPJIMR Mumbai',      category: 'Private', aliases: ['sp jain','spjimr','s p jain institute of management and research'] },
  { name: 'IMT Ghaziabad',      category: 'Private', aliases: ['institute of management technology ghaziabad','imt'] },
  { name: 'XIMB Bhubaneswar',   category: 'Private', aliases: ['xavier institute of management','ximb'] },
  { name: 'IMI Delhi',          category: 'Private', aliases: ['international management institute delhi'] },
  { name: 'Shiv Nadar University', category: 'Private', aliases: ['snu','shiv nadar','snu noida'] },
  { name: 'Ashoka University',  category: 'Private', aliases: ['ashoka sonepat','ashoka univ'] },
  { name: 'OP Jindal Global University', category: 'Private', aliases: ['jgu','op jindal','jindal global law school','jindal university'] },
  { name: 'Flame University',   category: 'Private', aliases: ['flame pune'] },
  { name: 'Krea University',    category: 'Private', aliases: ['krea','ifmr'] },
  { name: 'Bennett University', category: 'Private', aliases: ['bennett','bennett university greater noida'] },
  { name: 'Gitam University',   category: 'Private', aliases: ['gitam','gandhi institute of technology and management'] },
  { name: 'KIIT University',    category: 'Private', aliases: ['kiit','kalinga institute of industrial technology','kiit bhubaneswar'] },

  // ── State Universities ─────────────────────────────────────────────────────
  { name: 'Anna University',    category: 'State', aliases: ['anna university chennai'] },
  { name: 'Mumbai University',  category: 'State', aliases: ['university of mumbai','bombay university','mu mumbai'] },
  { name: 'Savitribai Phule Pune University', category: 'State', aliases: ['pune university','sppu','university of pune'] },
  { name: 'Osmania University', category: 'State', aliases: ['ou hyderabad','osmania university hyderabad'] },
  { name: 'Bangalore University', category: 'State', aliases: ['bu bangalore'] },
  { name: 'Calcutta University',category: 'State', aliases: ['university of calcutta','cu kolkata'] },
  { name: 'Madras University',  category: 'State', aliases: ['university of madras','madras university chennai'] },
  { name: 'Andhra University',  category: 'State', aliases: ['au visakhapatnam','andhra university visakhapatnam'] },
  { name: 'Gujarat University', category: 'State', aliases: ['gu ahmedabad','gujarat university ahmedabad'] },
  { name: 'Rajasthan Technical University', category: 'State', aliases: ['rtu kota','rtu'] },
  { name: 'Visvesvaraya Technological University', category: 'State', aliases: ['vtu','vtu belagavi','vtu belgaum'] },
  { name: 'APJ Abdul Kalam Technological University', category: 'State', aliases: ['ktu','kerala technological university'] },
  { name: 'RTM Nagpur University', category: 'State', aliases: ['nagpur university','rtmnu'] },
]

// Score a single college entry against a query (higher = better match).
function scoreEntry(entry: CollegeEntry, q: string): number {
  const nameLower = entry.name.toLowerCase()
  if (nameLower === q) return 100
  if (nameLower.startsWith(q)) return 70
  if (nameLower.includes(q)) return 50
  for (const alias of entry.aliases) {
    if (alias === q) return 90
    if (alias.startsWith(q)) return 65
    if (alias.includes(q)) return 45
  }
  return 0
}

// Search the local DB, returning canonical names sorted by relevance.
export function searchLocalColleges(query: string, limit = 12): string[] {
  if (!query.trim()) {
    // Default view: show all IITs first, then NITs, then IIITs, then IIMs, then rest
    const ordered = [
      ...COLLEGE_DB.filter(c => c.category === 'IIT'),
      ...COLLEGE_DB.filter(c => c.category === 'NIT'),
      ...COLLEGE_DB.filter(c => c.category === 'IIM'),
      ...COLLEGE_DB.filter(c => c.category === 'Private'),
    ]
    return ordered.slice(0, limit).map(c => c.name)
  }
  const q = query.toLowerCase().trim()
  const results: { name: string; score: number }[] = []
  for (const entry of COLLEGE_DB) {
    const score = scoreEntry(entry, q)
    if (score > 0) results.push({ name: entry.name, score })
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit).map(r => r.name)
}

// Resolve user input to canonical name.
// If the input matches any alias of a known college, returns the canonical name.
// Otherwise returns the input unchanged (new / unknown college).
export function resolveCanonicalName(input: string): string {
  if (!input.trim()) return input
  const q = input.toLowerCase().trim()
  for (const entry of COLLEGE_DB) {
    if (entry.name.toLowerCase() === q) return entry.name
    if (entry.aliases.includes(q)) return entry.name
  }
  return input.trim()
}
