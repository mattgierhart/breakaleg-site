// Show codes: format, check character, normalisation (CONTRACT.md section 2).
// Shared by the Functions, the link page and tools/castpack.mjs.

export const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ'; // 31 characters, no 0 O 1 I U
export const CODE_LENGTH = 8;

/** Check character for the first 7 characters: alphabet[ sum((i+1) * index(c_i)) mod 31 ]. */
export function checkChar(first7) {
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const idx = ALPHABET.indexOf(first7[i]);
    if (idx < 0) return null;
    sum += (i + 1) * idx;
  }
  return ALPHABET[sum % ALPHABET.length];
}

/**
 * Turn whatever was typed, pasted or linked into the canonical 8-character code,
 * or return null when it is not a valid code.
 * - A value with a slash is treated as a URL: the last non-empty path component is used.
 * - Everything except A-Z, a-z and 0-9 is dropped, then the rest is upper-cased.
 *   (Stripping first keeps odd Unicode such as the German sharp s from turning into letters.)
 * - No look-alike mapping: 0 stays 0 and is rejected.
 */
export function normaliseCode(input) {
  if (typeof input !== 'string') return null;
  let s = input;
  if (s.includes('/')) {
    const path = s.split(/[?#]/)[0];
    const parts = path.split('/').filter((p) => p.length > 0);
    s = parts.length ? parts[parts.length - 1] : '';
  }
  s = s.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (s.length !== CODE_LENGTH) return null;
  for (const c of s) if (ALPHABET.indexOf(c) < 0) return null;
  if (checkChar(s.slice(0, 7)) !== s[7]) return null;
  return s;
}

export function isValidCode(input) {
  return normaliseCode(input) !== null;
}

/** ABCDEFGH -> ABCD-EFGH */
export function displayCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** A new random code (7 random characters plus the check character). Uses crypto randomness. */
export function generateCode(getRandomValues = (b) => crypto.getRandomValues(b)) {
  let first7 = '';
  const limit = 256 - (256 % ALPHABET.length); // reject bytes >= 248 so every letter is equally likely
  while (first7.length < 7) {
    const bytes = getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < limit && first7.length < 7) first7 += ALPHABET[b % ALPHABET.length];
    }
  }
  return first7 + checkChar(first7);
}
