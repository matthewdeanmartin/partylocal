import { beforeAll, describe, expect, it } from 'vitest';
import { Board, emptyState } from './board';
import { route } from './routes';
import { DEMO_PIN, PERSONAS, seed } from './seed';
import { freshen } from './install';

// routes.ts builds invitation links from the page's location.
beforeAll(() => {
  Object.assign(globalThis, {
    location: { origin: 'http://demo', protocol: 'http:', href: 'http://demo/chat/' },
    document: { baseURI: 'http://demo/chat/' },
  });
});

const NOW = Math.floor(new Date('2026-10-24T10:00:00').getTime() / 1000);

function call(b: Board, method: string, path: string, body: Record<string, unknown> = {}) {
  return route(b, method, new URL(path, 'http://demo'), body);
}

describe('demo seed', () => {
  it('builds through the board rules, signed in as Sam', () => {
    const s = seed(NOW);
    expect(s.people.map((p) => p.display_name)).toEqual(expect.arrayContaining(PERSONAS.map((p) => p.name)));
    expect(s.people.find((p) => p.id === s.session)?.display_name).toBe('Sam Rivera');
    expect(s.groups.length).toBe(5);
    expect(s.events.length).toBeGreaterThan(8);
  });

  it('gives Sam something to answer, plans and unread notices', () => {
    const b = new Board(seed(NOW), () => NOW);
    const summary = call(b, 'GET', '/api/v1/me/summary').body as { unread: number; awaiting: number };
    expect(summary.unread).toBeGreaterThan(0);
    expect(summary.awaiting).toBeGreaterThan(0);
    const mine = call(b, 'GET', '/api/v1/events?mine=1').body as { events: { my_status: string }[] };
    expect(mine.events.some((e) => e.my_status === 'going')).toBe(true);
    const past = call(b, 'GET', '/api/v1/events?past=1').body as { events: unknown[] };
    expect(past.events.length).toBe(1);
  });

  it('every persona signs in with the demo PIN', () => {
    const b = new Board(seed(NOW), () => NOW);
    for (const p of PERSONAS) {
      expect(call(b, 'POST', '/api/v1/auth/pin', { login: p.name, pin: DEMO_PIN }).status).toBe(200);
    }
    expect(call(b, 'POST', '/api/v1/auth/pin', { login: 'Sam Rivera', pin: '0000' }).status).toBe(401);
  });
});

describe('demo board rules', () => {
  it('starts empty: setup makes the first admin', () => {
    const b = new Board(emptyState(NOW), () => NOW);
    expect((call(b, 'GET', '/api/v1/status').body as { setup_needed: boolean }).setup_needed).toBe(true);
    expect(call(b, 'GET', '/api/v1/auth/me').status).toBe(401);
    const me = call(b, 'POST', '/api/v1/setup', { display_name: 'Ana', email: '', pin: '4321', setup_code: '' });
    expect(me.status).toBe(201);
    expect((me.body as { role: string }).role).toBe('admin');
    expect(call(b, 'POST', '/api/v1/setup', { display_name: 'Bo', email: '', pin: '4321' }).status).toBe(409);
  });

  it('hides private groups from outsiders and asks to join by approval', () => {
    const s = seed(NOW);
    const b = new Board(s, () => NOW);
    s.session = s.people.find((p) => p.display_name === 'Grace Liu')!.id;
    const groups = (call(b, 'GET', '/api/v1/groups').body as { groups: { slug: string }[] }).groups.map((g) => g.slug);
    expect(groups).not.toContain('rivera-okafor-family');
    expect(call(b, 'GET', '/api/v1/groups/rivera-okafor-family').status).toBe(404);
    const joined = call(b, 'POST', '/api/v1/groups/maple-street-neighbours/join').body as { my_status: string };
    expect(joined.my_status).toBe('requested');
  });

  it('puts answers past capacity on the waitlist and lets them in when room frees up', () => {
    const s = seed(NOW);
    const b = new Board(s, () => NOW);
    const sam = s.session;
    const g = s.groups.find((x) => x.slug === 'maple-street-neighbours')!;
    const e = b.createEvent(sam, g, { kind: 'dinner', title: 'Tiny dinner', start: NOW + 5 * 86_400, capacity: 1 });
    const dana = s.people.find((p) => p.display_name === 'Dana Whitfield')!.id;
    b.answer(sam, e.id, sam, { status: 'going', rev_seen: e.rev });
    b.answer(dana, e.id, dana, { status: 'going', rev_seen: e.rev });
    expect(b.rsvp(e.id, dana)?.status).toBe('waitlist');
    b.answer(sam, e.id, sam, { status: 'no', rev_seen: e.rev });
    expect(b.rsvp(e.id, dana)?.status).toBe('going');
    expect(s.notices.some((n) => n.to === dana && n.kind === 'promoted')).toBe(true);
  });

  it('refuses a bring-list item that is covered already', () => {
    const s = seed(NOW);
    const b = new Board(s, () => NOW);
    const party = s.events.find((e) => e.title === 'Maple Street party')!;
    const bbq = party.bring.find((x) => x.name === 'Barbecue')!.id;
    const r = call(b, 'PUT', `/api/v1/events/${party.id}/rsvps/me`, { status: 'going', bring: [bbq], rev_seen: party.rev });
    expect(r.status).toBe(200);
    s.session = s.people.find((p) => p.display_name === 'Dana Whitfield')!.id;
    const again = call(b, 'PUT', `/api/v1/events/${party.id}/rsvps/me`, { status: 'going', bring: [bbq], rev_seen: party.rev });
    expect(again.status).toBe(409);
    expect((again.body as { message: string }).message).toMatch(/covered/);
  });

  it('locks in a time poll and makes its voters going', () => {
    const s = seed(NOW);
    const b = new Board(s, () => NOW);
    const poll = s.events.find((e) => e.kind === 'poll')!;
    const option = poll.when[1].id;
    const r = call(b, 'POST', `/api/v1/events/${poll.id}/lock`, { option });
    expect(r.status).toBe(200);
    const e = b.event(poll.id)!;
    expect(e.start).toBe(poll.when.find((o) => o.id === option)?.start ?? e.start);
    expect(e.modules).not.toContain('when');
    expect(b.rsvps(poll.id).filter((x) => x.status === 'going').length).toBeGreaterThanOrEqual(3);
  });

  it('answers unknown routes with a readable 404', () => {
    const b = new Board(seed(NOW), () => NOW);
    const r = call(b, 'GET', '/api/v1/nope');
    expect(r.status).toBe(404);
    expect((r.body as { error: string }).error).toBe('not_found');
  });
});

describe('freshen', () => {
  it('keeps birthday dates fixed as the demo ages', () => {
    const s = seed(NOW);
    s.series[0].rule = 'yearly';
    const event = s.events.find(e => e.series === s.series[0].id)!;
    const start = event.start;
    freshen(s, NOW + 15 * 86_400);
    expect(event.start).toBe(start);
  });
  it('moves dates forward by whole weeks only', () => {
    const s = seed(NOW);
    const start = s.events[0].start;
    expect(freshen(s, NOW + 3 * 86_400).events[0].start).toBe(start);
    expect(freshen(s, NOW + 15 * 86_400).events[0].start).toBe(start + 14 * 86_400);
  });
});

describe('creator RSVPs and unset event times', () => {
  it('keeps an undated event upcoming and counts its creator', () => {
    const state = seed(NOW); const board = new Board(state, () => NOW);
    const group = state.groups.find(g => g.slug === 'maple-street-neighbours')!;
    const event = board.createEvent(state.session, group, { title: 'Date later', start: 0, end: 0 });
    expect(board.rsvp(event.id, state.session)?.status).toBe('going');
    const upcoming = call(board, 'GET', `/api/v1/events?group=${group.id}`).body as { events: { id: number }[] };
    expect(upcoming.events.some(e => e.id === event.id)).toBe(true);
  });
});

describe('series management parity', () => {
  it('saves generation limits, keeps already-created events, and denies non-host edits', () => {
    const b = new Board(seed(NOW), () => NOW); const actor = b.state.session;
    const g = b.state.groups.find(g => b.access(actor, g).manage)!;
    const s = b.createSeries(actor, g, { event: { title: 'Weekly test', start: NOW + 86400 }, rule: 'weekly', window: 2 });
    const first = b.state.events.filter(e => e.series === s.id);
    b.updateSeries(actor, s.id, { count: 1, window: 1 });
    expect(s.count).toBe(1); expect(s.window).toBe(1);
    expect(b.state.events.filter(e => e.series === s.id)).toHaveLength(2);
    b.updateSeries(actor, s.id, { count: 5, window: 4, until: 0 });
    expect(b.state.events.filter(e => e.series === s.id)).toHaveLength(4);
    expect(first.every(e => b.state.events.includes(e))).toBe(true);
    const outsider = b.state.people.find(p => !b.access(p.id, g).manage && !first[0].hosts.includes(p.id))!;
    expect(outsider).toBeDefined();
    expect(() => b.updateSeries(outsider.id, s.id, { window: 8 })).toThrow();
  });
});

describe('series actions', () => {
  it('preserves an existing RSVP when regular attendance is enabled', () => {
    const b = new Board(seed(NOW), () => NOW); const actor = b.state.session;
    const g = b.state.groups.find(g => b.access(actor, g).manage)!;
    const s = b.createSeries(actor, g, { event: { title: 'Regular test', start: NOW + 86400 }, window: 2 });
    const e = b.state.events.find(e => e.series === s.id)!;
    b.rsvp(e.id, actor)!.status = 'no';
    call(b, 'PUT', `/api/v1/series/${s.id}/regular`, { on: true });
    expect(b.rsvp(e.id, actor)!.status).toBe('no');
    expect(s.regulars).toContain(actor);
    call(b, 'PUT', `/api/v1/series/${s.id}/regular`, { on: false });
    expect(b.rsvp(e.id, actor)!.status).toBe('no');
  });
  it.each([false, true])('stops generation with optional cancellation: %s', (cancel) => {
    const b = new Board(seed(NOW), () => NOW); const actor = b.state.session;
    const g = b.state.groups.find(g => b.access(actor, g).manage)!;
    const s = b.createSeries(actor, g, { event: { title: 'Stop test', start: NOW + 86400 }, window: 2 });
    call(b, 'DELETE', `/api/v1/series/${s.id}${cancel ? '?cancel=1' : ''}`);
    expect(s.status).toBe('ended');
    expect(b.state.events.filter(e => e.series === s.id).every(e => e.status === (cancel ? 'cancelled' : 'scheduled'))).toBe(true);
  });
});

describe('yearly birthdays', () => {
  it('uses February 28 in non-leap years and returns to February 29', () => {
    const b = new Board(seed(NOW), () => NOW); const actor = b.state.session;
    const g = b.state.groups.find(g => b.access(actor, g).manage)!;
    const start = new Date(2028, 1, 29, 12).getTime() / 1000;
    const s = b.createSeries(actor, g, { rule: 'yearly', window: 5, event: { title: 'Birthday', start } });
    const dates = b.state.events.filter(e => e.series === s.id).map(e => new Date(e.start * 1000));
    expect(dates.map(d => [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()])).toEqual([[2028, 2, 29, 12], [2029, 2, 28, 12], [2030, 2, 28, 12], [2031, 2, 28, 12], [2032, 2, 29, 12]]);
  });
});
