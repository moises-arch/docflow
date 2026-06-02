// Country code/name normalization for Odoo. Odoo's res.country.name field is
// the FULL country name (e.g., "United States", not "US"). We see partner
// records fail to resolve when the document has "US" or "USA" because Odoo
// can't match against res.country.name.
//
// This map covers the common variants Walmart/Sams Club, Cleo and other
// providers use. Extend as new variants appear in production.
//
// Use this anywhere we set country on shipping_address/billing_address
// before persisting to order_drafts.

const ALIASES: Record<string, string> = {
  // United States
  US: "United States",
  USA: "United States",
  "U.S.": "United States",
  "U.S.A.": "United States",
  "UNITED STATES": "United States",
  "UNITED STATES OF AMERICA": "United States",
  ESTADOS_UNIDOS: "United States",
  "ESTADOS UNIDOS": "United States",
  EEUU: "United States",
  "EE.UU.": "United States",

  // Canada
  CA: "Canada",
  CAN: "Canada",
  CANADA: "Canada",
  "CANADÁ": "Canada",

  // Mexico
  MX: "Mexico",
  MEX: "Mexico",
  MEXICO: "Mexico",
  "MÉXICO": "Mexico",

  // United Kingdom
  UK: "United Kingdom",
  GB: "United Kingdom",
  GBR: "United Kingdom",
  "UNITED KINGDOM": "United Kingdom",
  "GREAT BRITAIN": "United Kingdom",
  REINO_UNIDO: "United Kingdom",
  "REINO UNIDO": "United Kingdom",

  // Spain
  ES: "Spain",
  ESP: "Spain",
  SPAIN: "Spain",
  "ESPAÑA": "Spain",
  ESPANA: "Spain",

  // Common LATAM
  GT: "Guatemala",
  GUATEMALA: "Guatemala",
  HN: "Honduras",
  HONDURAS: "Honduras",
  CR: "Costa Rica",
  "COSTA RICA": "Costa Rica",
  PA: "Panama",
  PANAMA: "Panama",
  "PANAMÁ": "Panama",
  CO: "Colombia",
  COLOMBIA: "Colombia",
  PE: "Peru",
  PERU: "Peru",
  "PERÚ": "Peru",
  AR: "Argentina",
  ARGENTINA: "Argentina",
  CL: "Chile",
  CHILE: "Chile",
  BR: "Brazil",
  BRAZIL: "Brazil",
  BRASIL: "Brazil",
};

/**
 * Convert a country code or partial name to the canonical Odoo country name.
 * Returns the input unchanged if no match — better to send the original
 * value than guess wrong.
 */
export function normalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/\s+/g, " ").replace(/_/g, " ");
  if (ALIASES[upper]) return ALIASES[upper];
  // Already a canonical full name? (capitalize first letter of each word)
  const titleCase = trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  if (ALIASES[titleCase.toUpperCase()]) return ALIASES[titleCase.toUpperCase()];
  return trimmed;
}

// US state codes — used by inferCountryFromZip to disambiguate when the country
// string from the document is ambiguous or wrong (e.g., AI extracts "Australia"
// from a US address with ZIP 95973 and state CA).
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  // US territories
  "AS", "GU", "MP", "PR", "VI",
]);

const CA_PROVINCE_CODES = new Set([
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const US_ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const CA_POSTAL_RE = /^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i;

// USPS 3-digit ZIP prefix → state. Source: USPS sectional center facility
// (SCF) ranges. Covers >99% of US ZIP codes. Each tuple is [lo, hi, state_code]
// where lo and hi are 3-digit ZIP prefix strings (inclusive).
const US_ZIP3_RANGES: ReadonlyArray<readonly [string, string, string]> = [
  ["005","005","NY"], ["006","009","PR"], ["010","027","MA"],
  ["028","029","RI"], ["030","038","NH"], ["039","049","ME"],
  ["050","054","VT"], ["055","055","MA"], ["056","059","VT"],
  ["060","069","CT"], ["070","089","NJ"], ["100","149","NY"],
  ["150","196","PA"], ["197","199","DE"], ["200","205","DC"],
  ["206","219","MD"], ["220","246","VA"], ["247","268","WV"],
  ["270","289","NC"], ["290","299","SC"], ["300","319","GA"],
  ["320","349","FL"], ["350","369","AL"], ["370","385","TN"],
  ["386","397","MS"], ["398","399","GA"], ["400","427","KY"],
  ["430","459","OH"], ["460","479","IN"], ["480","499","MI"],
  ["500","528","IA"], ["530","549","WI"], ["550","567","MN"],
  ["570","577","SD"], ["580","588","ND"], ["590","599","MT"],
  ["600","629","IL"], ["630","658","MO"], ["660","679","KS"],
  ["680","693","NE"], ["700","714","LA"], ["716","729","AR"],
  ["730","749","OK"], ["750","799","TX"], ["800","816","CO"],
  ["820","831","WY"], ["832","838","ID"], ["840","847","UT"],
  ["850","865","AZ"], ["870","884","NM"], ["885","885","TX"],
  ["889","898","NV"], ["900","961","CA"], ["967","968","HI"],
  ["970","979","OR"], ["980","994","WA"], ["995","999","AK"],
];

// Canadian postal code first letter → province.
const CA_POSTAL_LETTER_TO_PROVINCE: Record<string, string> = {
  A: "NL", B: "NS", C: "PE", E: "NB",
  G: "QC", H: "QC", J: "QC",
  K: "ON", L: "ON", M: "ON", N: "ON", P: "ON",
  R: "MB", S: "SK", T: "AB", V: "BC",
  X: "NT", Y: "YT",
};

/**
 * Infer the state/province code from a US ZIP or Canadian postal code.
 * Returns the 2-letter state/province code, or null if it can't be determined.
 */
export function inferStateFromZip(zip: string | null | undefined): string | null {
  const z = (zip ?? "").trim();
  if (!z) return null;
  if (US_ZIP_RE.test(z)) {
    const zip3 = z.slice(0, 3);
    for (const [lo, hi, code] of US_ZIP3_RANGES) {
      if (zip3 >= lo && zip3 <= hi) return code;
    }
    return null;
  }
  if (CA_POSTAL_RE.test(z)) {
    return CA_POSTAL_LETTER_TO_PROVINCE[z[0].toUpperCase()] ?? null;
  }
  return null;
}

/**
 * Infer country (US or Canada) from ZIP/postal code or state code.
 * Returns canonical Odoo country name, or null if no confident inference.
 *
 * This is the safety net for when the document has a wrong/ambiguous country
 * string but the ZIP and state make the actual country obvious.
 */
export function inferCountryFromZip(
  zip: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const z = (zip ?? "").trim();
  if (z) {
    if (US_ZIP_RE.test(z)) return "United States";
    if (CA_POSTAL_RE.test(z)) return "Canada";
  }
  const s = (state ?? "").trim().toUpperCase();
  if (s) {
    if (US_STATE_CODES.has(s)) return "United States";
    if (CA_PROVINCE_CODES.has(s)) return "Canada";
  }
  return null;
}
