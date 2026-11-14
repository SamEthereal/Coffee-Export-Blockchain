// Ethiopian Coffee Export Consortium Blockchain System (CECBS)
// HS-code (Harmonized System) validation.
//
// Format decided from the data this system already holds, not from a
// textbook alone. `customs_declarations.hs_code` on 2026-11-14 (138 rows):
//   090111   94 rows — 6 plain digits (unroasted green coffee, the export product)
//   0901.11  23 rows — same code written with a dot after the 4th digit
//   0901.21  11 rows — dotted, roasted coffee (legacy default, now unused)
//   0901     10 rows — 4-digit heading only (legacy; not a complete HS code)
// Every stored value is numeric (optionally one dot); no letters anywhere.
// The Harmonized System is 6 digits internationally, with national
// extensions to 8-10 digits. So the accepted format is:
//
//   6-10 digits, optionally written with a single dot after the 4th digit
//   (090111 and 0901.11 are the same code)
//
// Dotted input is NORMALIZED to plain digits before it is stored or sent
// to the chaincode, so the ledger and Postgres hold one canonical form
// and the tariff lookup (`WHERE hs_code = $1`) matches either spelling.
// A bare 4-digit heading (0901) is rejected: it is not a complete HS
// code for a declaration, even though 10 legacy rows carry it — those
// rows are untouched; validation applies to new input only.

export const HS_CODE_MESSAGE =
  'HS code must be 6-10 digits (e.g. 090111), optionally written with a dot after the first four digits (e.g. 0901.11)';

/** Accepts 6-10 plain digits, or a dotted form with the dot after digit 4. */
const HS_CODE_PATTERN = /^(?:\d{6,10}|\d{4}\.\d{2,6})$/;

export function isValidHsCode(value: unknown): value is string {
  return typeof value === 'string' && HS_CODE_PATTERN.test(value.trim());
}

/** Canonical form: strip the optional dot (0901.11 -> 090111). */
export function normalizeHsCode(value: string): string {
  return value.trim().replace('.', '');
}

/**
 * express-validator custom validator for an optional HS-code body field.
 * Throws (=> 400 VALIDATION_ERROR via validateRequest) on a malformed
 * value; passes silently when the field is absent (callers default it).
 */
export function hsCodeValidator(value: unknown): boolean {
  if (!isValidHsCode(value)) {
    throw new Error(HS_CODE_MESSAGE);
  }
  return true;
}
