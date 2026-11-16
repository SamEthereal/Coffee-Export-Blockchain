// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// Shared field-level validation rules — phone numbers (E.164 + per-country
// national length), Ethiopian bank account numbers (CBE 13 digits starting
// 1000), Ethiopian TIN (10 digits), SWIFT BIC (8/11 chars).
//
// Single source of truth for the API. The UI carries an identical copy at
// ui/src/utils/fieldValidation.ts (the two packages share no code); keep
// them in sync — any rule change must land in both files.
//
// Country dial codes: ITU E.164 assignments, taken from the public
// country/dial-code dataset (gist ggeorgaras/8699cbe22704e5c840f3bea4da4eaaf6)
// with corrections: Cayman Islands +1345 (source had "+ 345"), Puerto Rico
// and Dominican Republic +1 (NANP, source listed area-code forms +1939 /
// +1849), Netherlands Antilles dropped (dissolved 2010) with Curacao +599
// and Sint Maarten +1721 added, Heard Island dropped (no phone service),
// names normalised (Cabo Verde, Eswatini, North Macedonia, etc.).

export interface CountryCode {
  /** ISO 3166-1 alpha-2 code, e.g. 'ET'. */
  code: string;
  name: string;
  /** Dial code WITHOUT the leading '+', e.g. '251'. */
  dial: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  { code: 'AF', name: 'Afghanistan', dial: '93' },
  { code: 'AX', name: 'Åland Islands', dial: '358' },
  { code: 'AL', name: 'Albania', dial: '355' },
  { code: 'DZ', name: 'Algeria', dial: '213' },
  { code: 'AS', name: 'American Samoa', dial: '1684' },
  { code: 'AD', name: 'Andorra', dial: '376' },
  { code: 'AO', name: 'Angola', dial: '244' },
  { code: 'AI', name: 'Anguilla', dial: '1264' },
  { code: 'AQ', name: 'Antarctica', dial: '672' },
  { code: 'AG', name: 'Antigua and Barbuda', dial: '1268' },
  { code: 'AR', name: 'Argentina', dial: '54' },
  { code: 'AM', name: 'Armenia', dial: '374' },
  { code: 'AW', name: 'Aruba', dial: '297' },
  { code: 'AU', name: 'Australia', dial: '61' },
  { code: 'AT', name: 'Austria', dial: '43' },
  { code: 'AZ', name: 'Azerbaijan', dial: '994' },
  { code: 'BS', name: 'Bahamas', dial: '1242' },
  { code: 'BH', name: 'Bahrain', dial: '973' },
  { code: 'BD', name: 'Bangladesh', dial: '880' },
  { code: 'BB', name: 'Barbados', dial: '1246' },
  { code: 'BY', name: 'Belarus', dial: '375' },
  { code: 'BE', name: 'Belgium', dial: '32' },
  { code: 'BZ', name: 'Belize', dial: '501' },
  { code: 'BJ', name: 'Benin', dial: '229' },
  { code: 'BM', name: 'Bermuda', dial: '1441' },
  { code: 'BT', name: 'Bhutan', dial: '975' },
  { code: 'BO', name: 'Bolivia', dial: '591' },
  { code: 'BA', name: 'Bosnia and Herzegovina', dial: '387' },
  { code: 'BW', name: 'Botswana', dial: '267' },
  { code: 'BV', name: 'Bouvet Island', dial: '47' },
  { code: 'BR', name: 'Brazil', dial: '55' },
  { code: 'IO', name: 'British Indian Ocean Territory', dial: '246' },
  { code: 'BN', name: 'Brunei', dial: '673' },
  { code: 'BG', name: 'Bulgaria', dial: '359' },
  { code: 'BF', name: 'Burkina Faso', dial: '226' },
  { code: 'BI', name: 'Burundi', dial: '257' },
  { code: 'KH', name: 'Cambodia', dial: '855' },
  { code: 'CM', name: 'Cameroon', dial: '237' },
  { code: 'CA', name: 'Canada', dial: '1' },
  { code: 'CV', name: 'Cabo Verde', dial: '238' },
  { code: 'KY', name: 'Cayman Islands', dial: '1345' },
  { code: 'CF', name: 'Central African Republic', dial: '236' },
  { code: 'TD', name: 'Chad', dial: '235' },
  { code: 'CL', name: 'Chile', dial: '56' },
  { code: 'CN', name: 'China', dial: '86' },
  { code: 'CX', name: 'Christmas Island', dial: '61' },
  { code: 'CC', name: 'Cocos (Keeling) Islands', dial: '61' },
  { code: 'CO', name: 'Colombia', dial: '57' },
  { code: 'KM', name: 'Comoros', dial: '269' },
  { code: 'CG', name: 'Congo', dial: '242' },
  { code: 'CD', name: 'Congo, Democratic Republic of the', dial: '243' },
  { code: 'CK', name: 'Cook Islands', dial: '682' },
  { code: 'CR', name: 'Costa Rica', dial: '506' },
  { code: 'CI', name: "Côte d'Ivoire", dial: '225' },
  { code: 'HR', name: 'Croatia', dial: '385' },
  { code: 'CU', name: 'Cuba', dial: '53' },
  { code: 'CW', name: 'Curaçao', dial: '599' },
  { code: 'CY', name: 'Cyprus', dial: '357' },
  { code: 'CZ', name: 'Czech Republic', dial: '420' },
  { code: 'DK', name: 'Denmark', dial: '45' },
  { code: 'DJ', name: 'Djibouti', dial: '253' },
  { code: 'DM', name: 'Dominica', dial: '1767' },
  { code: 'DO', name: 'Dominican Republic', dial: '1' },
  { code: 'EC', name: 'Ecuador', dial: '593' },
  { code: 'EG', name: 'Egypt', dial: '20' },
  { code: 'SV', name: 'El Salvador', dial: '503' },
  { code: 'GQ', name: 'Equatorial Guinea', dial: '240' },
  { code: 'ER', name: 'Eritrea', dial: '291' },
  { code: 'EE', name: 'Estonia', dial: '372' },
  { code: 'SZ', name: 'Eswatini', dial: '268' },
  { code: 'ET', name: 'Ethiopia', dial: '251' },
  { code: 'FK', name: 'Falkland Islands', dial: '500' },
  { code: 'FO', name: 'Faroe Islands', dial: '298' },
  { code: 'FJ', name: 'Fiji', dial: '679' },
  { code: 'FI', name: 'Finland', dial: '358' },
  { code: 'FR', name: 'France', dial: '33' },
  { code: 'GF', name: 'French Guiana', dial: '594' },
  { code: 'PF', name: 'French Polynesia', dial: '689' },
  { code: 'TF', name: 'French Southern Territories', dial: '262' },
  { code: 'GA', name: 'Gabon', dial: '241' },
  { code: 'GM', name: 'Gambia', dial: '220' },
  { code: 'GE', name: 'Georgia', dial: '995' },
  { code: 'DE', name: 'Germany', dial: '49' },
  { code: 'GH', name: 'Ghana', dial: '233' },
  { code: 'GI', name: 'Gibraltar', dial: '350' },
  { code: 'GR', name: 'Greece', dial: '30' },
  { code: 'GL', name: 'Greenland', dial: '299' },
  { code: 'GD', name: 'Grenada', dial: '1473' },
  { code: 'GP', name: 'Guadeloupe', dial: '590' },
  { code: 'GU', name: 'Guam', dial: '1671' },
  { code: 'GT', name: 'Guatemala', dial: '502' },
  { code: 'GG', name: 'Guernsey', dial: '44' },
  { code: 'GN', name: 'Guinea', dial: '224' },
  { code: 'GW', name: 'Guinea-Bissau', dial: '245' },
  { code: 'GY', name: 'Guyana', dial: '592' },
  { code: 'HT', name: 'Haiti', dial: '509' },
  { code: 'HN', name: 'Honduras', dial: '504' },
  { code: 'HK', name: 'Hong Kong', dial: '852' },
  { code: 'HU', name: 'Hungary', dial: '36' },
  { code: 'IS', name: 'Iceland', dial: '354' },
  { code: 'IN', name: 'India', dial: '91' },
  { code: 'ID', name: 'Indonesia', dial: '62' },
  { code: 'IR', name: 'Iran', dial: '98' },
  { code: 'IQ', name: 'Iraq', dial: '964' },
  { code: 'IE', name: 'Ireland', dial: '353' },
  { code: 'IM', name: 'Isle of Man', dial: '44' },
  { code: 'IL', name: 'Israel', dial: '972' },
  { code: 'IT', name: 'Italy', dial: '39' },
  { code: 'JM', name: 'Jamaica', dial: '1876' },
  { code: 'JP', name: 'Japan', dial: '81' },
  { code: 'JE', name: 'Jersey', dial: '44' },
  { code: 'JO', name: 'Jordan', dial: '962' },
  { code: 'KZ', name: 'Kazakhstan', dial: '7' },
  { code: 'KE', name: 'Kenya', dial: '254' },
  { code: 'KI', name: 'Kiribati', dial: '686' },
  { code: 'KP', name: 'North Korea', dial: '850' },
  { code: 'KR', name: 'South Korea', dial: '82' },
  { code: 'XK', name: 'Kosovo', dial: '383' },
  { code: 'KW', name: 'Kuwait', dial: '965' },
  { code: 'KG', name: 'Kyrgyzstan', dial: '996' },
  { code: 'LA', name: 'Laos', dial: '856' },
  { code: 'LV', name: 'Latvia', dial: '371' },
  { code: 'LB', name: 'Lebanon', dial: '961' },
  { code: 'LS', name: 'Lesotho', dial: '266' },
  { code: 'LR', name: 'Liberia', dial: '231' },
  { code: 'LY', name: 'Libya', dial: '218' },
  { code: 'LI', name: 'Liechtenstein', dial: '423' },
  { code: 'LT', name: 'Lithuania', dial: '370' },
  { code: 'LU', name: 'Luxembourg', dial: '352' },
  { code: 'MO', name: 'Macao', dial: '853' },
  { code: 'MK', name: 'North Macedonia', dial: '389' },
  { code: 'MG', name: 'Madagascar', dial: '261' },
  { code: 'MW', name: 'Malawi', dial: '265' },
  { code: 'MY', name: 'Malaysia', dial: '60' },
  { code: 'MV', name: 'Maldives', dial: '960' },
  { code: 'ML', name: 'Mali', dial: '223' },
  { code: 'MT', name: 'Malta', dial: '356' },
  { code: 'MH', name: 'Marshall Islands', dial: '692' },
  { code: 'MQ', name: 'Martinique', dial: '596' },
  { code: 'MR', name: 'Mauritania', dial: '222' },
  { code: 'MU', name: 'Mauritius', dial: '230' },
  { code: 'YT', name: 'Mayotte', dial: '262' },
  { code: 'MX', name: 'Mexico', dial: '52' },
  { code: 'FM', name: 'Micronesia', dial: '691' },
  { code: 'MD', name: 'Moldova', dial: '373' },
  { code: 'MC', name: 'Monaco', dial: '377' },
  { code: 'MN', name: 'Mongolia', dial: '976' },
  { code: 'ME', name: 'Montenegro', dial: '382' },
  { code: 'MS', name: 'Montserrat', dial: '1664' },
  { code: 'MA', name: 'Morocco', dial: '212' },
  { code: 'MZ', name: 'Mozambique', dial: '258' },
  { code: 'MM', name: 'Myanmar', dial: '95' },
  { code: 'NA', name: 'Namibia', dial: '264' },
  { code: 'NR', name: 'Nauru', dial: '674' },
  { code: 'NP', name: 'Nepal', dial: '977' },
  { code: 'NL', name: 'Netherlands', dial: '31' },
  { code: 'NC', name: 'New Caledonia', dial: '687' },
  { code: 'NZ', name: 'New Zealand', dial: '64' },
  { code: 'NI', name: 'Nicaragua', dial: '505' },
  { code: 'NE', name: 'Niger', dial: '227' },
  { code: 'NG', name: 'Nigeria', dial: '234' },
  { code: 'NU', name: 'Niue', dial: '683' },
  { code: 'NF', name: 'Norfolk Island', dial: '672' },
  { code: 'MP', name: 'Northern Mariana Islands', dial: '1670' },
  { code: 'NO', name: 'Norway', dial: '47' },
  { code: 'OM', name: 'Oman', dial: '968' },
  { code: 'PK', name: 'Pakistan', dial: '92' },
  { code: 'PW', name: 'Palau', dial: '680' },
  { code: 'PS', name: 'Palestine', dial: '970' },
  { code: 'PA', name: 'Panama', dial: '507' },
  { code: 'PG', name: 'Papua New Guinea', dial: '675' },
  { code: 'PY', name: 'Paraguay', dial: '595' },
  { code: 'PE', name: 'Peru', dial: '51' },
  { code: 'PH', name: 'Philippines', dial: '63' },
  { code: 'PN', name: 'Pitcairn', dial: '64' },
  { code: 'PL', name: 'Poland', dial: '48' },
  { code: 'PT', name: 'Portugal', dial: '351' },
  { code: 'PR', name: 'Puerto Rico', dial: '1' },
  { code: 'QA', name: 'Qatar', dial: '974' },
  { code: 'RO', name: 'Romania', dial: '40' },
  { code: 'RU', name: 'Russia', dial: '7' },
  { code: 'RW', name: 'Rwanda', dial: '250' },
  { code: 'RE', name: 'Réunion', dial: '262' },
  { code: 'BL', name: 'Saint Barthélemy', dial: '590' },
  { code: 'SH', name: 'Saint Helena, Ascension and Tristan da Cunha', dial: '290' },
  { code: 'KN', name: 'Saint Kitts and Nevis', dial: '1869' },
  { code: 'LC', name: 'Saint Lucia', dial: '1758' },
  { code: 'MF', name: 'Saint Martin', dial: '590' },
  { code: 'PM', name: 'Saint Pierre and Miquelon', dial: '508' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dial: '1784' },
  { code: 'WS', name: 'Samoa', dial: '685' },
  { code: 'SM', name: 'San Marino', dial: '378' },
  { code: 'ST', name: 'São Tomé and Príncipe', dial: '239' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966' },
  { code: 'SN', name: 'Senegal', dial: '221' },
  { code: 'RS', name: 'Serbia', dial: '381' },
  { code: 'SC', name: 'Seychelles', dial: '248' },
  { code: 'SL', name: 'Sierra Leone', dial: '232' },
  { code: 'SG', name: 'Singapore', dial: '65' },
  { code: 'SX', name: 'Sint Maarten', dial: '1721' },
  { code: 'SK', name: 'Slovakia', dial: '421' },
  { code: 'SI', name: 'Slovenia', dial: '386' },
  { code: 'SB', name: 'Solomon Islands', dial: '677' },
  { code: 'SO', name: 'Somalia', dial: '252' },
  { code: 'ZA', name: 'South Africa', dial: '27' },
  { code: 'SS', name: 'South Sudan', dial: '211' },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands', dial: '500' },
  { code: 'ES', name: 'Spain', dial: '34' },
  { code: 'LK', name: 'Sri Lanka', dial: '94' },
  { code: 'SD', name: 'Sudan', dial: '249' },
  { code: 'SR', name: 'Suriname', dial: '597' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen', dial: '47' },
  { code: 'SE', name: 'Sweden', dial: '46' },
  { code: 'CH', name: 'Switzerland', dial: '41' },
  { code: 'SY', name: 'Syria', dial: '963' },
  { code: 'TW', name: 'Taiwan', dial: '886' },
  { code: 'TJ', name: 'Tajikistan', dial: '992' },
  { code: 'TZ', name: 'Tanzania', dial: '255' },
  { code: 'TH', name: 'Thailand', dial: '66' },
  { code: 'TL', name: 'Timor-Leste', dial: '670' },
  { code: 'TG', name: 'Togo', dial: '228' },
  { code: 'TK', name: 'Tokelau', dial: '690' },
  { code: 'TO', name: 'Tonga', dial: '676' },
  { code: 'TT', name: 'Trinidad and Tobago', dial: '1868' },
  { code: 'TN', name: 'Tunisia', dial: '216' },
  { code: 'TR', name: 'Turkey', dial: '90' },
  { code: 'TM', name: 'Turkmenistan', dial: '993' },
  { code: 'TC', name: 'Turks and Caicos Islands', dial: '1649' },
  { code: 'TV', name: 'Tuvalu', dial: '688' },
  { code: 'UG', name: 'Uganda', dial: '256' },
  { code: 'UA', name: 'Ukraine', dial: '380' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971' },
  { code: 'GB', name: 'United Kingdom', dial: '44' },
  { code: 'US', name: 'United States', dial: '1' },
  { code: 'UY', name: 'Uruguay', dial: '598' },
  { code: 'UZ', name: 'Uzbekistan', dial: '998' },
  { code: 'VU', name: 'Vanuatu', dial: '678' },
  { code: 'VA', name: 'Vatican City', dial: '379' },
  { code: 'VE', name: 'Venezuela', dial: '58' },
  { code: 'VN', name: 'Vietnam', dial: '84' },
  { code: 'VG', name: 'British Virgin Islands', dial: '1284' },
  { code: 'VI', name: 'U.S. Virgin Islands', dial: '1340' },
  { code: 'WF', name: 'Wallis and Futuna', dial: '681' },
  { code: 'YE', name: 'Yemen', dial: '967' },
  { code: 'ZM', name: 'Zambia', dial: '260' },
  { code: 'ZW', name: 'Zimbabwe', dial: '263' },
];

export const DEFAULT_COUNTRY_CODE = 'ET';

/** NANP (North American Numbering Plan) area dial codes other than +1
 *  itself: after the area code the national (subscriber) number is
 *  exactly 7 digits. */
export const NANP_AREA_DIALS = new Set([
  '1242', '1246', '1264', '1268', '1284', '1340', '1441', '1473',
  '1649', '1664', '1670', '1671', '1684', '1721', '1758', '1767',
  '1784', '1868', '1869', '1876',
]);

export function getCountryByCode(code: string): CountryCode | undefined {
  return COUNTRY_CODES.find((c) => c.code === code.toUpperCase());
}

/**
 * Several dial codes are shared by multiple countries (NANP +1, +7
 * Russia/Kazakhstan, +44 UK/Crown Dependencies, +47 Norway/Bouvet/Svalbard,
 * +61 Australia/Christmas/Cocos, +64 NZ/Pitcairn, +262 Réunion/Mayotte/
 * French Southern Territories, +358 Finland/Åland, +590 Guadeloupe/St
 * Barthélemy/St Martin, +672 Antarctica/Norfolk). The numbering RULE is
 * identical for every country sharing a code, so validation is unaffected —
 * but error messages and the phone input's country display must name the
 * primary (civilian) holder, not whichever entry sorts first.
 */
const PRIMARY_COUNTRY_FOR_DIAL: Record<string, string> = {
  '1': 'US',
  '7': 'RU',
  '44': 'GB',
  '47': 'NO',
  '61': 'AU',
  '64': 'NZ',
  '262': 'RE',
  '358': 'FI',
  '590': 'GP',
  '672': 'NF',
};

export function getCountryByDial(dial: string): CountryCode | undefined {
  const primary = PRIMARY_COUNTRY_FOR_DIAL[dial];
  if (primary) return getCountryByCode(primary);
  return COUNTRY_CODES.find((c) => c.dial === dial);
}

/**
 * National-number length rule for a dial code.
 * Returns { min, max } digits for the part after the country dial code.
 * Exact rules exist where the numbering plan is unambiguous:
 *  - Ethiopia (+251): 9 digits (mobile 9xxxxxxxx; landlines 1xxxxxxxx).
 *  - NANP +1 (US/CA/PR/DO): 10 digits; other NANP area codes: 7 digits.
 *  - United Kingdom (+44): 10 digits.
 * Everything else: the E.164 envelope (4–13 national digits, 7–15 total).
 */
export function nationalLengthForDial(dial: string): { min: number; max: number } {
  if (dial === '251') return { min: 9, max: 9 };
  if (dial === '1') return { min: 10, max: 10 };
  if (NANP_AREA_DIALS.has(dial)) return { min: 7, max: 7 };
  if (dial === '44') return { min: 10, max: 10 };
  return { min: 4, max: 13 };
}

/** Max national digits the UI should allow typing for a country. */
export function maxNationalLengthForCountry(code: string): number {
  const country = getCountryByCode(code);
  if (!country) return 13;
  const rule = nationalLengthForDial(country.dial);
  // Never exceed the E.164 total of 15 digits.
  return Math.min(rule.max, 15 - country.dial.length);
}

export interface PhoneValidationResult {
  valid: boolean;
  /** Normalised E.164 form (e.g. '+251911234567'), present when valid. */
  normalized?: string;
  /** Human-readable failure reason, present when invalid. */
  error?: string;
  country?: CountryCode;
  national?: string;
}

/**
 * Validate a phone number. Accepts E.164 (`+251911234567`, with spaces,
 * dashes or parentheses tolerated) and — as a legacy compat — a bare
 * Ethiopian number (`0911234567` or `911234567`, normalised to +251).
 * Any other number without a country code is rejected: the caller must
 * pick a country.
 */
export function validatePhoneNumber(raw: unknown): PhoneValidationResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { valid: false, error: 'Phone number is required' };
  }
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');
  let digits = cleaned;

  if (cleaned.startsWith('+')) {
    digits = cleaned.slice(1);
    if (!/^\d+$/.test(digits)) {
      return { valid: false, error: 'Phone number must contain only digits after the country code (+)' };
    }
  } else {
    // Legacy bare Ethiopian number: 09xxxxxxxx or 9xxxxxxxx.
    if (!/^\d+$/.test(cleaned)) {
      return { valid: false, error: 'Phone number must contain only digits, with a country code (e.g. +251911234567)' };
    }
    if (/^09\d{8}$/.test(cleaned)) return validatePhoneNumber(`+251${cleaned.slice(1)}`);
    if (/^9\d{8}$/.test(cleaned)) return validatePhoneNumber(`+251${cleaned}`);
    return { valid: false, error: 'Phone number must include a country code, e.g. +251911234567' };
  }

  if (digits.length < 7 || digits.length > 15) {
    return { valid: false, error: 'Phone number must be 7 to 15 digits including the country code (E.164)' };
  }
  // Longest matching dial prefix wins (e.g. 1242 beats 1).
  const dials = [...new Set(COUNTRY_CODES.map((c) => c.dial))].sort((a, b) => b.length - a.length);
  const dial = dials.find((d) => digits.startsWith(d));
  if (!dial) {
    return { valid: false, error: 'Phone number has an unknown country code' };
  }
  const country = getCountryByDial(dial);
  const national = digits.slice(dial.length);
  const rule = nationalLengthForDial(dial);
  if (national.length < rule.min || national.length > rule.max) {
    if (rule.min === rule.max) {
      return {
        valid: false,
        country,
        national,
        error: `Phone number for ${country?.name || `+${dial}`} must have exactly ${rule.min} digits after the country code +${dial} (got ${national.length})`,
      };
    }
    return {
      valid: false,
      country,
      national,
      error: `Phone number for ${country?.name || `+${dial}`} must have ${rule.min} to ${rule.max} digits after the country code +${dial} (got ${national.length})`,
    };
  }
  if (dial === '251' && !/^[1-9]/.test(national)) {
    return { valid: false, country, national, error: 'Ethiopian phone number must start with 9 (mobile) or 1 (landline) after +251' };
  }
  if (dial === '1' && !/^[2-9]/.test(national)) {
    return { valid: false, country, national, error: 'North American phone number must not start with 0 or 1 after +1' };
  }
  return { valid: true, normalized: `+${digits}`, country, national };
}

/**
 * Split an E.164 (or legacy bare Ethiopian) number into its country code
 * and national part, for the phone input component. Returns null when the
 * value cannot be parsed.
 */
export function parsePhoneNumber(raw: string): { countryCode: string; national: string } | null {
  const result = validatePhoneNumber(raw);
  if (!result.valid || !result.country || result.national === undefined) {
    // Still try to split a partially-typed value for display purposes.
    const cleaned = raw.trim().replace(/[\s\-().]/g, '');
    if (cleaned.startsWith('+')) {
      const digits = cleaned.slice(1);
      const dials = [...new Set(COUNTRY_CODES.map((c) => c.dial))].sort((a, b) => b.length - a.length);
      const dial = dials.find((d) => digits.startsWith(d));
      if (dial) {
        const country = getCountryByDial(dial);
        if (country) return { countryCode: country.code, national: digits.slice(dial.length).replace(/\D/g, '') };
      }
    }
    return null;
  }
  return { countryCode: result.country.code, national: result.national };
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

/** Commercial Bank of Ethiopia — 13 digits starting with 1000. */
export const CBE_ACCOUNT_RE = /^1000\d{9}$/;

/**
 * The 15 Ethiopian banks listed in ui/src/utils/banks.ts. No published
 * per-bank account-number prefix/length could be established for any bank
 * other than CBE (web search, 2026-11-16), so they share the Ethiopian
 * 13-digit customer-account standard (US SSA IDD coding for Ethiopia
 * specifies a "13-digit Customer Account Number"). Do NOT invent a prefix
 * for these banks — if a real prefix is ever published, add it here.
 */
export const ETHIOPIAN_BANK_NAMES: string[] = [
  'Commercial Bank of Ethiopia',
  'Bank of Abyssinia',
  'Dashen Bank',
  'Awash International Bank',
  'Wegagen Bank',
  'United Bank',
  'Nib International Bank',
  'Cooperative Bank of Oromia',
  'Lion International Bank',
  'Zemen Bank',
  'Bunna International Bank',
  'Berhan International Bank',
  'Abay Bank',
  'Addis International Bank',
  'Enat Bank',
];

export function isCommercialBankOfEthiopia(bankNameOrId: string | undefined | null): boolean {
  if (!bankNameOrId) return false;
  const b = bankNameOrId.trim().toLowerCase();
  return b === 'cbe' || b.includes('commercial bank of ethiopia');
}

export function isKnownEthiopianBank(bankNameOrId: string | undefined | null): boolean {
  if (!bankNameOrId) return false;
  const b = bankNameOrId.trim().toLowerCase();
  if (isCommercialBankOfEthiopia(bankNameOrId)) return true;
  return ETHIOPIAN_BANK_NAMES.some((n) => n.toLowerCase() === b || b.includes(n.toLowerCase()));
}

export interface BankAccountValidationResult {
  valid: boolean;
  /** Which rule was applied: 'cbe' | 'ethiopian' | 'generic'. */
  rule?: 'cbe' | 'ethiopian' | 'generic';
  error?: string;
}

/**
 * Validate a bank account number against the selected bank.
 *  - CBE: exactly 13 digits starting with 1000 (1000xxxxxxxxx).
 *  - Other known Ethiopian banks: exactly 13 digits.
 *  - Any other / unknown bank: 8–17 digits, or an IBAN-shaped value.
 * Spaces and dashes are ignored. When no bank is given, the Ethiopian
 * 13-digit rule applies (every account field in this system is for an
 * Ethiopian bank unless a foreign bank is named).
 */
export function validateBankAccount(
  bankNameOrId: string | undefined | null,
  raw: unknown,
): BankAccountValidationResult {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { valid: false, error: 'Bank account number is required' };
  }
  const account = raw.trim().replace(/[\s-]/g, '');
  if (isCommercialBankOfEthiopia(bankNameOrId)) {
    if (!CBE_ACCOUNT_RE.test(account)) {
      return {
        valid: false,
        rule: 'cbe',
        error: 'Commercial Bank of Ethiopia account number must be exactly 13 digits starting with 1000 (1000xxxxxxxxx)',
      };
    }
    return { valid: true, rule: 'cbe' };
  }
  if (isKnownEthiopianBank(bankNameOrId) || !bankNameOrId) {
    if (!/^\d{13}$/.test(account)) {
      return {
        valid: false,
        rule: 'ethiopian',
        error: 'Ethiopian bank account number must be exactly 13 digits',
      };
    }
    return { valid: true, rule: 'ethiopian' };
  }
  // Foreign / unknown bank: generic length rule, or IBAN shape.
  if (/^\d{8,17}$/.test(account)) return { valid: true, rule: 'generic' };
  if (/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(account.toUpperCase())) {
    return { valid: true, rule: 'generic' };
  }
  return {
    valid: false,
    rule: 'generic',
    error: 'Bank account number must be 8 to 17 digits (or an IBAN) for this bank',
  };
}

/** Helper text for a bank-account input, given the selected bank. */
export function bankAccountHelperText(bankNameOrId: string | undefined | null): string {
  if (isCommercialBankOfEthiopia(bankNameOrId)) {
    return '13 digits starting with 1000 (1000xxxxxxxxx)';
  }
  if (isKnownEthiopianBank(bankNameOrId) || !bankNameOrId) {
    return 'Exactly 13 digits';
  }
  return '8 to 17 digits (or IBAN)';
}

// ---------------------------------------------------------------------------
// TIN, BIC
// ---------------------------------------------------------------------------

/** Ethiopian TIN: exactly 10 digits; branches may add a -NN sub-TIN suffix. */
export const TIN_RE = /^\d{10}(-\d{1,2})?$/;

export function validateTIN(raw: unknown): { valid: boolean; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { valid: false, error: 'TIN number is required' };
  }
  if (!TIN_RE.test(raw.trim())) {
    return { valid: false, error: 'TIN must be exactly 10 digits (branches may add a -NN suffix, e.g. 0012814908-14)' };
  }
  return { valid: true };
}

/** SWIFT BIC (ISO 9362): 6 letters + 2 alphanumerics + optional 3 alphanumerics. */
export const BIC_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export function validateBIC(raw: unknown, label = 'BIC'): { valid: boolean; error?: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { valid: false, error: `${label} is required` };
  }
  if (!BIC_RE.test(raw.trim().toUpperCase())) {
    return { valid: false, error: `${label} must be a valid BIC (8 or 11 characters, e.g. CBETETAA)` };
  }
  return { valid: true };
}
