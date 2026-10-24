// /api/v1 as the demo board answers it: the same paths, bodies and error
// shapes as api/src/api.rs and api_more.rs. Channels (mail, Mastodon,
// publishing) are shown as "not set up" because the demo has no outside.
import { Board, DemoInvite, Fail } from './board';

type Body = Record<string, unknown>;
export interface Reply { status: number; body: unknown }

const ok = { ok: true };
const NO_OUTSIDE = "The demo runs in your browser only: it can't send email, talk to Mastodon or publish a site.";

function id(raw: string | undefined, what: string): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n <= 0) throw new Fail(404, 'not_found', what);
  return n;
}

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function route(board: Board, method: string, url: URL, body: Body): Reply {
  try {
    return dispatch(board, method, url, body ?? {});
  } catch (e) {
    if (e instanceof Fail) return { status: e.status, body: { error: e.code, message: e.message } };
    return { status: 500, body: { error: 'demo_bug', message: `The demo board tripped: ${String(e)}` } };
  }
}

function dispatch(b: Board, method: string, url: URL, body: Body): Reply {
  const s = b.state;
  const q = url.searchParams;
  const path = url.pathname;
  const viewer = b.person(s.session)?.status === 'active' ? s.session : 0;
  const caller = () => {
    if (!viewer) throw new Fail(401, 'unauthorized', 'Sign in first');
    return viewer;
  };
  const admin = () => {
    const c = caller();
    if (!b.person(c)?.admin) throw new Fail(403, 'admin_only', 'Only an admin can do that');
    return c;
  };
  const reply = (data: unknown, status = 200): Reply => ({ status, body: data });
  const signIn = (person: number) => {
    s.session = person;
    const p = b.person(person);
    if (p) p.last_seen = b.now;
    return reply(b.me(person), 201);
  };

  switch (`${method} ${path}`) {
    case 'GET /api/v1/status':
      return reply({
        app: 'party', version: '0.1.0', build: 'demo', setup_needed: s.people.length === 0, signup_open: !s.signup_closed,
        clock_synced: true, setup_code_required: false, secure: location.protocol === 'https:', instance: 'party (demo)',
        providers: [], mail: false, bot: '',
      });
    case 'POST /api/v1/setup': {
      if (s.people.length) throw new Fail(409, 'already_set_up', 'party already has an admin. Sign in or sign up instead');
      const pid = b.createPerson(body['display_name'], body['email'], body['pin'], true);
      b.log(pid, 'setup', 'first admin');
      return signIn(pid);
    }
    case 'POST /api/v1/auth/signup': {
      if (!s.people.length) throw new Fail(409, 'setup_needed', 'Set party up first: the first account becomes admin');
      const invite = String(body['invite'] ?? '');
      const inv = invite ? s.invites.find((i) => i.token === invite && i.status === 'open') : undefined;
      if (invite && !inv) throw new Fail(410, 'invite_gone', 'That invitation was used, revoked or has expired');
      if (s.signup_closed && !inv) throw new Fail(403, 'signup_closed', 'Sign-up is closed. Ask an admin to make you an account');
      const pid = b.createPerson(body['display_name'], body['email'], body['pin'], false);
      if (inv) redeem(b, inv, pid);
      return signIn(pid);
    }
    case 'POST /api/v1/auth/pin': {
      const login = String(body['login'] ?? '').trim().toLowerCase();
      const p = login.includes('@') ? s.people.find((x) => x.email === login) : s.people.find((x) => x.display_name.toLowerCase() === login);
      if (!p || p.pin !== String(body['pin'] ?? '')) throw new Fail(401, 'wrong_pin', 'Wrong name, email or PIN');
      if (p.status !== 'active') throw new Fail(403, 'disabled', 'This account is disabled');
      return { ...signIn(p.id), status: 200 };
    }
    case 'POST /api/v1/auth/logout':
      s.session = 0;
      return reply(ok);
    case 'GET /api/v1/auth/me':
      return reply(b.me(caller()));
    case 'POST /api/v1/auth/pin-reset':
    case 'POST /api/v1/auth/pin-reset/confirm':
    case 'POST /api/v1/auth/oauth/start':
    case 'POST /api/v1/me/link':
      throw new Fail(400, 'demo', NO_OUTSIDE);
    case 'PATCH /api/v1/me': {
      const c = caller();
      const p = b.person(c)!;
      const name = body['display_name'] !== undefined ? String(body['display_name']).trim() : p.display_name;
      if (!name || name.length > 40 || name.includes('@')) throw new Fail(400, 'bad_request', 'Display name: 1 to 40 characters, no @');
      const email = body['email'] !== undefined ? String(body['email']).trim().toLowerCase() : p.email;
      if (s.people.some((x) => x.id !== c && x.display_name.toLowerCase() === name.toLowerCase())) {
        throw new Fail(409, 'name_taken', "Someone already uses that display name (it's also a sign-in name)");
      }
      if (body['bio'] !== undefined && String(body['bio']).length > 280) throw new Fail(400, 'bad_request', 'About you: at most 280 characters');
      p.display_name = name;
      p.email = email;
      if (body['bio'] !== undefined) p.bio = String(body['bio']).trim();
      if (body['discoverable'] !== undefined) {
        if (!['nobody', 'members', 'public'].includes(String(body['discoverable']))) throw new Fail(400, 'bad_request', 'discoverable must be nobody, members or public');
        p.discoverable = body['discoverable'] as typeof p.discoverable;
      }
      if (body['email_notify'] !== undefined) p.email_off = !body['email_notify'];
      if (body['dm_notify'] !== undefined) p.dm_off = !body['dm_notify'];
      return reply(b.me(c));
    }
    case 'PUT /api/v1/me/pin': {
      const p = b.person(caller())!;
      if (!/^\d{4,8}$/.test(String(body['pin'] ?? ''))) throw new Fail(400, 'bad_request', 'PIN: 4 to 8 digits');
      if (p.pin && p.pin !== String(body['current'] ?? '')) throw new Fail(403, 'wrong_pin', 'Current PIN is wrong');
      p.pin = String(body['pin']);
      return reply(ok);
    }
    case 'GET /api/v1/me/summary':
      return reply(b.summary(caller()));
    case 'POST /api/v1/me/calendar':
      caller();
      return reply({ path: `/cal/demo-${token()}.ics` });
    case 'GET /api/v1/people': {
      const c = caller();
      const needle = (q.get('q') ?? '').trim().toLowerCase();
      const people = s.people
        .filter((p) => b.canSeePerson(c, p))
        .filter((p) => !needle || p.display_name.toLowerCase().includes(needle))
        .map((p) => b.personView(p));
      return reply({ people, next: 0 });
    }
    case 'GET /api/v1/households': {
      const c = caller();
      return reply({
        households: s.households.map((h) => ({
          id: h.id, name: h.name,
          members: s.people.filter((p) => p.household === h.id && b.canSeePerson(c, p)).map((p) => b.personView(p)),
        })),
      });
    }
    case 'POST /api/v1/households': {
      const c = admin();
      const name = String(body['name'] ?? '').trim();
      if (!name || name.length > 60) throw new Fail(400, 'bad_request', 'Household name: 1 to 60 characters');
      const h = { id: s.next.household++, name };
      s.households.push(h);
      b.log(c, 'household.create', `household ${h.id}`);
      return reply({ ...h, members: [] }, 201);
    }
    case 'GET /api/v1/groups': {
      const needle = (q.get('q') ?? '').trim().toLowerCase();
      const mine = !!q.get('mine') && q.get('mine') !== '0';
      const groups = s.groups
        .filter((g) => b.access(viewer, g).list)
        .filter((g) => !mine || g.members.some((m) => m.person === viewer && m.status !== 'removed'))
        .filter((g) => !needle || g.name.toLowerCase().includes(needle) || g.about.toLowerCase().includes(needle))
        .map((g) => b.groupView(viewer, g));
      return reply({ groups, next: 0 });
    }
    case 'POST /api/v1/groups': {
      const c = caller();
      return reply(b.groupView(c, b.createGroup(c, body)), 201);
    }
    case 'GET /api/v1/events':
      return reply({ events: b.listEvents(viewer, q), next: 0 });
    case 'GET /api/v1/notifications':
      return reply({ notices: b.notices(caller()) });
    case 'POST /api/v1/notifications/read': {
      const c = caller();
      const upTo = Number(body['up_to']) || 0;
      for (const n of s.notices) if (n.to === c && (!upTo || n.id <= upTo)) n.read = true;
      return reply(ok);
    }
    case 'GET /api/v1/admin/people': {
      admin();
      return reply({
        people: s.people.map((p) => ({
          id: p.id, display_name: p.display_name, email: p.email, role: p.admin ? 'admin' : 'member', status: p.status,
          household: p.household, has_pin: !!p.pin, sessions: s.session === p.id ? 1 : 0, created: p.created, last_seen: p.last_seen,
          locked_secs: 0,
        })),
        next: 0,
      });
    }
    case 'GET /api/v1/admin/settings':
      admin();
      return reply({ signup_open: !s.signup_closed, groups_admin_only: s.groups_admin_only });
    case 'PATCH /api/v1/admin/settings':
      admin();
      if (body['signup_open'] !== undefined) s.signup_closed = !body['signup_open'];
      if (body['groups_admin_only'] !== undefined) s.groups_admin_only = !!body['groups_admin_only'];
      return reply({ signup_open: !s.signup_closed, groups_admin_only: s.groups_admin_only });
    case 'GET /api/v1/admin/storage':
      admin();
      return reply({
        records: s.people.length + s.groups.length + s.events.length + s.rsvps.length, last_commit_bytes: 512, max_commit_bytes: 4096,
        commits: s.audit.length, people: s.people.length, max_people: 300, sessions: s.session ? 1 : 0, max_sessions: 600,
        groups: s.groups.length, max_groups: 64, households: s.households.length, max_households: 150, quarantined: [],
      });
    case 'GET /api/v1/admin/audit':
      admin();
      return reply({ entries: s.audit.slice(0, Number(q.get('limit')) || 100) });
    case 'GET /api/v1/admin/zone':
      admin();
      return reply({ zone: s.zone, offset_secs: -new Date().getTimezoneOffset() * 60 });
    case 'PATCH /api/v1/admin/zone':
      admin();
      s.zone = String(body['zone'] ?? s.zone);
      return reply({ zone: s.zone, offset_secs: -new Date().getTimezoneOffset() * 60 });
    case 'GET /api/v1/admin/mail':
      admin();
      return reply({ state: 'off', sender_email: '', sender_name: '', key_hint: '', error: '', sent_today: 0, daily_cap: 0 });
    case 'GET /api/v1/admin/bot':
      admin();
      return reply({ state: 'off', instance: '', handle: '', commands: false, poll_secs: 0, last_poll: 0, error: '', token_hint: '' });
    case 'GET /api/v1/admin/publish':
      admin();
      return reply({
        state: 'off', repo: '', branch: '', site_url: '', every_minutes: 0, last_published: 0, generation: 0, files: 0, last_error: '',
        token_hint: '', last_commit: '',
      });
    case 'GET /api/v1/admin/providers':
      admin();
      return reply({ providers: [] });
    case 'GET /api/v1/admin/delivery':
      admin();
      return reply({ jobs: [], dropped: 0 });
    case 'GET /api/v1/admin/inbox':
      admin();
      return reply({ entries: [] });
    case 'PUT /api/v1/admin/mail':
    case 'PUT /api/v1/admin/bot':
    case 'PUT /api/v1/admin/publish':
    case 'POST /api/v1/admin/publish/now':
    case 'POST /api/v1/admin/providers':
      admin();
      throw new Fail(400, 'demo', NO_OUTSIDE);
    case 'GET /api/v1/invitations': {
      const c = caller();
      const kind = q.get('kind');
      const target = Number(q.get('target'));
      const invites = s.invites
        .filter((i) => i.target_kind === kind && i.target === target)
        .filter((i) => i.issuer === c || b.person(c)?.admin)
        .map((i) => inviteView(b, i));
      return reply({ invites });
    }
    case 'POST /api/v1/invitations': {
      const c = caller();
      const kind = body['target_kind'] === 'event' ? 'event' : 'group';
      const target = Number(body['target']) || 0;
      if (kind === 'group') {
        const g = b.group(target);
        if (!g || !b.access(c, g).manage) throw new Fail(403, 'not_allowed', "Only the group's organizers can invite people");
      } else if (!b.event(target) || !b.eventAccess(c, b.event(target)!).edit) {
        throw new Fail(403, 'not_allowed', 'Only the hosts can invite people');
      }
      const inv: DemoInvite = {
        id: s.next.invite++, target_kind: kind, target, issuer: c, email: String(body['email'] ?? ''), handle: String(body['handle'] ?? ''),
        person: Number(body['person']) || 0, expires: b.now + 14 * 86_400, uses_left: Number(body['uses']) || 1, status: 'open', token: token(),
      };
      s.invites.push(inv);
      return reply(inviteView(b, inv), 201);
    }
  }

  const parts = path.replace(/^\/api\/v1\//, '').split('/');
  const [a0, a1, a2, a3] = parts;
  const at = (...shape: string[]) => parts.length === shape.length && shape.every((x, i) => x === '*' || x === parts[i]);

  if (method === 'GET' && at('people', '*')) {
    const c = caller();
    const p = b.person(id(a1, 'No such person'));
    if (!p || !b.canSeePerson(c, p)) throw new Fail(404, 'not_found', 'No such person');
    return reply(b.personView(p));
  }
  if (method === 'PATCH' && at('admin', 'people', '*')) {
    const c = admin();
    const p = b.person(id(a2, 'No such person'));
    if (!p) throw new Fail(404, 'not_found', 'No such person');
    if (body['role'] !== undefined) p.admin = body['role'] === 'admin';
    if (body['disabled'] !== undefined) {
      if (p.id === c && body['disabled']) throw new Fail(409, 'self_disable', "You can't disable yourself");
      p.status = body['disabled'] ? 'disabled' : 'active';
    }
    if (body['pin'] !== undefined) p.pin = String(body['pin']);
    if (body['display_name'] !== undefined) p.display_name = String(body['display_name']).trim();
    if (body['household'] !== undefined) p.household = Number(body['household']) || 0;
    b.log(c, 'person.update', `person ${p.id}`);
    return reply(ok);
  }
  if (at('households', '*')) {
    admin();
    const hid = id(a1, 'No such household');
    if (method === 'PATCH') {
      const h = s.households.find((x) => x.id === hid);
      if (!h) throw new Fail(404, 'not_found', 'No such household');
      h.name = String(body['name'] ?? h.name).trim();
      return reply(ok);
    }
    if (method === 'DELETE') {
      s.households = s.households.filter((x) => x.id !== hid);
      for (const p of s.people) if (p.household === hid) p.household = 0;
      return reply(ok);
    }
  }
  if (at('households', '*', 'members', '*')) {
    admin();
    const p = b.person(id(a3, 'No such person'));
    if (!p) throw new Fail(404, 'not_found', 'No such person');
    if (method === 'PUT') p.household = id(a1, 'No such household');
    if (method === 'DELETE' && p.household === Number(a1)) p.household = 0;
    return reply(ok);
  }

  if (a0 === 'groups' && a1) {
    if (method === 'GET' && at('groups', '*')) {
      return reply(b.groupView(viewer, b.visibleGroup(viewer, a1).g));
    }
    const c = caller();
    const { g, a } = b.visibleGroup(c, a1);
    if (method === 'PATCH' && at('groups', '*')) {
      if (!a.manage) throw new Fail(403, 'not_allowed', "Only the group's organizers can change it");
      if (body['rev'] !== undefined && Number(body['rev']) !== g.rev) {
        throw new Fail(409, 'stale', 'Someone changed this group meanwhile; reload and try again');
      }
      if (body['status'] !== undefined && body['status'] !== g.status) {
        if (!a.own) throw new Fail(403, 'not_allowed', 'Only an organizer can archive or restore the group');
        g.status = body['status'] === 'archived' ? 'archived' : 'active';
      }
      const before = JSON.stringify(g);
      const draft = structuredClone(g);
      b.groupFields(draft, body);
      Object.assign(g, draft);
      if (JSON.stringify(g) !== before) g.rev++;
      b.log(c, 'group.update', `group ${g.id}`);
      return reply(b.groupView(c, g));
    }
    if (method === 'DELETE' && at('groups', '*')) {
      if (!a.own) throw new Fail(403, 'not_allowed', 'Only an organizer can delete the group');
      s.groups = s.groups.filter((x) => x.id !== g.id);
      return reply(ok);
    }
    if (method === 'GET' && a2 === 'members' && !a3) return reply({ members: b.members(c, g, a) });
    if (method === 'POST' && a2 === 'join') {
      b.joinGroup(c, g);
      return reply(b.groupView(c, g));
    }
    if (method === 'POST' && a2 === 'leave') {
      b.leaveGroup(c, g);
      return b.access(c, g).see ? reply(b.groupView(c, g)) : reply(ok);
    }
    if (method === 'PUT' && a2 === 'members' && a3) {
      b.setMember(c, g, id(a3, 'No such person'), body);
      return reply({ members: b.members(c, g, b.access(c, g)) });
    }
    if (method === 'POST' && a2 === 'transfer') {
      if (!a.own) throw new Fail(403, 'not_allowed', 'Only an organizer can hand the group over');
      const to = Number(body['to']);
      if (!g.members.some((m) => m.person === to && m.status === 'active')) {
        throw new Fail(409, 'not_a_member', 'Hand the group to someone who is already a member');
      }
      for (const m of g.members) {
        if (m.person === to) m.role = 'organizer';
        else if (m.person === c && m.role === 'organizer') m.role = 'co-organizer';
      }
      g.rev++;
      return reply(b.groupView(c, g));
    }
    if (method === 'POST' && a2 === 'events') return reply(b.eventView(c, b.createEvent(c, g, body).id), 201);
    if (method === 'POST' && a2 === 'series') return reply(b.seriesView(c, b.createSeries(c, g, body).id), 201);
  }

  if (a0 === 'events' && a1) {
    if (method === 'GET' && at('events', '*')) {
      if (a1.endsWith('.ics')) throw new Fail(400, 'demo', 'Calendar files come from the board; the demo has none');
      return reply(b.eventView(viewer, id(a1, 'No such event')));
    }
    const c = caller();
    const eid = id(a1, 'No such event');
    if (method === 'PATCH' && at('events', '*')) {
      if (q.get('scope') === 'following') {
        const e = b.visibleEvent(c, eid).e;
        const later = s.events.filter((x) => e.series && x.series === e.series && x.start >= e.start);
        const delta = body['start'] ? Number(body['start']) - e.start : 0;
        for (const x of later) {
          const own = x.id === eid ? body : { ...body, rev: undefined, start: x.start + delta, end: body['end'] ? x.start + delta + (Number(body['end']) - Number(body['start'])) : x.end };
          b.updateEvent(c, x.id, own);
        }
      } else {
        b.updateEvent(c, eid, body);
      }
      return reply(b.eventView(c, eid));
    }
    if (method === 'DELETE' && at('events', '*')) {
      b.deleteEvent(c, eid);
      return reply(ok);
    }
    if (method === 'POST' && a2 === 'cancel') {
      b.cancelEvent(c, eid);
      return reply(b.eventView(c, eid));
    }
    if (method === 'POST' && a2 === 'lock') {
      b.lockIn(c, eid, Number(body['option']));
      return reply(b.eventView(c, eid));
    }
    if (method === 'GET' && a2 === 'rsvps' && !a3) {
      const { e, a } = b.visibleEvent(c, eid);
      const order = { going: 0, maybe: 1, waitlist: 2, no: 3 };
      const rsvps = b.rsvps(eid)
        .sort((x, y) => order[x.status] - order[y.status] || x.queued - y.queued || x.updated - y.updated)
        .map((r) => b.rsvpView(c, e, r, a.edit));
      return reply({ rsvps });
    }
    if (method === 'PUT' && a2 === 'rsvps' && a3) {
      b.answer(c, eid, a3 === 'me' ? c : id(a3, 'No such person'), body);
      return reply(b.eventView(c, eid));
    }
    if (method === 'GET' && a2 === 'rides') {
      const { a } = b.visibleEvent(c, eid);
      if (!a.edit) throw new Fail(403, 'not_allowed', 'Only the hosts see the ride board');
      const live = b.rsvps(eid).filter((r) => r.status !== 'no');
      const entry = (r: { person: number; seats: number }) => ({ person: r.person, display_name: b.name(r.person), seats: Math.max(1, r.seats) });
      const needs = live.filter((r) => r.ride === 'need').map(entry);
      const offers = live.filter((r) => r.ride === 'offer').map(entry);
      return reply({ needs, offers, spare: offers.reduce((n, o) => n + o.seats, 0) - needs.reduce((n, o) => n + o.seats, 0) });
    }
  }

  if (a0 === 'series' && a1) {
    const c = caller();
    const sid = id(a1, 'No such series');
    const series = s.series.find((x) => x.id === sid);
    if (method === 'GET' && !a2) return reply(b.seriesView(c, sid));
    if (method === 'PUT' && a2 === 'regular' && series) {
      series.regulars = series.regulars.filter((p) => p !== c);
      if (body['on']) {
        series.regulars.push(c);
        for (const e of s.events.filter((x) => x.series === sid && x.status === 'scheduled' && x.start > b.now)) b.setGoing(e.id, c);
      }
      return reply(b.seriesView(c, sid));
    }
    if (method === 'DELETE' && !a2 && series) {
      series.status = 'ended';
      if (q.get('cancel') && q.get('cancel') !== '0') {
        for (const e of s.events.filter((x) => x.series === sid && x.status === 'scheduled' && x.start > b.now)) b.cancelEvent(c, e.id);
      }
      return reply(ok);
    }
    if (method === 'PATCH' && !a2) return reply(b.seriesView(c, sid));
  }

  if (a0 === 'invitations' && a1) {
    const inv = s.invites.find((i) => (a2 ? i.id === Number(a1) : i.token === a1));
    if (method === 'GET' && !a2) {
      const target = inv && (inv.target_kind === 'group' ? b.group(inv.target)?.name : b.event(inv.target)?.title);
      return reply({
        target_kind: inv?.target_kind ?? 'group', target: inv?.target ?? 0, target_name: target ?? '', issuer_name: inv ? b.name(inv.issuer) : '',
        valid: inv?.status === 'open', reason: inv ? (inv.status === 'open' ? '' : `This invitation is ${inv.status}`) : 'No such invitation', providers: [],
      });
    }
    const c = caller();
    if (!inv) throw new Fail(404, 'not_found', 'No such invitation');
    if (method === 'POST' && a2 === 'redeem') {
      if (inv.status !== 'open') throw new Fail(410, 'invite_gone', `This invitation is ${inv.status}`);
      redeem(b, inv, c);
      return reply(ok);
    }
    if (method === 'POST' && a2 === 'revoke') {
      inv.status = 'revoked';
      return reply(inviteView(b, inv));
    }
  }

  if (method === 'DELETE' && path === '/api/v1/me/identities') return reply(b.me(caller()));
  if (method === 'DELETE' && at('admin', '*')) {
    admin();
    return reply(ok);
  }
  if (method === 'POST' && at('admin', 'delivery', '*', 'retry')) {
    admin();
    return reply(ok);
  }
  throw new Fail(404, 'not_found', `The demo board doesn't answer ${method} ${path}`);
}

function inviteView(b: Board, i: DemoInvite) {
  return {
    id: i.id, target_kind: i.target_kind, target: i.target,
    target_name: (i.target_kind === 'group' ? b.group(i.target)?.name : b.event(i.target)?.title) ?? '', issuer_name: b.name(i.issuer),
    email: i.email, handle: i.handle, person: i.person, expires: i.expires, uses_left: i.uses_left, status: i.status, token: i.token,
    link: `${location.origin}${document.baseURI.replace(location.origin, '').replace(/\/$/, '')}/invite/${i.token}`, emailed: false, messaged: false,
  };
}

function redeem(b: Board, inv: DemoInvite, person: number): void {
  if (inv.target_kind === 'group') {
    const g = b.group(inv.target);
    if (g && !g.members.some((m) => m.person === person && m.status === 'active')) {
      g.members = g.members.filter((m) => m.person !== person);
      g.members.push({ person, role: 'member', status: 'active', joined: b.now });
    }
  } else {
    const e = b.event(inv.target);
    if (e && !e.invitees.includes(person)) e.invitees.push(person);
  }
  inv.uses_left = Math.max(0, inv.uses_left - 1);
  if (!inv.uses_left) inv.status = 'used';
}
