// The board in a browser: the /api/v1 routes the UIs use, answered from a
// plain state object instead of the ESP32. A port of the Rust rules
// (api/src/{groups,events,rsvps,notify,state}.rs) close enough to try the
// app out; the board stays the reference. No crypto: PINs are kept as
// typed, which is fine for made-up people in one browser.
import type {
  Answer, EventKind, EventSummary, EventView, GroupView, Me, MemberView, Module, NoticeView, PersonView,
  Question, RsvpView, Shift, Slot, StoredEvent, TimeOption,
} from 'party-core';

export interface DemoPerson {
  id: number;
  display_name: string;
  email: string;
  pin: string;
  admin: boolean;
  status: 'active' | 'disabled' | 'invited';
  household: number;
  discoverable: 'nobody' | 'members' | 'public';
  bio: string;
  created: number;
  last_seen: number;
  email_off: boolean;
  dm_off: boolean;
  identities: string[];
}

export interface DemoMember { person: number; role: 'organizer' | 'co-organizer' | 'member'; status: 'active' | 'requested' | 'removed'; joined: number }

export interface DemoGroup {
  id: number;
  slug: string;
  name: string;
  about: string;
  kind: 'club' | 'circle' | 'one-off';
  visibility: 'public' | 'unlisted' | 'private';
  join: 'open' | 'approval' | 'invite';
  status: 'active' | 'archived';
  members: DemoMember[];
  created: number;
  rev: number;
  members_create_events: boolean;
}

export interface DemoEvent extends StoredEvent {
  created: number;
  updated: number;
  created_by: number;
  next_item: number;
  reminded: boolean;
  edits: number;
}

export interface DemoRsvp {
  event: number;
  person: number;
  status: 'going' | 'maybe' | 'no' | 'waitlist';
  plus: number;
  kids: number;
  names: string;
  bring: number[];
  bring_other: string;
  diet: string;
  answers: Answer[];
  ride: '' | 'need' | 'offer' | 'own';
  seats: number;
  when: number[];
  shifts: number[];
  note: string;
  by: number;
  via: string;
  updated: number;
  queued: number;
  rev_seen: number;
}

export interface DemoSeries {
  id: number;
  group: number;
  rule: string;
  every: number;
  nth: number;
  until: number;
  count: number;
  window: number;
  status: 'active' | 'ended';
  regulars: number[];
}

export interface DemoNotice { id: number; to: number; kind: string; event: number; group: number; actor: number; created: number; read: boolean; count: number }

export interface DemoInvite {
  id: number;
  target_kind: 'group' | 'event';
  target: number;
  issuer: number;
  email: string;
  handle: string;
  person: number;
  expires: number;
  uses_left: number;
  status: 'open' | 'used' | 'revoked' | 'expired';
  token: string;
}

export interface DemoState {
  v: 1;
  /** When the dates were last moved forward (see `freshen`). */
  anchored: number;
  people: DemoPerson[];
  households: { id: number; name: string }[];
  groups: DemoGroup[];
  events: DemoEvent[];
  rsvps: DemoRsvp[];
  series: DemoSeries[];
  notices: DemoNotice[];
  invites: DemoInvite[];
  audit: { seq: number; at: number; actor: number; action: string; detail: string }[];
  signup_closed: boolean;
  groups_admin_only: boolean;
  zone: string;
  /** Who this browser is signed in as (the session cookie), 0 = nobody. */
  session: number;
  next: Record<'person' | 'household' | 'group' | 'event' | 'series' | 'notice' | 'invite' | 'queue' | 'audit', number>;
}

export function emptyState(now: number): DemoState {
  return {
    v: 1, anchored: now, people: [], households: [], groups: [], events: [], rsvps: [], series: [], notices: [],
    invites: [], audit: [], signup_closed: false, groups_admin_only: false, zone: 'UTC', session: 0,
    next: { person: 1, household: 1, group: 1, event: 1, series: 1, notice: 1, invite: 1, queue: 1, audit: 1 },
  };
}

export class Fail extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const bad = (message: string) => new Fail(400, 'bad_request', message);
const notFound = (message: string) => new Fail(404, 'not_found', message);
const forbid = (message: string) => new Fail(403, 'not_allowed', message);
const fold = (s: string) => s.trim().toLowerCase();
const DEFAULT_LENGTH = 3 * 3600;
const MAX_GUESTS = 20;
const DAY = 86_400;

export const PRESETS: Record<EventKind, { modules: Module[]; plus_ones: StoredEvent['plus_ones']; plus_max: number; reminder: number; rsvp_before: number }> = {
  generic: { modules: ['headcount'], plus_ones: 'unlimited', plus_max: 0, reminder: 0, rsvp_before: 0 },
  party: { modules: ['headcount', 'bring', 'diet'], plus_ones: 'limited', plus_max: 2, reminder: DAY, rsvp_before: 0 },
  dinner: { modules: ['headcount', 'diet'], plus_ones: 'none', plus_max: 0, reminder: DAY, rsvp_before: 2 * DAY },
  potluck: { modules: ['headcount', 'bring', 'diet'], plus_ones: 'limited', plus_max: 2, reminder: DAY, rsvp_before: 0 },
  outing: { modules: ['headcount', 'rides', 'cost'], plus_ones: 'limited', plus_max: 2, reminder: DAY, rsvp_before: 0 },
  meeting: { modules: ['headcount', 'questions'], plus_ones: 'unlimited', plus_max: 0, reminder: 3600, rsvp_before: 0 },
  workday: { modules: ['headcount', 'shifts', 'bring'], plus_ones: 'unlimited', plus_max: 0, reminder: DAY, rsvp_before: 0 },
  poll: { modules: ['headcount', 'when'], plus_ones: 'unlimited', plus_max: 0, reminder: 0, rsvp_before: 0 },
};
const MODULES: Module[] = ['headcount', 'bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];

function text(raw: unknown, max: number, what: string): string {
  const t = String(raw ?? '').trim();
  if ([...t].length > max) throw bad(`${what}: at most ${max} characters`);
  return t;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], what: string): T {
  if (allowed.includes(raw as T)) return raw as T;
  throw bad(`${what} must be one of: ${allowed.join(', ')}`);
}

function slugify(name: string): string {
  const s = fold(name).normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'group';
}

function normalizeName(raw: unknown): string {
  const n = String(raw ?? '').trim();
  if ([...n].length < 1 || [...n].length > 40) throw bad('Display name: 1 to 40 characters');
  if (n.includes('@')) throw bad("Display names can't contain @");
  return n;
}

function normalizeEmail(raw: unknown): string {
  const e = fold(String(raw ?? ''));
  if (!e) return e;
  const [user, host, extra] = e.split('@');
  if (e.length > 64 || /\s/.test(e) || !user || !host || extra !== undefined) throw bad("That doesn't look like an email address");
  return e;
}

function checkPin(pin: unknown): string {
  const p = String(pin ?? '');
  if (!/^\d{4,8}$/.test(p)) throw bad('PIN: 4 to 8 digits');
  return p;
}

type Body = Record<string, unknown>;
type Reply = { status: number; body: unknown };

/** The fake board. `state` is mutated in place; the caller persists it. */
export class Board {
  constructor(public state: DemoState, private readonly clock: () => number = () => Math.floor(Date.now() / 1000)) {}

  get now(): number {
    return this.clock();
  }

  // ---- lookups ------------------------------------------------------------

  person(id: number): DemoPerson | undefined {
    return this.state.people.find((p) => p.id === id);
  }

  name(id: number): string {
    return this.person(id)?.display_name ?? 'someone';
  }

  group(id: number): DemoGroup | undefined {
    return this.state.groups.find((g) => g.id === id);
  }

  groupRef(raw: string): DemoGroup {
    const g = /^\d+$/.test(raw) ? this.group(Number(raw)) : this.state.groups.find((x) => x.slug === raw);
    if (!g) throw notFound('No such group');
    return g;
  }

  event(id: number): DemoEvent | undefined {
    return this.state.events.find((e) => e.id === id);
  }

  householdName(id: number): string {
    return this.state.households.find((h) => h.id === id)?.name ?? '';
  }

  rsvps(event: number): DemoRsvp[] {
    return this.state.rsvps.filter((r) => r.event === event);
  }

  rsvp(event: number, person: number): DemoRsvp | undefined {
    return this.state.rsvps.find((r) => r.event === event && r.person === person);
  }

  log(actor: number, action: string, detail: string): void {
    this.state.audit.unshift({ seq: this.state.next.audit++, at: this.now, actor, action, detail });
    this.state.audit.length = Math.min(this.state.audit.length, 200);
  }

  // ---- people ---------------------------------------------------------------

  private isAdmin(viewer: number): boolean {
    const p = this.person(viewer);
    return !!p && p.admin && p.status === 'active';
  }

  private shareGroup(a: number, b: number): boolean {
    return this.state.groups.some((g) => {
      const on = (p: number) => g.members.some((m) => m.person === p && m.status === 'active');
      return on(a) && on(b);
    });
  }

  canSeePerson(viewer: number, p: DemoPerson): boolean {
    if (!viewer) return false;
    if (viewer === p.id || this.isAdmin(viewer)) return true;
    if (p.status !== 'active') return false;
    if (p.discoverable === 'public') return true;
    if (p.discoverable === 'members') {
      const h = this.person(viewer)?.household ?? 0;
      return this.shareGroup(viewer, p.id) || (h !== 0 && h === p.household);
    }
    return false;
  }

  personView(p: DemoPerson): PersonView {
    return { id: p.id, display_name: p.display_name, bio: p.bio, household: p.household, household_name: this.householdName(p.household) };
  }

  me(id: number): Me {
    const p = this.person(id);
    if (!p) throw new Fail(401, 'unauthorized', 'Sign in first');
    return {
      id: p.id, display_name: p.display_name, email: p.email, role: p.admin ? 'admin' : 'member', bio: p.bio,
      household: p.household, household_name: this.householdName(p.household), discoverable: p.discoverable,
      sessions: this.state.session === id ? 1 : 0, created: p.created, has_pin: !!p.pin, identities: [...p.identities],
      email_notify: !!p.email && !p.email_off, dm_notify: p.identities.length > 0 && !p.dm_off, personal_link: '',
    };
  }

  private unique(except: number, name: string, email: string): void {
    if (this.state.people.some((p) => p.id !== except && fold(p.display_name) === fold(name))) {
      throw new Fail(409, 'name_taken', "Someone already uses that display name (it's also a sign-in name)");
    }
    if (email && this.state.people.some((p) => p.id !== except && p.email === email)) {
      throw new Fail(409, 'email_taken', 'There is already an account with that email');
    }
  }

  createPerson(nameRaw: unknown, emailRaw: unknown, pinRaw: unknown, admin: boolean): number {
    const name = normalizeName(nameRaw);
    const email = normalizeEmail(emailRaw);
    const pin = checkPin(pinRaw);
    this.unique(0, name, email);
    const id = this.state.next.person++;
    this.state.people.push({
      id, display_name: name, email, pin, admin, status: 'active', household: 0, discoverable: 'public', bio: '',
      created: this.now, last_seen: this.now, email_off: false, dm_off: false, identities: [],
    });
    return id;
  }

  // ---- groups ---------------------------------------------------------------

  access(viewer: number, g: DemoGroup): { see: boolean; list: boolean; manage: boolean; own: boolean } {
    if (this.isAdmin(viewer)) return { see: true, list: true, manage: true, own: true };
    const m = g.members.find((x) => x.person === viewer);
    if (m?.status === 'active') {
      const own = m.role === 'organizer';
      return { see: true, list: true, manage: own || m.role === 'co-organizer', own };
    }
    const none = { see: false, list: false, manage: false, own: false };
    if (g.status === 'archived') return none;
    if (g.visibility === 'public') return { ...none, see: true, list: true };
    if (g.visibility === 'unlisted') return { ...none, see: viewer !== 0, list: m?.status === 'requested' };
    return none;
  }

  visibleGroup(viewer: number, raw: string): { g: DemoGroup; a: ReturnType<Board['access']> } {
    const g = this.groupRef(raw);
    const a = this.access(viewer, g);
    if (!a.see) throw notFound('No such group');
    return { g, a };
  }

  canCreateEvent(actor: number, g: DemoGroup): Fail | null {
    const a = this.access(actor, g);
    if (!a.see) return notFound('No such group');
    if (g.status === 'archived') return new Fail(409, 'archived', 'This group is archived');
    const member = g.members.some((m) => m.person === actor && m.status === 'active');
    return a.manage || (g.members_create_events && member) ? null : forbid("Only the group's organizers can create events here");
  }

  groupView(viewer: number, g: DemoGroup): GroupView {
    const a = this.access(viewer, g);
    const mine = g.members.find((m) => m.person === viewer);
    const count = (s: string) => g.members.filter((m) => m.status === s).length;
    return {
      id: g.id, slug: g.slug, name: g.name, about: g.about, kind: g.kind, visibility: g.visibility, join: g.join,
      status: g.status, members: count('active'), my_role: mine?.status === 'active' ? mine.role : '',
      my_status: mine?.status ?? '', can_manage: a.manage, can_own: a.own, created: g.created, rev: g.rev,
      requests: a.manage ? count('requested') : 0, members_create_events: g.members_create_events,
      can_create_events: viewer !== 0 && this.canCreateEvent(viewer, g) === null,
    };
  }

  groupFields(g: DemoGroup, input: Body): void {
    if (input['name'] !== undefined) {
      const n = text(input['name'], 60, 'Group name');
      if (!n) throw bad('A group needs a name');
      g.name = n;
    }
    if (input['about'] !== undefined) g.about = text(input['about'], 1000, 'About');
    if (input['kind'] !== undefined) g.kind = pick(input['kind'], ['club', 'circle', 'one-off'] as const, 'kind');
    if (input['visibility'] !== undefined) g.visibility = pick(input['visibility'], ['public', 'unlisted', 'private'] as const, 'visibility');
    if (input['join'] !== undefined) g.join = pick(input['join'], ['open', 'approval', 'invite'] as const, 'join');
    if (input['members_create_events'] !== undefined) g.members_create_events = !!input['members_create_events'];
  }

  createGroup(actor: number, input: Body): DemoGroup {
    if (this.state.groups_admin_only && !this.isAdmin(actor)) throw forbid('Only admins can start groups here');
    const g: DemoGroup = {
      id: this.state.next.group++, slug: '', name: '', about: '', kind: 'circle', visibility: 'unlisted', join: 'approval',
      status: 'active', members: [{ person: actor, role: 'organizer', status: 'active', joined: this.now }], created: this.now,
      rev: 1, members_create_events: false,
    };
    this.groupFields(g, { name: '', ...input });
    let slug = slugify(g.name);
    for (let n = 2; this.state.groups.some((x) => x.slug === slug) || /^\d+$/.test(slug); n++) slug = `${slugify(g.name)}-${n}`;
    g.slug = slug;
    this.state.groups.push(g);
    this.log(actor, 'group.create', `group ${g.id}`);
    return g;
  }

  joinGroup(actor: number, g: DemoGroup): void {
    const m = g.members.find((x) => x.person === actor);
    if (m?.status === 'active' || m?.status === 'requested') return;
    if (m?.status === 'removed') throw new Fail(403, 'removed', 'An organizer removed you from this group; ask them to add you back');
    if (g.status === 'archived') throw new Fail(409, 'archived', 'This group is archived');
    if (g.join === 'invite') throw new Fail(403, 'invite_only', 'This group is invitation-only; ask an organizer');
    const status = g.join === 'open' ? 'active' : 'requested';
    g.members.push({ person: actor, role: 'member', status, joined: this.now });
    if (status === 'requested') {
      for (const x of g.members.filter((x) => x.status === 'active' && x.role !== 'member')) this.notify(x.person, 'request', 0, actor, g.id);
    }
  }

  leaveGroup(actor: number, g: DemoGroup): void {
    const m = g.members.find((x) => x.person === actor && x.status !== 'removed');
    if (!m) return;
    const organizers = g.members.filter((x) => x.role === 'organizer' && x.status === 'active').length;
    if (m.role === 'organizer' && m.status === 'active' && organizers <= 1) {
      throw new Fail(409, 'last_organizer', "You're the only organizer: hand the group to someone else first");
    }
    g.members = g.members.filter((x) => x.person !== actor);
  }

  setMember(actor: number, g: DemoGroup, person: number, input: Body): void {
    const a = this.access(actor, g);
    if (!a.manage) throw forbid("Only the group's organizers can manage members");
    if (!this.person(person) || this.person(person)?.status === 'disabled') throw notFound('No such person');
    const current = g.members.find((m) => m.person === person);
    const next: DemoMember = current ? { ...current } : { person, role: 'member', status: 'active', joined: this.now };
    if (input['role'] !== undefined) next.role = pick(input['role'], ['organizer', 'co-organizer', 'member'] as const, 'role');
    if (input['status'] !== undefined) {
      next.status = pick(input['status'], ['active', 'removed'] as const, 'status');
      if (next.status === 'removed') next.role = 'member';
    }
    if ((current?.role === 'organizer' || next.role === 'organizer') && !a.own) {
      throw forbid('Only an organizer can appoint or remove organizers');
    }
    const organizers = g.members.filter((m) => m.role === 'organizer' && m.status === 'active').length;
    const was = current?.role === 'organizer' && current.status === 'active';
    if (was && !(next.role === 'organizer' && next.status === 'active') && organizers <= 1) {
      throw new Fail(409, 'last_organizer', 'A group needs at least one organizer');
    }
    if (next.status === 'active' && current?.status !== 'active') next.joined = this.now;
    if (current) Object.assign(current, next);
    else g.members.push(next);
    this.log(actor, 'group.member', `group ${g.id} person ${person}`);
  }

  members(viewer: number, g: DemoGroup, a: ReturnType<Board['access']>): MemberView[] {
    const member = g.members.some((m) => m.person === viewer && m.status === 'active');
    if (!(a.manage || member || g.visibility === 'public')) throw forbid("Only members can see who's in this group");
    return g.members
      .filter((m) => a.manage || m.status === 'active')
      .map((m) => ({ person: m.person, display_name: this.name(m.person), role: m.role, status: m.status, joined: m.joined }));
  }

  // ---- events ---------------------------------------------------------------

  private active(e: DemoEvent): boolean {
    return e.status === 'draft' || e.status === 'scheduled';
  }

  private polling(e: StoredEvent): boolean {
    return e.modules.includes('when') && e.start === 0;
  }

  private end(e: StoredEvent): number {
    return e.end > e.start ? e.end : e.start + DEFAULT_LENGTH;
  }

  locked(e: StoredEvent): boolean {
    return e.status !== 'scheduled' || (e.rsvp_by !== 0 && this.now > e.rsvp_by) || (e.start !== 0 && this.now >= e.start);
  }

  eventAccess(viewer: number, e: DemoEvent): { see: boolean; answer: boolean; edit: boolean } {
    const g = this.group(e.group);
    if (!g) return { see: false, answer: false, edit: false };
    const ga = this.access(viewer, g);
    const edit = ga.manage || e.hosts.includes(viewer);
    if (edit) return { see: true, answer: e.status === 'scheduled', edit };
    if (e.status === 'draft') return { see: false, answer: false, edit: false };
    const invitee = e.invitees.includes(viewer);
    const member = g.members.some((m) => m.person === viewer && m.status === 'active');
    const see = invitee || (ga.see && e.visibility !== 'invite-only');
    return { see, answer: see && (member || invitee) && e.status === 'scheduled', edit: false };
  }

  visibleEvent(viewer: number, id: number): { e: DemoEvent; a: ReturnType<Board['eventAccess']> } {
    const e = this.event(id);
    if (!e) throw notFound('No such event');
    const a = this.eventAccess(viewer, e);
    if (!a.see) throw notFound('No such event');
    return { e, a };
  }

  private heads(id: number): number {
    return this.rsvps(id).filter((r) => r.status === 'going').reduce((n, r) => n + 1 + r.plus, 0);
  }

  /** Applies an EventInput to `e`, as the Rust `apply_event_input`. Returns whether answers are affected. */
  applyInput(e: DemoEvent, input: Body, creating: boolean): boolean {
    const before = JSON.stringify([e.start, e.end, e.where_kind, e.place, e.address, e.home, e.modules, e.bring, e.when, e.shifts, e.questions]);
    const has = (k: string) => input[k] !== undefined && input[k] !== null;
    if (has('title')) {
      const t = text(input['title'], 80, 'Title');
      if (!t) throw bad('An event needs a title');
      e.title = t;
    }
    if (has('about')) e.about = text(input['about'], 4000, 'About');
    if (has('hosts')) {
      const hosts = [...new Set(input['hosts'] as number[])];
      if (!hosts.length || hosts.length > 4) throw bad('An event has 1 to 4 hosts');
      if (hosts.some((h) => this.person(h)?.status !== 'active')) throw bad('Hosts must be people on this board');
      e.hosts = hosts;
    }
    if (has('start')) e.start = Number(input['start']) || 0;
    if (has('end')) e.end = Number(input['end']) || 0;
    if (has('where_kind')) e.where_kind = pick(input['where_kind'], ['place', 'home', 'tbd'] as const, 'where_kind');
    if (has('place')) e.place = text(input['place'], 120, 'Place');
    if (has('address')) e.address = text(input['address'], 200, 'Address');
    if (has('map')) e.map = text(input['map'], 300, 'Map link');
    if (has('home')) {
      const h = Number(input['home']) || 0;
      if (h && !this.state.households.some((x) => x.id === h)) throw notFound('No such household');
      e.home = h;
    }
    if (has('visibility')) e.visibility = pick(input['visibility'], ['group', 'invite-only', 'public'] as const, 'visibility');
    if (has('invitees')) {
      const inv = [...new Set(input['invitees'] as number[])].sort((a, b) => a - b);
      if (inv.some((p) => !this.person(p) || this.person(p)?.status === 'disabled')) throw bad('Invitees must be people on this board');
      e.invitees = inv;
    }
    if (has('capacity')) {
      const c = Number(input['capacity']) || 0;
      if (c > 2000) throw bad('Capacity: at most 2,000');
      e.capacity = c;
    }
    if (has('rsvp_by')) e.rsvp_by = Number(input['rsvp_by']) || 0;
    if (has('plus_ones')) e.plus_ones = pick(input['plus_ones'], ['none', 'limited', 'unlimited'] as const, 'plus_ones');
    if (has('plus_max')) {
      const m = Number(input['plus_max']) || 0;
      if (m > 9) throw bad('Guests per person: at most 9');
      e.plus_max = m;
    }
    if (has('status')) {
      const s = pick(input['status'], ['draft', 'scheduled'] as const, 'status');
      if (s === 'draft' && !creating && e.status === 'scheduled') {
        throw new Fail(409, 'already_scheduled', "A scheduled event can't go back to draft; cancel it instead");
      }
      if (this.active(e)) e.status = s;
    }
    if (has('modules')) {
      const mods = [...new Set((input['modules'] as string[]).map((m) => pick(m, MODULES, 'module')))];
      if (!mods.includes('headcount')) mods.unshift('headcount');
      e.modules = mods;
    }
    const number = <T extends { id: number }>(items: T[]) => {
      for (const it of items) if (!it.id) it.id = e.next_item++;
      return items;
    };
    if (has('bring')) {
      const slots = (input['bring'] as Slot[]).map((s) => ({ id: s.id || 0, name: text(s.name, 40, 'Bring-list item'), count: Number(s.count) || 0 }));
      if (slots.length > 24) throw bad('A bring list has at most 24 items');
      if (slots.some((s) => !s.name || s.count < 1 || s.count > 99)) throw bad('Each item needs a name and a count of 1 to 99');
      e.bring = number(slots);
    }
    if (has('diet_prompt')) e.diet_prompt = text(input['diet_prompt'], 120, 'Diet question');
    if (has('questions')) {
      const qs = (input['questions'] as Question[]).map((q) => {
        const kind = pick(q.kind, ['yesno', 'choice', 'text'] as const, 'question kind');
        const prompt = text(q.prompt, 120, 'Question');
        if (!prompt) throw bad('Each question needs a prompt');
        const choices = kind === 'choice' ? (q.choices ?? []).map((c) => text(c, 40, 'Choice')).filter(Boolean) : [];
        if (kind === 'choice' && (choices.length < 2 || choices.length > 6)) throw bad('A choice question has 2 to 6 choices');
        return { id: q.id || 0, kind, prompt, choices };
      });
      if (qs.length > 4) throw bad('At most 4 questions');
      e.questions = number(qs);
    }
    if (has('cost')) e.cost = text(input['cost'], 200, 'Cost');
    if (has('rides_note')) e.rides_note = text(input['rides_note'], 200, 'Rides note');
    if (has('when')) {
      const opts = (input['when'] as TimeOption[]).map((o) => ({ id: o.id || 0, start: Number(o.start) || 0, end: Number(o.end) || 0 }));
      if (opts.length > 6) throw bad('A time poll has at most 6 times');
      if (opts.some((o) => !o.start || (o.end && o.end < o.start))) throw bad('Each time needs a start, and an end after it');
      e.when = number(opts);
    }
    if (has('shifts')) {
      const shifts = (input['shifts'] as Shift[]).map((s) => ({
        id: s.id || 0, name: text(s.name, 40, 'Shift'), start: Number(s.start) || 0, end: Number(s.end) || 0, count: Number(s.count) || 0,
      }));
      if (shifts.length > 16) throw bad('At most 16 shifts');
      if (shifts.some((s) => !s.name || s.count < 1 || s.count > 99 || (s.end && s.end < s.start))) {
        throw bad('Each shift needs a name, a count of 1 to 99, and an end after its start');
      }
      e.shifts = number(shifts);
    }
    if (has('link')) e.link = text(input['link'], 300, 'Link');
    if (has('reminder_secs')) {
      const r = Number(input['reminder_secs']) || 0;
      if (r > 14 * DAY) throw bad('Reminders: at most two weeks ahead');
      e.reminder_secs = r;
      e.reminded = false;
    }
    if (this.polling(e)) {
      if (e.when.length < 2) throw bad('A time poll needs at least 2 times');
    } else if (!e.start) {
      throw bad('An event needs a start time');
    }
    if (e.end && e.end < e.start) throw bad('The end is before the start');
    if (e.visibility === 'public' && this.group(e.group)?.visibility !== 'public') throw bad('Only events of public groups can be public');
    if (e.where_kind === 'home' && !e.home) throw bad('Whose home? Pick a household');
    const affects = before !== JSON.stringify([e.start, e.end, e.where_kind, e.place, e.address, e.home, e.modules, e.bring, e.when, e.shifts, e.questions]);
    if (affects && !creating) e.rev++;
    e.edits++;
    return affects;
  }

  buildEvent(actor: number, group: number, input: Body): DemoEvent {
    const kind = pick(input['kind'] ?? 'generic', Object.keys(PRESETS) as EventKind[], 'kind');
    const p = PRESETS[kind];
    const e: DemoEvent = {
      id: 0, group, series: 0, kind, title: '', about: '', hosts: [actor], start: 0, end: 0,
      where_kind: p.modules.includes('rides') ? 'place' : 'tbd', place: '', address: '', map: '', home: 0, visibility: 'group',
      invitees: [], capacity: 0, rsvp_by: 0, plus_ones: p.plus_ones, plus_max: p.plus_max, status: 'scheduled', rev: 1,
      modules: [...p.modules], bring: [], diet_prompt: '', questions: [], cost: '', rides_note: '', when: [], shifts: [], link: '',
      reminder_secs: p.reminder, occurrence: 0, created: this.now, updated: this.now, created_by: actor, next_item: 1,
      reminded: false, edits: 0,
    };
    this.applyInput(e, input, true);
    if (input['rsvp_by'] === undefined && p.rsvp_before && e.start > p.rsvp_before) e.rsvp_by = e.start - p.rsvp_before;
    return e;
  }

  createEvent(actor: number, g: DemoGroup, input: Body): DemoEvent {
    const no = this.canCreateEvent(actor, g);
    if (no) throw no;
    const e = this.buildEvent(actor, g.id, input);
    if (e.status === 'scheduled' && !this.polling(e) && e.start <= this.now) throw bad('Pick a time in the future');
    e.id = this.state.next.event++;
    this.state.events.push(e);
    if (e.status === 'scheduled') for (const p of e.invitees) this.notify(p, 'invited', e.id, actor);
    this.log(actor, 'event.create', `event ${e.id} in group ${g.id}`);
    return e;
  }

  updateEvent(actor: number, id: number, input: Body): void {
    const { e, a } = this.visibleEvent(actor, id);
    if (!a.edit) throw forbid('Only the hosts can change this event');
    if (!this.active(e)) throw new Fail(409, 'not_active', 'This event is over or cancelled');
    if (input['rev'] !== undefined && input['rev'] !== null && Number(input['rev']) !== e.rev) {
      throw new Fail(409, 'stale', 'Someone changed this event meanwhile; reload and try again');
    }
    const next: DemoEvent = structuredClone(e);
    const affects = this.applyInput(next, input, false);
    const wasDraft = e.status === 'draft' && next.status === 'scheduled';
    const fresh = next.invitees.filter((p) => wasDraft || !e.invitees.includes(p));
    next.updated = this.now;
    Object.assign(e, next);
    if (e.status === 'scheduled') {
      for (const p of fresh) this.notify(p, 'invited', id, actor);
      if (affects && !wasDraft) for (const p of this.engaged(id)) this.notify(p, 'changed', id, actor);
    }
    this.promote(id);
    this.log(actor, 'event.update', `event ${id}`);
  }

  cancelEvent(actor: number, id: number): void {
    const { e, a } = this.visibleEvent(actor, id);
    if (!a.edit) throw forbid('Only the hosts can cancel this event');
    if (!this.active(e)) return;
    const was = e.status === 'scheduled';
    const tell = new Set([...this.rsvps(id).map((r) => r.person), ...e.invitees]);
    e.status = 'cancelled';
    e.updated = this.now;
    if (was) for (const p of tell) this.notify(p, 'cancelled', id, actor);
    this.log(actor, 'event.cancel', `event ${id}`);
  }

  deleteEvent(actor: number, id: number): void {
    const { a } = this.visibleEvent(actor, id);
    if (!a.edit) throw forbid('Only the hosts can delete this event');
    this.state.events = this.state.events.filter((e) => e.id !== id);
    this.state.rsvps = this.state.rsvps.filter((r) => r.event !== id);
    this.log(actor, 'event.delete', `event ${id}`);
  }

  lockIn(actor: number, id: number, option: number): void {
    const { e, a } = this.visibleEvent(actor, id);
    if (!a.edit) throw forbid('Only the hosts can pick the time');
    if (!this.polling(e) || !this.active(e)) throw new Fail(409, 'not_polling', "This event's time is already set");
    const o = e.when.find((x) => x.id === option);
    if (!o) throw notFound('No such time');
    this.updateEvent(actor, id, { start: o.start, end: o.end, modules: e.modules.filter((m) => m !== 'when') });
    for (const r of this.rsvps(id).filter((r) => r.when.includes(option) && r.status !== 'no')) this.setGoing(id, r.person);
    this.log(actor, 'event.lock', `event ${id} option ${option}`);
  }

  private engaged(id: number): number[] {
    const out = new Set(this.rsvps(id).filter((r) => r.status !== 'no').map((r) => r.person));
    for (const h of this.event(id)?.hosts ?? []) out.add(h);
    return [...out];
  }

  summaryOf(viewer: number, e: DemoEvent): EventSummary {
    return {
      id: e.id, group: e.group, group_name: this.group(e.group)?.name ?? '', title: e.title, kind: e.kind, start: e.start,
      end: e.end, status: e.status, heads: this.heads(e.id), capacity: e.capacity, my_status: this.rsvp(e.id, viewer)?.status ?? '',
      series: e.series, polling: this.polling(e),
    };
  }

  private counts(id: number, items: number[], pickList: (r: DemoRsvp) => number[]) {
    return items.map((item) => {
      const names = this.rsvps(id).filter((r) => r.status !== 'no' && pickList(r).includes(item)).map((r) => this.name(r.person));
      return { id: item, count: names.length, names };
    });
  }

  rsvpView(viewer: number, e: DemoEvent, r: DemoRsvp, edit: boolean): RsvpView {
    const priv = edit || viewer === r.person;
    const max = e.plus_ones === 'none' ? 0 : e.plus_ones === 'limited' ? e.plus_max : MAX_GUESTS;
    return {
      person: r.person, display_name: this.name(r.person), status: r.status, plus: r.plus, kids: r.kids, names: r.names,
      bring: [...r.bring], bring_other: r.bring_other, diet: priv ? r.diet : '', answers: priv ? r.answers.map((a) => ({ ...a })) : [],
      ride: r.ride, seats: r.seats, when: [...r.when], shifts: [...r.shifts], note: r.note,
      by_name: r.by && r.by !== r.person ? this.name(r.by) : '', via: r.via, updated: r.updated, over_policy: r.plus > max,
    };
  }

  eventView(viewer: number, id: number): EventView {
    const { e, a } = this.visibleEvent(viewer, id);
    const g = this.group(e.group);
    const count = (s: string) => this.rsvps(id).filter((r) => r.status === s).length;
    const mine = this.rsvp(id, viewer);
    return {
      event: structuredClone(e), group_name: g?.name ?? '', group_slug: g?.slug ?? '', host_names: e.hosts.map((h) => this.name(h)),
      heads: this.heads(id), going: count('going'), maybe: count('maybe'), no: count('no'), waitlist: count('waitlist'),
      mine: mine ? this.rsvpView(viewer, e, mine, a.edit) : null, can_edit: a.edit, can_answer: a.answer && !this.locked(e),
      answer_for: viewer
        ? this.answerableBy(viewer, e).filter((p) => p !== viewer).map((p) => this.person(p)).filter((p): p is DemoPerson => !!p)
            .map((p) => ({ ...this.personView(p), bio: '' }))
        : [],
      claimed: this.counts(id, e.bring.map((s) => s.id), (r) => r.bring),
      votes: this.counts(id, e.when.map((o) => o.id), (r) => r.when),
      taken: this.counts(id, e.shifts.map((s) => s.id), (r) => r.shifts),
      locked: this.locked(e),
    };
  }

  listEvents(viewer: number, q: URLSearchParams): EventSummary[] {
    const group = q.get('group') ? this.groupRef(q.get('group') ?? '').id : 0;
    const mine = !!q.get('mine') && q.get('mine') !== '0';
    const past = !!q.get('past') && q.get('past') !== '0';
    const found = this.state.events
      .filter((e) => !group || e.group === group)
      .filter((e) => (this.active(e) && (this.polling(e) || this.end(e) > this.now)) !== past)
      .filter((e) => this.eventAccess(viewer, e).see)
      .filter((e) => !mine || e.hosts.includes(viewer) || e.invitees.includes(viewer) || (this.rsvp(e.id, viewer)?.status ?? 'no') !== 'no')
      .sort((a, b) => (past ? b.start - a.start : a.start - b.start) || a.id - b.id);
    return found.slice(0, 50).map((e) => this.summaryOf(viewer, e));
  }

  // ---- answers --------------------------------------------------------------

  private eligible(person: number, e: DemoEvent): boolean {
    const p = this.person(person);
    return !!p && p.status !== 'disabled' && this.eventAccess(person, e).answer;
  }

  answerableBy(actor: number, e: DemoEvent): number[] {
    const a = this.eventAccess(actor, e);
    const out = new Set<number>();
    if (a.edit) {
      for (const m of this.group(e.group)?.members ?? []) if (m.status === 'active') out.add(m.person);
      for (const p of [...e.invitees, ...e.hosts]) out.add(p);
    } else {
      const home = this.person(actor)?.household ?? 0;
      if (home) for (const p of this.state.people) if (p.household === home) out.add(p.id);
      out.add(actor);
    }
    return [...out].sort((x, y) => x - y).filter((p) => this.eligible(p, e) || (p === actor && a.answer));
  }

  answer(actor: number, id: number, person: number, input: Body): void {
    const { e, a } = this.visibleEvent(actor, id);
    if (e.status !== 'scheduled') throw new Fail(409, 'locked', 'This event is over or cancelled');
    if (!this.answerableBy(actor, e).includes(person)) {
      throw forbid(person === actor ? 'Join the group (or get invited) to answer' : "You can't answer for them");
    }
    if (this.locked(e) && !a.edit) throw new Fail(409, 'locked', 'Answers for this event are closed; ask a host');
    const status = pick(input['status'], ['going', 'maybe', 'no'] as const, 'Answer');
    const current = this.rsvp(id, person);
    const r: DemoRsvp = current
      ? structuredClone(current)
      : {
          event: id, person, status: 'no', plus: 0, kids: 0, names: '', bring: [], bring_other: '', diet: '', answers: [], ride: '',
          seats: 0, when: [], shifts: [], note: '', by: actor, via: 'web', updated: this.now, queued: 0, rev_seen: e.rev,
        };
    const list = (k: string) => (Array.isArray(input[k]) ? [...new Set(input[k] as number[])].sort((x, y) => x - y) : undefined);
    const changed = (given: number[] | undefined, had: number[]) => !!given && JSON.stringify(given) !== JSON.stringify(had);
    const bring = list('bring');
    const when = list('when');
    const shifts = list('shifts');
    if (Number(input['rev_seen']) !== e.rev && (changed(bring, r.bring) || changed(when, r.when) || changed(shifts, r.shifts))) {
      throw new Fail(409, 'stale', "The event changed since you opened it; here's what's new");
    }
    if (input['plus'] !== undefined) {
      const plus = Number(input['plus']) || 0;
      const max = e.plus_ones === 'none' ? 0 : e.plus_ones === 'limited' ? e.plus_max : MAX_GUESTS;
      if (plus > max && (!current || plus > current.plus)) {
        throw new Fail(400, 'too_many_guests', max === 0 ? 'This event is just for the people invited' : `You can bring at most ${max}`);
      }
      r.plus = plus;
    }
    if (input['kids'] !== undefined) r.kids = Number(input['kids']) || 0;
    if (r.kids > r.plus) throw bad('Kids are counted among your guests');
    if (input['names'] !== undefined) r.names = text(input['names'], 200, "Guests' names");
    if (input['note'] !== undefined) r.note = text(input['note'], 200, 'Note');
    const others = (pickList: (o: DemoRsvp) => number[], item: number) =>
      this.rsvps(id).filter((o) => o.person !== person && o.status !== 'no' && pickList(o).includes(item)).length;
    if (bring) {
      if (!e.modules.includes('bring') && bring.length) throw bad('This event has no bring list');
      for (const slot of bring) {
        const s = e.bring.find((x) => x.id === slot);
        if (!s) throw bad('No such bring-list item');
        if (!r.bring.includes(slot) && others((o) => o.bring, slot) >= s.count) throw new Fail(409, 'slot_full', `${s.name} is covered already`);
      }
      r.bring = bring;
    }
    if (input['bring_other'] !== undefined) r.bring_other = text(input['bring_other'], 100, 'Something else');
    if (input['diet'] !== undefined) r.diet = text(input['diet'], 200, 'Diet');
    if (Array.isArray(input['answers'])) {
      r.answers = (input['answers'] as Answer[])
        .map((ans) => {
          const q = e.questions.find((x) => x.id === ans.question);
          if (!q) throw bad('No such question');
          const value = text(ans.value, 200, 'Answer');
          const ok = q.kind === 'yesno' ? ['yes', 'no', ''].includes(value) : q.kind === 'choice' ? !value || q.choices.includes(value) : true;
          if (!ok) throw bad(`"${q.prompt}": pick one of the answers`);
          return { question: q.id, value };
        })
        .filter((x) => x.value);
    }
    if (input['ride'] !== undefined) r.ride = pick(input['ride'], ['', 'need', 'offer', 'own'] as const, 'Ride');
    if (input['seats'] !== undefined) {
      const seats = Number(input['seats']) || 0;
      if (seats > 8) throw bad('Seats: at most 8');
      r.seats = seats;
    }
    if (when) {
      if (when.some((w) => !e.when.some((o) => o.id === w))) throw bad('No such time');
      r.when = when;
    }
    if (shifts) {
      for (const sid of shifts) {
        const s = e.shifts.find((x) => x.id === sid);
        if (!s) throw bad('No such shift');
        if (!r.shifts.includes(sid) && others((o) => o.shifts, sid) >= s.count) throw new Fail(409, 'slot_full', `${s.name} is full already`);
      }
      r.shifts = shifts;
    }
    if (status === 'no') {
      r.bring = [];
      r.shifts = [];
      r.ride = '';
      r.seats = 0;
    }
    if (!e.modules.includes('rides')) {
      r.ride = '';
      r.seats = 0;
    }
    const wasGoing = current?.status === 'going';
    r.status = status;
    if (status === 'going' && e.capacity > 0) {
      const taken = this.rsvps(id).filter((o) => o.person !== person && o.status === 'going').reduce((n, o) => n + 1 + o.plus, 0);
      const waiting = current?.status === 'waitlist';
      const ahead = this.rsvps(id).some((o) => o.person !== person && o.status === 'waitlist' && o.queued < (current?.queued ?? Infinity));
      if (taken + 1 + r.plus > e.capacity || (waiting && !wasGoing && ahead)) r.status = 'waitlist';
    }
    if (r.status === 'waitlist') {
      if (!r.queued) r.queued = this.state.next.queue++;
    } else {
      r.queued = 0;
    }
    r.rev_seen = e.rev;
    r.by = actor;
    r.via = actor === person ? 'web' : a.edit ? 'host' : 'household';
    r.updated = this.now;
    if (current) Object.assign(current, r);
    else this.state.rsvps.push(r);
    if (actor !== person) this.notify(person, 'answered_for', id, actor);
    this.promote(id);
  }

  private promote(id: number): void {
    const e = this.event(id);
    if (!e || e.status !== 'scheduled') return;
    const waiting = this.rsvps(id).filter((r) => r.status === 'waitlist').sort((a, b) => a.queued - b.queued);
    for (const r of waiting) {
      if (!e.capacity || this.heads(id) + 1 + r.plus <= e.capacity) {
        r.status = 'going';
        r.queued = 0;
        r.updated = this.now;
        this.notify(r.person, 'promoted', id, 0);
      }
    }
  }

  setGoing(id: number, person: number): void {
    const e = this.event(id);
    if (!e) return;
    let r = this.rsvp(id, person);
    if (r?.status === 'going') return;
    if (!r) {
      r = {
        event: id, person, status: 'no', plus: 0, kids: 0, names: '', bring: [], bring_other: '', diet: '', answers: [], ride: '',
        seats: 0, when: [], shifts: [], note: '', by: person, via: 'regular', updated: this.now, queued: 0, rev_seen: e.rev,
      };
      this.state.rsvps.push(r);
    }
    const taken = this.rsvps(id).filter((o) => o.person !== person && o.status === 'going').reduce((n, o) => n + 1 + o.plus, 0);
    if (!e.capacity || taken + 1 + r.plus <= e.capacity) {
      r.status = 'going';
      r.queued = 0;
    } else {
      r.status = 'waitlist';
      r.queued ||= this.state.next.queue++;
    }
    r.rev_seen = e.rev;
    r.updated = this.now;
  }

  // ---- series ---------------------------------------------------------------

  /** Start of occurrence `n` (0-based) after `first`, in the browser's zone. */
  private occurrence(s: DemoSeries, first: number, n: number): number {
    const d = new Date(first * 1000);
    if (s.rule === 'weekly') d.setDate(d.getDate() + 7 * s.every * n);
    else if (s.rule === 'monthly-date') d.setMonth(d.getMonth() + n);
    else {
      const nth = Math.ceil(d.getDate() / 7);
      const weekday = d.getDay();
      const m = new Date(d);
      m.setDate(1);
      m.setMonth(m.getMonth() + n);
      const offset = (weekday - m.getDay() + 7) % 7;
      m.setDate(1 + offset + 7 * (nth - 1));
      return Math.floor(m.getTime() / 1000);
    }
    return Math.floor(d.getTime() / 1000);
  }

  describe(s: DemoSeries, first: number): string {
    const d = new Date(first * 1000);
    const day = d.toLocaleDateString(undefined, { weekday: 'long' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (s.rule === 'weekly') return s.every === 1 ? `Every ${day} at ${time}` : `Every ${s.every} weeks on ${day} at ${time}`;
    if (s.rule === 'monthly-date') return `Monthly on the ${d.getDate()}${['th', 'st', 'nd', 'rd'][d.getDate() % 10 > 3 || [11, 12, 13].includes(d.getDate()) ? 0 : d.getDate() % 10]} at ${time}`;
    return `The ${['first', 'second', 'third', 'fourth', 'fifth'][Math.ceil(d.getDate() / 7) - 1]} ${day} of each month at ${time}`;
  }

  createSeries(actor: number, g: DemoGroup, input: Body): DemoSeries {
    const no = this.canCreateEvent(actor, g);
    if (no) throw no;
    const s: DemoSeries = {
      id: this.state.next.series++, group: g.id, rule: pick(input['rule'] ?? 'weekly', ['weekly', 'monthly-nth', 'monthly-date'], 'rule'),
      every: Math.min(4, Math.max(1, Number(input['every']) || 1)), nth: 0, until: Number(input['until']) || 0,
      count: Number(input['count']) || 0, window: Math.min(8, Math.max(1, Number(input['window']) || 3)), status: 'active', regulars: [],
    };
    const template = (input['event'] ?? {}) as Body;
    const first = Number(template['start']) || 0;
    const length = (Number(template['end']) || 0) > first ? Number(template['end']) - first : 0;
    this.state.series.push(s);
    for (let n = 0; n < s.window; n++) {
      const start = this.occurrence(s, first, n);
      const e = this.createEvent(actor, g, { ...template, start, end: length ? start + length : 0 });
      e.series = s.id;
      e.occurrence = n + 1;
    }
    return s;
  }

  seriesView(viewer: number, id: number) {
    const s = this.state.series.find((x) => x.id === id);
    const g = s && this.group(s.group);
    if (!s || !g || !this.access(viewer, g).see) throw notFound('No such series');
    const upcoming = this.state.events
      .filter((e) => e.series === id && this.active(e) && this.end(e) > this.now && this.eventAccess(viewer, e).see)
      .sort((a, b) => a.start - b.start);
    const first = this.state.events.filter((e) => e.series === id).sort((a, b) => a.start - b.start)[0];
    return {
      id, group: s.group, rule: s.rule, every: s.every, nth: s.nth, until: s.until, count: s.count, window: s.window, status: s.status,
      summary: first ? this.describe(s, first.start) : '', regular: s.regulars.includes(viewer), regulars: s.regulars.length,
      upcoming: upcoming.map((e) => this.summaryOf(viewer, e)),
      can_edit: this.access(viewer, g).manage || !!first?.hosts.includes(viewer),
    };
  }

  // ---- notifications ----------------------------------------------------------

  notify(to: number, kind: string, event: number, actor: number, group = 0): void {
    if (to === actor || this.person(to)?.status !== 'active') return;
    const g = group || this.event(event)?.group || 0;
    const same = kind !== 'reminder' && this.state.notices.find((n) => n.to === to && !n.read && n.kind === kind && n.event === event && n.group === g);
    if (same) {
      same.count++;
      same.actor = actor;
      same.created = this.now;
      this.state.notices = [same, ...this.state.notices.filter((n) => n !== same)];
      return;
    }
    this.state.notices.unshift({ id: this.state.next.notice++, to, kind, event, group: g, actor, created: this.now, read: false, count: 1 });
  }

  notices(person: number): NoticeView[] {
    return this.state.notices
      .filter((n) => n.to === person)
      .slice(0, 50)
      .map((n) => ({
        id: n.id, kind: n.kind, event: n.event, event_title: this.event(n.event)?.title ?? '', group: n.group,
        group_name: this.group(n.group)?.name ?? '', actor_name: n.actor ? this.name(n.actor) : '', created: n.created, read: n.read, count: n.count,
      }));
  }

  summary(person: number) {
    const mine = this.state.notices.filter((n) => n.to === person);
    const awaiting = this.state.events.filter((e) => !this.locked(e) && !this.rsvp(e.id, person) && this.eligible(person, e)).length;
    return { unread: mine.filter((n) => !n.read).length, awaiting, latest: mine[0]?.id ?? 0 };
  }
}
