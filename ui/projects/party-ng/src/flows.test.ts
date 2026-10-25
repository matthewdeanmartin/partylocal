import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import type { EventView } from 'party-core';
import type { Api } from './api';
import { blankDraft, draftFrom, eventInput, loadOverview, saveEvent, withTimePoll } from './flows';

function richEvent(): EventView {
  return { event: {
    ...blankDraft('poll'), id: 8, rev: 4, status: 'scheduled',
    start: 1_900_000_023, end: 1_900_008_123,
    modules: ['headcount', 'when', 'bring', 'questions', 'shifts', 'rides'],
    home: 17, where_kind: 'home', plus_ones: 'limited', plus_max: 7,
    reminder_secs: 12345, rsvp_by: 1_899_000_000, rides_note: 'Meet at the gate',
    when: [{ id: 31, start: 1_900_000_023, end: 1_900_008_123 }, { id: 32, start: 1_901_000_000, end: 0 }],
    bring: [{ id: 41, name: 'Salt, pepper', count: 2 }],
    shifts: [{ id: 51, name: 'Setup', start: 1_899_900_000, end: 1_899_999_000, count: 3 }],
    questions: [{ id: 61, kind: 'choice', prompt: 'Which meal?', choices: ['Soup', 'Salad'] }, { id: 62, kind: 'text', prompt: 'Other needs?', choices: [] }],
    hosts: [1, 2], visibility: 'invite-only', invitees: [3], map: 'https://example.test/map',
  } } as unknown as EventView;
}

describe('event edit round trips', () => {
  it('adds a time vote without replacing existing modules or guest policy', () => {
    const d = blankDraft('potluck', 1_900_000_000);
    d.plus_max = 7;
    d.bring = [{ id: 9, name: 'Salad', count: 2 }];
    const next = withTimePoll(d, 1_901_000_000);
    expect(next).toMatchObject({ kind: 'potluck', plus_ones: 'limited', plus_max: 7, bring: d.bring });
    expect(next.modules).toEqual([...d.modules, 'when']);
    expect(next.when).toHaveLength(2);
    expect(d.modules).not.toContain('when');
  });
  it('preserves a resolved poll and all richer settings on a title-only edit', async () => {
    const view = richEvent();
    const d = draftFrom(view); d.title = 'New title';
    const send = vi.fn().mockResolvedValue(view);
    await saveEvent({ send } as unknown as Api, d, { id: 8, rev: 4 });
    const body = send.mock.calls[0][2];
    expect(body).toMatchObject({ title: 'New title', rev: 4, start: view.event.start, end: view.event.end,
      home: 17, plus_max: 7, reminder_secs: 12345, rsvp_by: view.event.rsvp_by,
      when: view.event.when, bring: view.event.bring, shifts: view.event.shifts,
      questions: view.event.questions, rides_note: 'Meet at the gate' });
    // Omitted PATCH fields are retained by Rust; don't send empty defaults for them.
    for (const field of ['hosts', 'visibility', 'invitees', 'map']) expect(body).not.toHaveProperty(field);
  });

  it('still creates an unresolved poll even when its draft contains a proposed start', () => {
    const d = blankDraft('poll', 1_900_000_000);
    expect(eventInput(d, true)).toMatchObject({ start: 0, end: 0 });
    const view = richEvent(); view.event.start = 0; view.event.end = 0;
    expect(eventInput(draftFrom(view), false)).toMatchObject({ start: 0, end: 0 });
  });

  it('does not mutate loaded question choices while editing a draft', () => {
    const view = richEvent(); const d = draftFrom(view);
    d.questions[0].choices.push('Stew'); d.shifts[0].count = 9;
    expect(view.event.questions[0].choices).toEqual(['Soup', 'Salad']);
    expect(view.event.shifts[0].count).toBe(3);
  });

  it('refuses to silently delete an existing question with an empty prompt', async () => {
    const d = draftFrom(richEvent()); d.questions[0].prompt = ' ';
    const send = vi.fn();
    await expect(saveEvent({ send } as unknown as Api, d, { id: 8, rev: 4 })).rejects.toThrow('full event editor');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('yearly creation', () => {
  it('sends an annual birthday series rather than a single dated event', async () => {
    const d = { ...blankDraft('generic', 1_900_000_000), title: 'Birthday', repeat: 'yearly' as const, window: 1 };
    const send = vi.fn().mockResolvedValue({ upcoming: [{ id: 9 }] });
    expect(await saveEvent({ send } as unknown as Api, d, { group: 3 })).toBe(9);
    expect(send).toHaveBeenCalledWith('POST', '/api/v1/groups/3/series', expect.objectContaining({ rule: 'yearly', window: 1, event: expect.objectContaining({ title: 'Birthday' }) }), 'SeriesView');
  });
});


describe('overview pagination', () => {
  it('includes later groups and events when calculating waiting and plans', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.startsWith('/api/v1/groups')) return url.includes('after=')
        ? { groups: [{ id: 9, my_status: 'active' }], next: 0 } : { groups: [], next: 8 };
      if (url.includes('after=')) return { events: [{ id: 5, group: 9, status: 'scheduled', my_status: url.includes('mine=1') ? 'going' : null }], next: 0 };
      return { events: [], next: 4 };
    });
    const result = await loadOverview({ get } as unknown as Api);
    expect(result.plans.map(e => e.id)).toEqual([5]);
    expect(result.waiting.map(e => e.id)).toEqual([5]);
    expect(result.mine.map(g => g.id)).toEqual([9]);
    expect(get).toHaveBeenCalledWith('/api/v1/events?mine=1&after=4', 'EventList');
  });
});
