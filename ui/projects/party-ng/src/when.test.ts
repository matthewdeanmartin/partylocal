import { describe, expect, it } from 'vitest';
import { parseWhen } from './when';

// A Saturday morning.
const NOW = new Date(2026, 9, 24, 10, 0);
const at = (y: number, m: number, d: number, h: number, min = 0) => Math.floor(new Date(y, m - 1, d, h, min).getTime() / 1000);

describe('parseWhen', () => {
  it('reads ISO, weekdays, relative days and bare times', () => {
    expect(parseWhen('2026-11-07 19:00', NOW)).toBe(at(2026, 11, 7, 19));
    expect(parseWhen('fri 7pm', NOW)).toBe(at(2026, 10, 30, 19));
    expect(parseWhen('sat 6pm', NOW)).toBe(at(2026, 10, 24, 18));
    expect(parseWhen('sat 9am', NOW)).toBe(at(2026, 10, 31, 9));
    expect(parseWhen('tomorrow 18:30', NOW)).toBe(at(2026, 10, 25, 18, 30));
    expect(parseWhen('nov 7 7:30pm', NOW)).toBe(at(2026, 11, 7, 19, 30));
    expect(parseWhen('9am', NOW)).toBe(at(2026, 10, 25, 9));
    expect(parseWhen('tonight', NOW)).toBe(at(2026, 10, 24, 19));
  });

  it('says 0 for anything else', () => {
    expect(parseWhen('', NOW)).toBe(0);
    expect(parseWhen('someday', NOW)).toBe(0);
  });
});
