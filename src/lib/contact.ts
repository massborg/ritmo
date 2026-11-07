// Who runs Ritmo, and where. Shown on the public Privacy, Terms and About pages, which Garmin and the app stores
// compare with what is written in applications. Keep these exactly as registered.

/** The public web address of Ritmo (no trailing slash) */
export const SITE_URL = 'https://app.ritmorunning.run';

/** The company responsible for Ritmo and for your data (the data controller under GDPR) */
export const COMPANY = {
  name: 'TriCore Consult Ltd',
  country: 'Cyprus', // where the company is registered
  registration: 'HE 467194', // Cyprus company registration number
  address: 'Genevis 2, Geneva Court, 3rd floor, Flat/Office 301, Agia Fyla, 3116 Limassol, Cyprus', // registered office
  vat: 'CY60108115O',
  website: 'https://www.tricoreconsult.eu',
  /** Lead data protection authority for a company established in Cyprus */
  authority: { name: 'Commissioner for Personal Data Protection (Cyprus)', url: 'https://www.dataprotection.gov.cy' },
};

/** Public contact address for support, partners and data requests. */
export const CONTACT_EMAIL = 'info@tricoreconsult.eu';
