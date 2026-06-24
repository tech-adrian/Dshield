// Token + formatting helpers shared across the app. Centralized here so the
// deposit, withdraw, compliance, and history views agree on decimals, the
// symbol, and how stroop <-> USDC conversions round.

export const TOKEN_DECIMALS = 7;
export const TOKEN_SYMBOL = "USDC";

const SCALE = 10 ** TOKEN_DECIMALS;

/**
 * Convert a stroop string to a human USDC string. Returns "0" for zero/invalid
 * input. No fixed precision — trailing zeros are dropped (Number.toString).
 */
export function stroopsToUsdc(stroops: string): string {
  const n = Number(stroops);
  if (!n) return "0";
  return (n / SCALE).toString();
}

/** Convert a human USDC string to a stroop string. Returns "0" for invalid input. */
export function usdcToStroops(usdc: string): string {
  const n = parseFloat(usdc);
  if (isNaN(n)) return "0";
  return Math.round(n * SCALE).toString();
}

/** Format a stroop amount (number) as a whole-number USDC label, e.g. "100 USDC". */
export function formatStroops(stroops: number): string {
  return `${(stroops / SCALE).toFixed(0)} ${TOKEN_SYMBOL}`;
}

/** Like {@link formatStroops} but takes a string and renders "—" for zero. */
export function formatStroopsOrDash(stroops: string): string {
  const n = Number(stroops);
  if (!n) return "—";
  return `${(n / SCALE).toFixed(0)} ${TOKEN_SYMBOL}`;
}

/**
 * Truncate a long identifier to `lead` leading and `tail` trailing characters
 * joined by an ellipsis, e.g. `truncateMiddle(hash, 4, 4)` -> "ab12…ef90".
 * Strings already short enough are returned unchanged.
 */
export function truncateMiddle(value: string, lead = 4, tail = 4): string {
  if (value.length <= lead + tail) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
