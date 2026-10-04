import { describe, it, expect } from 'vitest';
import { riyadhToday, addDays, monthRange, monthOf, previousMonth, parseMonthLabel, monthLabel } from '@/lib/dates';

describe('dates (Riyadh calendar)', () => {
  it('uses the Riyadh day, not the UTC day', () => {
    // 22:30 UTC on 31 Aug is 01:30 on 1 Sep in Riyadh.
    expect(riyadhToday(new Date('2026-08-31T22:30:00Z'))).toBe('2026-09-01');
    expect(riyadhToday(new Date('2026-08-31T20:00:00Z'))).toBe('2026-08-31');
  });

  it('gives whole months without the one-day shift (audit finding M2)', () => {
    expect(monthRange(2026, 8)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthOf('2026-08-14')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('finds the previous month across a year boundary', () => {
    expect(previousMonth('2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(previousMonth('2026-10-01')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-10-04', -6)).toBe('2026-09-28');
  });

  it('parses and formats month labels', () => {
    expect(parseMonthLabel('August 2026')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(parseMonthLabel('All')).toBeNull();
    expect(monthLabel('2026-08-14')).toBe('August 2026');
  });
});
