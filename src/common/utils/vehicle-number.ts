/** Normalizes a plate for storage and lookups: "mp 04-ab 1234" -> "MP04AB1234". */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const STANDARD_PLATE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;
const BH_SERIES_PLATE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

export function isValidPlate(normalized: string): boolean {
  return STANDARD_PLATE.test(normalized) || BH_SERIES_PLATE.test(normalized);
}

/** Formats a normalized plate for display: "MP04AB1234" -> "MP 04 AB 1234". */
export function formatPlate(normalized: string): string {
  const std = normalized.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/);
  if (std) {
    return [std[1], std[2], std[3], std[4]].filter(Boolean).join(' ');
  }
  const bh = normalized.match(/^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/);
  if (bh) {
    return [bh[1], bh[2], bh[3], bh[4]].join(' ');
  }
  return normalized;
}
