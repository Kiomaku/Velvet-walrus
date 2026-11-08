/** Pure scheduling/limiting rules. No I/O here, so they are trivially unit-testable. */

/** Full-jitter exponential backoff: random(0, min(cap, base * 2^(attempt-1))) seconds. */
export function backoffSeconds(attempt: number, base = 2, cap = 900, rand: () => number = Math.random): number {
  const ceiling = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  return rand() * ceiling;
}

/**
 * Given the counter value AFTER an INCRBY of `want`, how many of those tokens
 * fit into this window's `perSecond` budget?
 */
export function grantedTokens(usedAfter: number, want: number, perSecond: number): number {
  return Math.max(0, Math.min(want, perSecond - (usedAfter - want)));
}
