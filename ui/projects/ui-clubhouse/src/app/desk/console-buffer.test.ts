import { describe, expect, it } from 'vitest';
import type { EventView } from 'party-core';
import { blankDraft } from 'party-ng';
import { answerBuffer, eventBuffer, parseBuffer, readAnswer, readEvent, stamp } from './console-buffer';

describe('buffers', () => {
  it('reads key: value lines, comments and blocks', () => {
    const p = parseBuffer('# heading\ntitle: Game night   # a comment\nabout: |\n  line one\n  line two\ncapacity: 12');
    expect(p.errors).toEqual([]);
    expect(p.values.get('title')?.value).toBe('Game night');
    expect(p.values.get('about')?.value).toBe('line one\nline two');
    expect(p.values.get('capacity')?.line).toBe(6);
    expect(parseBuffer('q12: yes   # Finished it?').values.get('q12')?.value).toBe('yes');
  });

  it('points at the line that is wrong', () => {
    const base = blankDraft('party', Math.floor(new Date('2026-11-07T19:00').getTime() / 1000));
    const text = eventBuffer(base, 'New', true).replace(/^start: .*$/m, 'start: someday').replace(/^capacity: .*$/m, 'capacity: lots');
    const { errors } = readEvent(text, base);
    expect(errors.map((e) => e.message)).toEqual([expect.stringMatching(/someday/), expect.stringMatching(/capacity/)]);
    expect(errors[0].line).toBe(text.split('\n').findIndex((l) => l.startsWith('start:')) + 1);
  });

  it('round-trips an event draft', () => {
    const start = Math.floor(new Date('2026-11-07T19:00').getTime() / 1000);
    const d = { ...blankDraft('potluck', start), title: 'Street party', capacity: 40, bring: [{ id: 0, name: 'Salad', count: 3 }], about: 'Bring a chair.\nAnd a dish.' };
    const { draft, errors } = readEvent(eventBuffer(d, 'New', true), d);
    expect(errors).toEqual([]);
    expect(draft).toMatchObject({ kind: 'potluck', title: 'Street party', capacity: 40, start, about: 'Bring a chair.\nAnd a dish.' });
    expect(draft.bring).toEqual([{ id: 0, name: 'Salad', count: 3 }]);
    expect(stamp(start)).toBe('2026-11-07 19:00');
  });

  it('reads an answer with bring items by name and poll times by number', () => {
    const v = {
      event: {
        id: 7, title: 'Poll', kind: 'poll', modules: ['headcount', 'when', 'bring'], plus_ones: 'limited', plus_max: 2, rev: 3,
        when: [{ id: 1, start: 1_800_000_000, end: 0 }, { id: 2, start: 1_800_090_000, end: 0 }], bring: [{ id: 5, name: 'Dessert', count: 2 }],
        shifts: [], questions: [], diet_prompt: '',
      },
      claimed: [], mine: null,
    } as unknown as EventView;
    const text = answerBuffer(v).replace(/^times: .*$/m, 'times: 2').replace(/^bring: .*$/m, 'bring: dess').replace(/^guests: .*$/m, 'guests: 1');
    const { answer, errors } = readAnswer(text, v);
    expect(errors).toEqual([]);
    expect(answer).toMatchObject({ status: 'going', plus: 1, when: [2], bring: [5], rev_seen: 3 });
  });
});
