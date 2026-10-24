// What the UIs do with the board, without how they look: loading the
// overview, an event's whole page, and turning a filled-in event draft into
// the board's EventInput. Each UI brings its own menus, pages and forms.
import {
  EventKind, EventList, EventSummary, EventView, GroupList, GroupView, KIND_INFO, MemberView, Module, NoticeView,
  PersonList, PersonView, Question, RsvpInput, RsvpView, SeriesView, Shift, Slot, TimeOption,
} from 'party-core';
import { Api } from './api';

export interface Overview {
  /** Events I'm going to, maybe, or waiting for. */
  plans: EventSummary[];
  /** Events in my groups I haven't answered. */
  waiting: EventSummary[];
  /** Everything upcoming I can see. */
  upcoming: EventSummary[];
  /** Groups I'm in (or asked to join). */
  mine: GroupView[];
  /** Active groups I could join. */
  others: GroupView[];
}

export async function loadOverview(api: Api): Promise<Overview> {
  const [mine, upcoming, groups] = await Promise.all([
    api.get<EventList>('/api/v1/events?mine=1', 'EventList'),
    api.get<EventList>('/api/v1/events', 'EventList'),
    api.get<GroupList>('/api/v1/groups', 'GroupList'),
  ]);
  const member = new Set(groups.groups.filter((g) => g.my_status === 'active').map((g) => g.id));
  return {
    plans: mine.events.filter((e) => e.my_status === 'going' || e.my_status === 'maybe' || e.my_status === 'waitlist'),
    waiting: upcoming.events.filter((e) => !e.my_status && e.status === 'scheduled' && (member.has(e.group) || mine.events.some((m) => m.id === e.id))),
    upcoming: upcoming.events,
    mine: groups.groups.filter((g) => g.my_status),
    others: groups.groups.filter((g) => !g.my_status && g.status === 'active'),
  };
}

export interface GroupPage {
  group: GroupView;
  events: EventSummary[];
  past: EventSummary[];
  /** Empty when the viewer may not see who's in it. */
  members: MemberView[];
}

export async function loadGroup(api: Api, ref: string): Promise<GroupPage> {
  const group = await api.get<GroupView>(`/api/v1/groups/${encodeURIComponent(ref)}`, 'GroupView');
  const [events, past, members] = await Promise.all([
    api.get<EventList>(`/api/v1/events?group=${group.id}`, 'EventList'),
    api.get<EventList>(`/api/v1/events?group=${group.id}&past=1`, 'EventList'),
    api.get<{ members: MemberView[] }>(`/api/v1/groups/${group.id}/members`, 'MemberList').catch(() => ({ members: [] })),
  ]);
  return { group, events: events.events, past: past.events, members: members.members };
}

export interface EventPage {
  view: EventView;
  /** Everyone's answers (as the viewer may see them). */
  rsvps: RsvpView[];
  series: SeriesView | null;
}

export async function loadEvent(api: Api, id: number): Promise<EventPage> {
  const view = await api.get<EventView>(`/api/v1/events/${id}`, 'EventView');
  const [rsvps, series] = await Promise.all([
    api.get<{ rsvps: RsvpView[] }>(`/api/v1/events/${id}/rsvps`, 'RsvpList').then((r) => r.rsvps).catch(() => []),
    view.event.series
      ? api.get<SeriesView>(`/api/v1/series/${view.event.series}`, 'SeriesView').catch(() => null)
      : Promise.resolve(null),
  ]);
  return { view, rsvps, series };
}

export function answerEvent(api: Api, id: number, input: RsvpInput, who: number | 'me' = 'me'): Promise<EventView> {
  return api.send<EventView>('PUT', `/api/v1/events/${id}/rsvps/${who}`, input, 'EventView');
}

export function joinGroup(api: Api, id: number): Promise<GroupView> {
  return api.send<GroupView>('POST', `/api/v1/groups/${id}/join`, undefined, 'GroupView');
}

export function leaveGroup(api: Api, id: number): Promise<GroupView> {
  return api.send<GroupView>('POST', `/api/v1/groups/${id}/leave`, undefined, 'GroupView');
}

export function loadPeople(api: Api, q = ''): Promise<PersonView[]> {
  return api.get<PersonList>(`/api/v1/people?q=${encodeURIComponent(q)}`, 'PersonList').then((p) => p.people);
}

export function loadNotices(api: Api): Promise<NoticeView[]> {
  return api.get<{ notices: NoticeView[] }>('/api/v1/notifications', 'NoticeList').then((n) => n.notices);
}

export async function markRead(api: Api, upTo = 0): Promise<void> {
  await api.send('POST', '/api/v1/notifications/read', { up_to: upTo }, 'Done');
  await api.refreshSummary();
}

export function loadHouseholds(api: Api): Promise<{ id: number; name: string }[]> {
  return api
    .get<{ households: { id: number; name: string }[] }>('/api/v1/households', 'HouseholdList')
    .then((h) => h.households)
    .catch(() => []);
}

export type Repeat = '' | 'weekly' | 'monthly-nth' | 'monthly-date';

/** Everything an event form fills in, as plain data any UI can bind to. */
export interface EventDraft {
  kind: EventKind;
  title: string;
  about: string;
  start: number;
  end: number;
  where_kind: 'place' | 'home' | 'tbd';
  place: string;
  address: string;
  home: number;
  capacity: number;
  plus_ones: 'none' | 'limited' | 'unlimited';
  plus_max: number;
  rsvp_by: number;
  reminder_secs: number;
  draft: boolean;
  modules: Module[];
  bring: Slot[];
  diet_prompt: string;
  when: TimeOption[];
  shifts: Shift[];
  questions: Question[];
  rides_note: string;
  cost: string;
  link: string;
  repeat: Repeat;
  every: number;
  window: number;
}

const PLUS: Record<EventKind, EventDraft['plus_ones']> = {
  generic: 'unlimited', party: 'limited', dinner: 'none', potluck: 'limited', outing: 'limited', meeting: 'unlimited',
  workday: 'unlimited', poll: 'unlimited',
};

/** A fresh draft of `kind`, starting at `start` (Unix seconds, 0 = unset). */
export function blankDraft(kind: EventKind = 'generic', start = 0): EventDraft {
  return {
    kind, title: '', about: '', start, end: start ? start + 3 * 3600 : 0, where_kind: kind === 'outing' ? 'place' : 'tbd', place: '',
    address: '', home: 0, capacity: 0, plus_ones: PLUS[kind], plus_max: 2, rsvp_by: 0, reminder_secs: 86_400, draft: false,
    modules: [...KIND_INFO[kind].modules], bring: [], diet_prompt: '', when: [], shifts: [], questions: [], rides_note: '', cost: '',
    link: '', repeat: '', every: 1, window: 3,
  };
}

/** Switches a draft's kind, keeping what was typed. */
export function withKind(d: EventDraft, kind: EventKind): EventDraft {
  return { ...d, kind, modules: [...KIND_INFO[kind].modules], plus_ones: PLUS[kind], where_kind: kind === 'outing' ? 'place' : d.where_kind };
}

export function draftFrom(v: EventView): EventDraft {
  const e = v.event;
  return {
    kind: e.kind, title: e.title, about: e.about, start: e.start, end: e.end, where_kind: e.where_kind, place: e.place, address: e.address,
    home: e.home, capacity: e.capacity, plus_ones: e.plus_ones, plus_max: e.plus_max || 2, rsvp_by: e.rsvp_by, reminder_secs: e.reminder_secs,
    draft: e.status === 'draft', modules: [...e.modules], bring: e.bring.map((s) => ({ ...s })), diet_prompt: e.diet_prompt,
    when: e.when.map((o) => ({ ...o })), shifts: e.shifts.map((s) => ({ ...s })),
    questions: e.questions.map((q) => ({ ...q, choices: [...q.choices] })), rides_note: e.rides_note, cost: e.cost, link: e.link,
    repeat: '', every: 1, window: 3,
  };
}

/** The board's EventInput for a draft. `creating` sends the kind. */
export function eventInput(d: EventDraft, creating: boolean): Record<string, unknown> {
  const has = (m: Module) => d.modules.includes(m);
  const polling = has('when');
  return {
    kind: creating ? d.kind : undefined,
    title: d.title,
    about: d.about,
    start: polling ? 0 : d.start,
    end: polling ? 0 : d.end,
    where_kind: d.where_kind,
    place: d.place,
    address: d.address,
    home: d.home,
    capacity: d.capacity,
    plus_ones: d.plus_ones,
    plus_max: d.plus_ones === 'limited' ? d.plus_max : 0,
    rsvp_by: d.rsvp_by,
    reminder_secs: d.reminder_secs,
    status: d.draft ? 'draft' : 'scheduled',
    modules: d.modules,
    bring: has('bring') ? d.bring.filter((s) => s.name.trim()) : undefined,
    diet_prompt: d.diet_prompt,
    when: polling ? d.when.filter((o) => o.start) : undefined,
    shifts: has('shifts') ? d.shifts.filter((s) => s.name.trim()) : undefined,
    questions: has('questions') ? d.questions.filter((q) => q.prompt.trim()) : undefined,
    rides_note: d.rides_note,
    cost: d.cost,
    link: d.link,
  };
}

/**
 * Creates (in group `group`) or updates (event `id`, at `rev`) the event,
 * or starts a series when the draft repeats. Returns the event to show.
 */
export async function saveEvent(api: Api, d: EventDraft, target: { group: number } | { id: number; rev: number }): Promise<number> {
  if ('id' in target) {
    const v = await api.send<EventView>('PATCH', `/api/v1/events/${target.id}`, { ...eventInput(d, false), rev: target.rev }, 'EventView');
    return v.event.id;
  }
  if (d.repeat && !d.modules.includes('when')) {
    const s = await api.send<SeriesView>(
      'POST',
      `/api/v1/groups/${target.group}/series`,
      { event: eventInput(d, true), rule: d.repeat, every: d.every, window: d.window },
      'SeriesView',
    );
    return s.upcoming[0]?.id ?? 0;
  }
  const v = await api.send<EventView>('POST', `/api/v1/groups/${target.group}/events`, eventInput(d, true), 'EventView');
  return v.event.id;
}

/** Groups the viewer may create events in. */
export function hostable(groups: GroupView[]): GroupView[] {
  return groups.filter((g) => g.can_create_events && g.status === 'active');
}

/** "in 3 days", "tomorrow", "2 hours ago" — a relative time for a timestamp. */
export function relative(secs: number, now = Date.now() / 1000): string {
  if (!secs) return '';
  const d = secs - now;
  const abs = Math.abs(d);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 3600) return fmt.format(Math.round(d / 60), 'minute');
  if (abs < 86_400) return fmt.format(Math.round(d / 3600), 'hour');
  if (abs < 14 * 86_400) return fmt.format(Math.round(d / 86_400), 'day');
  return fmt.format(Math.round(d / (7 * 86_400)), 'week');
}
