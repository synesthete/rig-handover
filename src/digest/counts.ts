import type { DigestNight } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Log lines by status for one night, summed over rows: ok = runs − retries − fails.
export function nightCounts(digest: DigestNight): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) {
    counts.retry += row.retries;
    counts.fail += row.fails;
    counts.ok += row.runs - row.retries - row.fails;
  }
  return counts;
}
