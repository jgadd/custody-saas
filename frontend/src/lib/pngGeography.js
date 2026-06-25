/**
 * pngGeography.js
 *
 * Papua New Guinea's province → district structure, used for:
 *   - Admin: Manage Stations — selecting a Province filters the
 *     District dropdown to that province's districts only.
 *   - Booking form: "Province of origin" dropdown (national, all 22).
 *
 * PNG has 22 province-level divisions (20 provinces, the autonomous
 * region of Bougainville, and the National Capital District) and 87
 * districts total as of the most recent reorganisation.
 *
 * ACCURACY NOTE — read before editing or relying on this list:
 * District boundaries and names in PNG have changed multiple times
 * (mergers, splits, renames) and there isn't one single authoritative
 * source easily available. The entries below were checked against
 * multiple references during this session and are believed accurate,
 * but provinces marked VERIFIED have had their full district list
 * cross-checked against at least two independent sources; provinces
 * marked UNVERIFIED have districts listed from a single national-level
 * source and should be confirmed against an official PNG government
 * or electoral commission list before being treated as final —
 * especially for any province whose district count looks off, or
 * where boundary changes are known to have happened recently (Chimbu,
 * Eastern Highlands, Enga, East Sepik all had district splits/merges
 * historically and may need a fresh check).
 *
 * Suburb-level data is intentionally NOT included here — it's even
 * less standardized nationally than districts, and is meant to be
 * provided per-station by station/admin staff who know the area,
 * rather than guessed at a national level.
 */

export const PNG_PROVINCES = [
  'National Capital District',
  'Central',
  'Gulf',
  'Milne Bay',
  'Oro',
  'Western',
  'Southern Highlands',
  'Hela',
  'Western Highlands',
  'Jiwaka',
  'Chimbu',
  'Eastern Highlands',
  'Enga',
  'Morobe',
  'Madang',
  'East Sepik',
  'West Sepik',
  'Manus',
  'New Ireland',
  'East New Britain',
  'West New Britain',
  'Bougainville',
];

/**
 * districtsByProvince — VERIFIED entries cross-checked against at
 * least two sources during this session. UNVERIFIED entries are from
 * a single source and flagged for confirmation.
 */
export const DISTRICTS_BY_PROVINCE = {
  // VERIFIED — cross-checked against Wikipedia, Grokipedia, and PNG
  // government/electoral sources during this session.
  'National Capital District': ['Moresby South', 'Moresby North-East', 'Moresby North-West'],
  'Central': ['Abau', 'Goilala', 'Kairuku-Hiri', 'Rigo'],
  'Gulf': ['Kerema', 'Kikori'],
  'Milne Bay': ['Alotau', "Esa'ala", 'Kiriwina-Goodenough', 'Samarai-Murua'],
  'Oro': ['Ijivitari', 'Sohe'],
  'Western': ['North Fly', 'Middle Fly', 'South Fly'],

  // UNVERIFIED — listed from a single national-level source (district
  // name list cross-referenced to province by general knowledge of PNG
  // geography), not yet independently confirmed district-by-district.
  // Treat as a strong starting point, not final.
  'Southern Highlands': ['Ialibu-Pangia', 'Imbonggu', 'Kagua-Erave', 'Mendi-Munihu', 'Nipa-Kutubu'], // UNVERIFIED
  'Hela': ['Komo-Margarima', 'Koroba-Kopiago', 'Tari-Pori'], // UNVERIFIED
  'Western Highlands': ['Dei', 'Mul-Baiyer', 'Tambul-Nebilyer', 'Mt Hagen'], // UNVERIFIED
  'Jiwaka': ['Anglimp-South Waghi', 'Jimi', 'North Waghi'], // UNVERIFIED
  'Chimbu': ['Chuave', 'Gumine', 'Karimui-Nomane', 'Kerowagi', 'Kundiawa-Gembogl', 'Sina Sina-Yonggomugl'], // UNVERIFIED
  'Eastern Highlands': ['Daulo', 'Goroka', 'Henganofi', 'Kainantu', 'Lufa', 'Obura-Wonenara', 'Okapa', 'Unggai-Bena'], // UNVERIFIED
  'Enga': ['Kandep', 'Kompiam-Ambum', 'Lagaip-Porgera', 'Wabag', 'Wapenamanda'], // UNVERIFIED
  'Morobe': ['Bulolo', 'Finschhafen', 'Huon Gulf', 'Kabwum', 'Lae', 'Markham', 'Menyamya', 'Nawaeb', 'Tewae-Siassi'], // UNVERIFIED
  'Madang': ['Bogia', 'Madang', 'Middle Ramu', 'Rai Coast', 'Sumkar', 'Usino Bundi'], // UNVERIFIED
  'East Sepik': ['Ambunti-Dreikikir', 'Angoram', 'Maprik', 'Wewak', 'Wosera-Gawi', 'Yangoru-Saussia'], // UNVERIFIED
  'West Sepik': ['Aitape-Lumi', 'Nuku', 'Telefomin', 'Vanimo-Green River'], // UNVERIFIED
  'Manus': ['Manus'], // UNVERIFIED
  'New Ireland': ['Kavieng', 'Namatanai'], // UNVERIFIED
  'East New Britain': ['Gazelle', 'Kokopo', 'Pomio', 'Rabaul'], // UNVERIFIED
  'West New Britain': ['Kandrian-Gloucester', 'Talasea'], // UNVERIFIED
  'Bougainville': ['North Bougainville', 'Central Bougainville', 'South Bougainville'], // UNVERIFIED
};

export function getDistrictsForProvince(province) {
  return DISTRICTS_BY_PROVINCE[province] || [];
}
