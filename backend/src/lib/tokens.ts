/**
 * Token-amount normalization and display formatting.
 *
 * The system must support ANY token amount (50M, 100M, 500M, 750M, 1B, 2B,
 * 5B, 10B, 20B, …) without hardcoding package types. Admin may type an amount
 * as a raw number (`2000000000`), with separators (`2,000,000,000`), or with a
 * suffix (`2B`, `500M`, `1.5B`). We normalize everything to a canonical
 * BigInt count of tokens, and derive a human display label from that count.
 */

const SUFFIX_MULTIPLIERS: Record<string, bigint> = {
  K: 1_000n,
  M: 1_000_000n,
  B: 1_000_000_000n,
  T: 1_000_000_000_000n,
};

/**
 * Parse a human token amount into an exact BigInt.
 * Accepts: "2000000000", "2,000,000,000", "2B", "500M", "1.5B", "50m".
 * Throws on invalid / non-positive input.
 */
export function normalizeTokens(input: string | number | bigint): bigint {
  if (typeof input === 'bigint') {
    assertPositive(input);
    return input;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) throw new Error('Invalid token amount');
    return BigInt(Math.round(input));
  }

  let s = input.trim().toUpperCase().replace(/,/g, '').replace(/\s+/g, '');
  if (s === '') throw new Error('Empty token amount');

  const suffixMatch = s.match(/^([0-9]*\.?[0-9]+)([KMBT])$/);
  if (suffixMatch) {
    const [, numPart, suffix] = suffixMatch;
    const mult = SUFFIX_MULTIPLIERS[suffix];
    const value = parseDecimalTimesMultiplier(numPart, mult);
    assertPositive(value);
    return value;
  }

  if (/^[0-9]+$/.test(s)) {
    const value = BigInt(s);
    assertPositive(value);
    return value;
  }

  // Allow a bare decimal like "2000000000.0"
  if (/^[0-9]*\.?[0-9]+$/.test(s)) {
    const value = BigInt(Math.round(Number(s)));
    assertPositive(value);
    return value;
  }

  throw new Error(`Cannot parse token amount: "${input}"`);
}

function parseDecimalTimesMultiplier(numPart: string, mult: bigint): bigint {
  if (!numPart.includes('.')) return BigInt(numPart) * mult;
  const [whole, frac] = numPart.split('.');
  // value = (whole.frac) * mult, computed exactly in integer space.
  const scale = BigInt(10) ** BigInt(frac.length);
  const scaledNum = BigInt(whole + frac); // whole followed by frac digits
  const product = scaledNum * mult;
  if (product % scale !== 0n) {
    // Non-integer token count (e.g. 1.2345B). Round to nearest integer.
    return (product + scale / 2n) / scale;
  }
  return product / scale;
}

function assertPositive(v: bigint) {
  if (v <= 0n) throw new Error('Token amount must be positive');
}

/**
 * Human display label for a token count, e.g.:
 *   2_000_000_000n -> "2B"
 *   1_500_000_000n -> "1.5B"
 *   500_000_000n   -> "500M"
 *   50_000_000n    -> "50M"
 *   750_000_000n   -> "750M"
 * Falls back to grouped digits for amounts that don't map cleanly.
 */
export function formatTokensShort(tokens: bigint | string | number): string {
  const t = typeof tokens === 'bigint' ? tokens : BigInt(tokens);
  const units: Array<[bigint, string]> = [
    [SUFFIX_MULTIPLIERS.T, 'T'],
    [SUFFIX_MULTIPLIERS.B, 'B'],
    [SUFFIX_MULTIPLIERS.M, 'M'],
    [SUFFIX_MULTIPLIERS.K, 'K'],
  ];
  for (const [unit, suffix] of units) {
    if (t >= unit) {
      // one decimal place, trimmed
      const whole = t / unit;
      const remainder = t % unit;
      if (remainder === 0n) return `${whole}${suffix}`;
      const tenths = (remainder * 10n) / unit;
      if (tenths === 0n) return `${whole}${suffix}`;
      return `${whole}.${tenths}${suffix}`;
    }
  }
  return t.toString();
}

/** Default package name for a token count, e.g. "2B Tokens". */
export function defaultPackageName(tokens: bigint | string | number): string {
  return `${formatTokensShort(tokens)} Tokens`;
}

/** Grouped digits for full display, e.g. 2000000000 -> "2,000,000,000". */
export function formatTokensFull(tokens: bigint | string | number): string {
  const t = typeof tokens === 'bigint' ? tokens : BigInt(tokens);
  return t.toLocaleString('en-US');
}
