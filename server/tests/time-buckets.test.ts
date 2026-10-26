/** Phase 3 unit tests: local-day boundary math (pure, deterministic). */
import { describe, expect, it } from 'vitest';
import { dueBucketBoundaries, localDayStartIso } from '../src/util/time.js';

const ms = (iso: string) => Date.parse(iso);

describe('localDayStartIso', () => {
  it('UTC (offset 0) floors to the UTC day', () => {
    expect(localDayStartIso(ms('2026-11-02T23:30:00Z'), 0)).toBe('2026-11-02T00:00:00.000Z');
    expect(localDayStartIso(ms('2026-11-02T00:01:00Z'), 0)).toBe('2026-11-02T00:00:00.000Z');
  });

  it('IST (+330) local midnight = previous day 18:30Z', () => {
    // 23:30Z Nov 2 is 05:00 Nov 3 in IST → local day starts 18:30Z Nov 2.
    expect(localDayStartIso(ms('2026-11-02T23:30:00Z'), 330)).toBe('2026-11-02T18:30:00.000Z');
    // 10:00Z Nov 2 is 15:30 IST Nov 2 → local day starts 18:30Z Nov 1.
    expect(localDayStartIso(ms('2026-11-02T10:00:00Z'), 330)).toBe('2026-11-01T18:30:00.000Z');
  });

  it('negative offsets (west) shift forward', () => {
    // New York (UTC−5): 02:00Z Nov 2 is 21:00 Nov 1 local → day starts 05:00Z Nov 1.
    expect(localDayStartIso(ms('2026-11-02T02:00:00Z'), -300)).toBe('2026-11-01T05:00:00.000Z');
  });

  it('dayShift advances whole local days exactly', () => {
    const d0 = localDayStartIso(ms('2026-11-02T12:00:00Z'), 330, 0);
    const d1 = localDayStartIso(ms('2026-11-02T12:00:00Z'), 330, 1);
    const d7 = localDayStartIso(ms('2026-11-02T12:00:00Z'), 330, 7);
    expect(ms(d1) - ms(d0)).toBe(86_400_000);
    expect(ms(d7) - ms(d0)).toBe(7 * 86_400_000);
  });
});

describe('dueBucketBoundaries', () => {
  it('orders now within [todayStart, weekEnd) and tomorrow between', () => {
    const b = dueBucketBoundaries(Date.now(), 0);
    const now = ms(b.nowIso);
    expect(now).toBeGreaterThanOrEqual(ms(b.todayStart));
    expect(now).toBeLessThan(ms(b.weekEnd));
    expect(ms(b.tomorrowStart) - ms(b.todayStart)).toBe(86_400_000);
    expect(ms(b.weekEnd) - ms(b.todayStart)).toBe(7 * 86_400_000);
  });
});
