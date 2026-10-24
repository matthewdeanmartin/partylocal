import { Component, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { colour, count, GroupView, initials, JOIN_LABEL, KIND_LABEL, Me, NOTICE_TEXT, NoticeView, PersonView, ROLE_LABEL, VISIBILITY_LABEL, when } from 'party-core';
import { Api, GroupPage, joinGroup, leaveGroup, loadGroup, loadNotices, loadPeople, markRead, problem, relative } from 'party-ng';
import { Cal, Nav } from './state';

/** A group: about, its upcoming events (open them on the calendar), members, join/leave. */
@Component({
  selector: 'cal-group',
  template: `
    @if (page(); as p) {
      @let g = p.group;
      <header class="band" [style.--c]="tint(g.id)">
        <button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button>
        <span class="kind">{{ kind(g) }}</span>
        <h2>{{ g.name }}</h2>
        <span class="on-band">{{ count(g.members, 'member') }}</span>
      </header>
      <div class="body">
        @if (g.about) { <p class="about">{{ g.about }}</p> }
        <dl class="facts">
          <dt>👁</dt><dd>{{ vis(g) }}</dd>
          <dt>🚪</dt><dd>{{ join(g) }}</dd>
          @if (g.my_role) { <dt>⭐</dt><dd>You're {{ role(g.my_role) }}</dd> }
        </dl>
        <div class="actions">
          @if (!g.my_status && g.join !== 'invite' && g.status === 'active') { <button type="button" class="primary" (click)="act('join')">{{ g.join === 'open' ? 'Join' : 'Ask to join' }}</button> }
          @if (g.my_status === 'requested') { <span class="muted">You asked to join.</span><button type="button" (click)="act('leave')">Withdraw</button> }
          @if (g.my_status === 'active') { <button type="button" (click)="act('leave')">Leave</button> }
          @if (g.can_create_events) { <button type="button" class="primary" (click)="nav.set({ g: null, new: start(), group: g.slug })">+ Event</button> }
          @if (cal.hidden().includes(g.id)) { <button type="button" (click)="cal.toggle(g.id)">Show on calendar</button> }
        </div>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <section>
          <h3>Coming up</h3>
          <ul class="list">
            @for (e of p.events; track e.id) {
              <li><button type="button" (click)="nav.open('e', e.id)"><b>{{ e.title }}</b><small>{{ e.polling ? 'time to be decided' : when(e.start, e.end) }}</small></button></li>
            } @empty { <li class="muted">Nothing planned.</li> }
          </ul>
        </section>
        @if (p.members.length) {
          <section>
            <h3>Members</h3>
            <ul class="people">
              @for (m of p.members; track m.person) {
                <li [attr.data-s]="m.status === 'requested' ? 'maybe' : 'going'"><span class="dot"></span>{{ m.display_name }}<em>{{ m.status === 'requested' ? 'asked to join' : role(m.role) }}</em>
                  @if (g.can_manage && m.status === 'requested') { <button type="button" class="small" (click)="approve(m.person)">Let in</button> }</li>
              }
            </ul>
          </section>
        }
      </div>
    } @else {
      <div class="body"><button type="button" class="x" (click)="nav.close()">✕</button><p [class.error]="error()">{{ error() || 'Loading…' }}</p></div>
    }
  `,
})
export class GroupPanel {
  readonly slug = input.required<string>();
  readonly nav = inject(Nav);
  readonly cal = inject(Cal);
  private readonly api = inject(Api);
  readonly page = signal<GroupPage | null>(null);
  readonly error = signal('');
  readonly when = when;
  readonly count = count;

  constructor() {
    effect(() => {
      const slug = this.slug();
      untracked(() => void this.load(slug));
    });
  }

  async load(slug: string): Promise<void> {
    try {
      this.page.set(await loadGroup(this.api, slug));
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async act(what: 'join' | 'leave'): Promise<void> {
    const g = this.page()!.group;
    try {
      await (what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
      this.cal.say(what === 'join' ? (g.join === 'open' ? `You joined ${g.name}.` : 'Asked to join.') : `You left ${g.name}.`);
      await Promise.all([this.load(g.slug), this.cal.load()]);
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async approve(person: number): Promise<void> {
    const g = this.page()!.group;
    try {
      await this.api.send('PUT', `/api/v1/groups/${g.id}/members/${person}`, { status: 'active' }, 'MemberList');
      await this.load(g.slug);
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  start(): number {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(19, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  tint(id: number): string {
    return colour(id);
  }

  kind(g: GroupView): string {
    return KIND_LABEL[g.kind];
  }

  vis(g: GroupView): string {
    return VISIBILITY_LABEL[g.visibility];
  }

  join(g: GroupView): string {
    return JOIN_LABEL[g.join];
  }

  role(r: string): string {
    return (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).toLowerCase();
  }
}

/** Notifications, newest first; each opens its event on the calendar. */
@Component({
  selector: 'cal-inbox',
  template: `
    <header class="band plain"><button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button><h2>Notifications</h2>
      @if (notices().some(unread)) { <button type="button" class="link on-band" (click)="readAll()">Mark all read</button> }</header>
    <div class="body">
      <ul class="list">
        @for (n of notices(); track n.id) {
          <li [class.unread]="!n.read"><button type="button" (click)="open(n)"><b>{{ text(n) }}</b><small>{{ rel(n.created) }}</small></button></li>
        } @empty { <li class="muted">Nothing new.</li> }
      </ul>
    </div>
  `,
})
export class Inbox implements OnInit {
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  readonly notices = signal<NoticeView[]>([]);
  readonly unread = (n: NoticeView) => !n.read;

  async ngOnInit(): Promise<void> {
    this.notices.set(await loadNotices(this.api).catch(() => []));
  }

  async readAll(): Promise<void> {
    await markRead(this.api);
    await this.ngOnInit();
  }

  open(n: NoticeView): void {
    if (n.event) this.nav.open('e', n.event);
    else if (n.group) this.nav.close();
  }

  text(n: NoticeView): string {
    const verb = NOTICE_TEXT[n.kind] ?? n.kind;
    const who = n.actor_name ? `${n.actor_name} ` : '';
    return verb.endsWith(':') || !who ? `${verb} ${n.event_title || n.group_name}` : `${who}${verb} ${n.event_title || n.group_name}`;
  }

  rel(t: number): string {
    return relative(t);
  }
}

/** People: a search box over who you can find. */
@Component({
  selector: 'cal-people',
  template: `
    <header class="band plain"><button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button><h2>People</h2></header>
    <div class="body">
      <input type="search" placeholder="Search by name" [value]="q()" (input)="search($any($event.target).value)" aria-label="Search people" />
      <ul class="people roomy">
        @for (p of people(); track p.id) {
          <li><span class="avatar" [style.background]="tint(p.id)">{{ initials(p.display_name) }}</span><span><b>{{ p.display_name }}</b><small>{{ p.bio }}{{ p.household_name ? ' · ' + p.household_name : '' }}</small></span></li>
        } @empty { <li class="muted">Nobody found.</li> }
      </ul>
    </div>
  `,
})
export class People implements OnInit {
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  readonly people = signal<PersonView[]>([]);
  readonly q = signal('');
  readonly initials = initials;

  ngOnInit(): void {
    void this.search('');
  }

  async search(q: string): Promise<void> {
    this.q.set(q);
    this.people.set(await loadPeople(this.api, q).catch(() => []));
  }

  tint(id: number): string {
    return colour(id + 50);
  }
}

/** Your profile and PIN. */
@Component({
  selector: 'cal-me',
  template: `
    <header class="band plain"><button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button><h2>{{ me()?.display_name }}</h2><span class="on-band">{{ me()?.role }}</span></header>
    @if (me(); as m) {
      <form class="body edit" (submit)="save($event)">
        <label class="line"><span>Name</span><input [value]="m.display_name" (input)="name = val($event)" /></label>
        <label class="line"><span>Email</span><input type="email" [value]="m.email" (input)="email = val($event)" /></label>
        <label class="line top"><span>About</span><textarea rows="3" maxlength="280" [value]="m.bio" (input)="bio = val($event)"></textarea></label>
        <label class="line"><span>Found by</span><select [value]="m.discoverable" (change)="disc = val($event)"><option value="public">everyone here</option><option value="members">people in my groups</option><option value="nobody">nobody</option></select></label>
        <label class="line check"><input type="checkbox" [checked]="m.email_notify" (change)="notify = !notify" [disabled]="!m.email" /> Email me about invitations and changes</label>
        <div class="actions"><button type="submit" class="primary">Save</button></div>
        <h3>Change PIN</h3>
        <label class="line"><span>Current</span><input type="password" inputmode="numeric" autocomplete="current-password" (input)="pinNow = val($event)" /></label>
        <label class="line"><span>New</span><input type="password" inputmode="numeric" autocomplete="new-password" (input)="pinNew = val($event)" /></label>
        <div class="actions"><button type="button" (click)="pin()">Change PIN</button><button type="button" class="danger" (click)="signOut()">Sign out</button></div>
        @if (msg()) { <p [class.error]="bad()">{{ msg() }}</p> }
      </form>
    }
  `,
})
export class Profile implements OnInit {
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  readonly me = signal<Me | null>(null);
  readonly msg = signal('');
  readonly bad = signal(false);
  name = '';
  email = '';
  bio = '';
  disc = '';
  notify = false;
  pinNow = '';
  pinNew = '';

  async ngOnInit(): Promise<void> {
    const m = await this.api.get<Me>('/api/v1/auth/me', 'Me');
    this.me.set(m);
    [this.name, this.email, this.bio, this.disc, this.notify] = [m.display_name, m.email, m.bio, m.discoverable, m.email_notify];
  }

  async save(e: Event): Promise<void> {
    e.preventDefault();
    await this.run(async () => {
      await this.api.send('PATCH', '/api/v1/me', { display_name: this.name, email: this.email, bio: this.bio, discoverable: this.disc, email_notify: this.notify }, 'Me');
      await this.api.refresh();
      return 'Saved.';
    });
  }

  async pin(): Promise<void> {
    await this.run(async () => {
      await this.api.send('PUT', '/api/v1/me/pin', { current: this.pinNow, pin: this.pinNew }, 'Done');
      return 'PIN changed.';
    });
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    this.nav.close();
  }

  private async run(work: () => Promise<string>): Promise<void> {
    try {
      this.msg.set(await work());
      this.bad.set(false);
    } catch (e) {
      this.msg.set(problem(e));
      this.bad.set(true);
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** Starting a group: a new layer on the calendar. */
@Component({
  selector: 'cal-new-group',
  template: `
    <header class="band plain"><button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button><h2>New group</h2><span class="on-band">a new layer on your calendar</span></header>
    <form class="body edit" (submit)="save($event)">
      <label class="line"><span>Name</span><input required maxlength="60" (input)="name = val($event)" /></label>
      <label class="line top"><span>About</span><textarea rows="3" (input)="about = val($event)"></textarea></label>
      <label class="line"><span>Kind</span><select (change)="kind = val($event)"><option value="club">club (regular meetups)</option><option value="circle" selected>circle (family, friends)</option><option value="one-off">one-off</option></select></label>
      <label class="line"><span>Who sees it</span><select (change)="visibility = val($event)"><option value="public">anyone</option><option value="unlisted" selected>people with the link</option><option value="private">members only</option></select></label>
      <label class="line"><span>Joining</span><select (change)="join = val($event)"><option value="open">anyone can join</option><option value="approval" selected>ask, organizer approves</option><option value="invite">invitation only</option></select></label>
      @if (error()) { <p class="error">{{ error() }}</p> }
      <div class="actions"><button type="button" (click)="nav.close()">Cancel</button><button type="submit" class="primary">Create</button></div>
    </form>
  `,
})
export class NewGroup {
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  private readonly cal = inject(Cal);
  readonly error = signal('');
  name = '';
  about = '';
  kind = 'circle';
  visibility = 'unlisted';
  join = 'approval';

  async save(e: Event): Promise<void> {
    e.preventDefault();
    try {
      const g = await this.api.send<GroupView>('POST', '/api/v1/groups', { name: this.name, about: this.about, kind: this.kind, visibility: this.visibility, join: this.join }, 'GroupView');
      await this.cal.load();
      this.nav.open('g', g.slug);
    } catch (err) {
      this.error.set(problem(err));
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
