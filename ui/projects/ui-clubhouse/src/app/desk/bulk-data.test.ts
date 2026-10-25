import { describe, expect, it } from 'vitest';
import { parseBulk, usHolidays } from './bulk-data';
describe('bulk event input', () => {
  it('rejects rolled-over dates, past dates, duplicates and oversized batches', () => {
    expect(() => parseBulk('2027-02-30 12:00 | Birthday', 0)).toThrow();
    expect(() => parseBulk('2027-01-01 12:00 | Old', 9999999999)).toThrow();
    expect(() => parseBulk('2027-01-01 12:00 | Party\n2027-01-01 12:00 | Party', 0)).toThrow();
    expect(() => parseBulk(Array(61).fill('2027-01-01 12:00 | Party').join('\n'), 0)).toThrow();
  });
  it('accepts leap day and preserves names', () => {
    expect(parseBulk('2028-02-29 18:30 | Alex birthday', 0)[0].title).toBe('Alex birthday');
  });
  it('generates eleven actual holidays including movable dates', () => {
    const rows = usHolidays(2027);
    expect(parseBulk(rows, 0)).toHaveLength(11);
    expect(rows).toContain('2027-05-31 12:00 | Memorial Day');
    expect(rows).toContain('2027-11-25 12:00 | Thanksgiving Day');
    expect(rows).toContain('2027-07-04 12:00 | Independence Day');
  });
});
