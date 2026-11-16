// Shared phone-number input: a country-code selector covering every
// country (COUNTRY_CODES, 246 entries) + a national-number field whose
// length follows the selected country (validatePhoneNumber).
// Value is always a full E.164 string (e.g. '+251911234567'); onChange
// fires with the composed E.164 value (or '' when empty).
// Default country is Ethiopia (+251) to preserve the existing behaviour
// of every form that previously hardcoded +251.

import React, { useMemo } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY_CODE,
  getCountryByCode,
  maxNationalLengthForCountry,
  nationalLengthForDial,
  parsePhoneNumber,
  validatePhoneNumber,
} from '@/utils/fieldValidation';

interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  /** Show the validation error inline (drives error + helperText). */
  showError?: boolean;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  label = 'Phone Number',
  required = false,
  disabled = false,
  size = 'small',
  fullWidth = true,
  showError = true,
}) => {
  const parsed = useMemo(() => parsePhoneNumber(value || ''), [value]);
  const countryCode = parsed?.countryCode || DEFAULT_COUNTRY_CODE;
  const national = parsed?.national || (value && !value.startsWith('+') ? value.replace(/\D/g, '') : '');
  const country = getCountryByCode(countryCode) || getCountryByCode(DEFAULT_COUNTRY_CODE)!;
  const maxLen = maxNationalLengthForCountry(countryCode);
  const rule = nationalLengthForDial(country.dial);

  const validation = value ? validatePhoneNumber(value) : { valid: true as const };
  const error = showError && !!value && !validation.valid ? validation.error : undefined;
  const helperText =
    error ||
    (rule.min === rule.max
      ? `${rule.min} digits after +${country.dial}`
      : `${rule.min}–${rule.max} digits after +${country.dial}`);

  const handleCountryChange = (nextCode: string) => {
    const next = getCountryByCode(nextCode);
    if (!next) return;
    // Keep the typed national digits (truncated to the new country's max)
    // so switching country does not wipe what the user typed.
    const kept = national.replace(/\D/g, '').slice(0, maxNationalLengthForCountry(nextCode));
    onChange(kept ? `+${next.dial}${kept}` : '');
  };

  const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    onChange(digits ? `+${country.dial}${digits}` : '');
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, width: fullWidth ? '100%' : undefined }}>
      <FormControl size={size} sx={{ minWidth: 132, flexShrink: 0 }} disabled={disabled} data-testid="phone-country-select">
        <InputLabel id="phone-country-label">Country</InputLabel>
        <Select
          labelId="phone-country-label"
          value={countryCode}
          label="Country"
          onChange={(e) => handleCountryChange(e.target.value)}
        >
          {COUNTRY_CODES.map((c) => (
            <MenuItem key={c.code} value={c.code}>
              {c.name} (+{c.dial})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        required={required}
        size={size}
        label={label}
        value={national}
        onChange={handleNationalChange}
        disabled={disabled}
        inputProps={{ inputMode: 'numeric', maxLength: maxLen, pattern: '[0-9]*', 'aria-label': label }}
        error={!!error}
        helperText={helperText}
      />
    </Box>
  );
};

export default PhoneInput;
