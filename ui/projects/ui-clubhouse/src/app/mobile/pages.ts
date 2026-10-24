import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  colour, count, EventSummary, EventView, GroupView, headline, initials, KIND_INFO, Me, NOTICE_TEXT, NoticeView, PersonView, RsvpInput,
  STATUS_LABEL, when,
} from 'party-core';
import { Api, EventPage, GroupPage, joinGroup, leaveGroup, loadEvent, loadGroup, loadNotices, loadOverview, loadPeople, markRead, problem, relative } from 'party-ng';
import { Steps } from './steps';
import { Toast } from './toast';
import { View } from '../view';

const icon = (k: string) => KIND_INFO[k as keyof typeof KIND_INFO]?.icon ?? '📅';

/** Plans: a vertical timeline of what you're going to. */
@Component({
  selector: 'deck-plans',
  imports: [RouterLink],
  template: `
    <header class="head"><div><small>{{ plans().length }} coming up</small><h1>Plans</h1></div></header>
    <ol class="timeline">
      @for (d of days(); track d.label) {
        <li class="day"><h2><span>{{ d.num }}</span>{{ d.label }}</h2>
          @for (e of d.events; track e.id) {
            <a class="plan" [routerLink]="['/m/e', e.id]" [style.--c]="tint(e.group)">
              <span class="emoji">{{ icon(e.kind) }}</span>
              <span><b>{{ e.title }}</b><small>{{ e.polling ? 'time to be decided' : time(e.start) }} · {{ e.group_name }}</small></span>
              <em [attr.data-s]="e.my_status">{{ label(e.my_status) }}</em>
            </a>
          }
        </li>
      } @empty {
        <li class="none">Nothing yet. Swipe right on something in the deck!</li>
      }
    </ol>
  `,
})
export class Plans implements OnInit {
  private readonly api = inject(Api);
  readonly plans = signal<EventSummary[]>([]);
  readonly icon = icon;
  readonly days = computed(() => {
    const map = new Map<string, { label: string; num: string; events: EventSummary[] }>();
    for (const e of this.plans()) {
      const d = e.start ? new Date(e.start * 1000) : null;
      const k = d ? d.toDateString() : 'tbd';
      if (!map.has(k)) map.set(k, { label: d ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'short' }) : 'Time to be decided', num: d ? String(d.getDate()) : '?', events: [] });
      map.get(k)!.events.push(e);
    }
    return [...map.values()];
  });

  async ngOnInit(): Promise<void> {
    this.plans.set((await loadOverview(this.api).catch(() => null))?.plans ?? []);
  }

  tint(id: number): string {
    return colour(id);
  }

  time(t: number): string {
    return new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? '';
  }
}

/** Groups: big colourful tiles; yours first. */
@Component({
  selector: 'deck-groups',
  imports: [RouterLink],
  template: `
    <header class="head"><div><small>{{ mine().length }} yours</small><h1>Groups</h1></div><a routerLink="/m/groups/new" class="bell" aria-label="New group">＋</a></header>
    <div class="tiles-grid">
      @for (g of mine(); track g.id) {
        <a class="gtile" [routerLink]="['/m/groups', g.slug]" [style.--c]="tint(g.id)">
          <span class="ini">{{ initials(g.name) }}</span><b>{{ g.name }}</b><small>{{ count(g.members, 'member') }}{{ g.my_status === 'requested' ? ' · asked' : '' }}</small>
          @if (g.requests) { <i class="dot">{{ g.requests }}</i> }
        </a>
      }
    </div>
    @if (others().length) {
      <h2 class="section">Discover</h2>
      <div class="tiles-grid">
        @for (g of others(); track g.id) {
          <a class="gtile hollow" [routerLink]="['/m/groups', g.slug]" [style.--c]="tint(g.id)"><span class="ini">{{ initials(g.name) }}</span><b>{{ g.name }}</b><small>{{ count(g.members, 'member') }}</small></a>
        }
      </div>
    }
  `,
})
export class Groups implements OnInit {
  private readonly api = inject(Api);
  readonly mine = signal<GroupView[]>([]);
  readonly others = signal<GroupView[]>([]);
  readonly initials = initials;
  readonly count = count;

  async ngOnInit(): Promise<void> {
    const o = await loadOverview(this.api).catch(() => null);
    this.mine.set(o?.mine ?? []);
    this.others.set(o?.others ?? []);
  }

  tint(id: number): string {
    return colour(id);
  }
}

/** One group, full screen, with a sticky join bar. */
@Component({
  selector: 'deck-group',
  imports: [RouterLink],
  template: `
    @if (page(); as p) {
      @let g = p.group;
      <div class="hero-page" [style.--c]="tint(g.id)">
        <button type="button" class="back" (click)="back()" aria-label="Back">‹</button>
        <span class="ini big">{{ initials(g.name) }}</span>
        <h1>{{ g.name }}</h1>
        <p>{{ count(g.members, 'member') }} · {{ g.kind }}</p>
      </div>
      <div class="page-body">
        @if (g.about) { <p class="about">{{ g.about }}</p> }
        <h2 class="section">Coming up</h2>
        @for (e of p.events; track e.id) {
          <a class="plan" [routerLink]="['/m/e', e.id]" [style.--c]="tint(g.id)">
            <span class="emoji">{{ icon(e.kind) }}</span><span><b>{{ e.title }}</b><small>{{ e.polling ? 'time to be decided' : when(e.start, e.end) }}</small></span>
            @if (e.my_status) { <em [attr.data-s]="e.my_status">{{ label(e.my_status) }}</em> }
          </a>
        } @empty { <p class="none">Nothing planned yet.</p> }
        @if (p.members.length) {
          <h2 class="section">Members</h2>
          <div class="faces">@for (m of p.members; track m.person) { <span class="face" [style.background]="tint(m.person + 50)" [title]="m.display_name + (m.status === 'requested' ? ' (asked to join)' : '')" [class.pending]="m.status === 'requested'">{{ initials(m.display_name) }}</span> }</div>
        }
      </div>
      <div class="sticky">
        @if (!g.my_status && g.join !== 'invite') { <button type="button" class="go" (click)="act('join')">{{ g.join === 'open' ? 'Join group' : 'Ask to join' }}</button> }
        @if (g.my_status === 'requested') { <button type="button" class="ghost wide" (click)="act('leave')">Withdraw request</button> }
        @if (g.can_create_events) { <a class="go" routerLink="/m/new" [queryParams]="{ group: g.slug }">＋ New event</a> }
        @if (g.my_status === 'active') { <button type="button" class="ghost" (click)="act('leave')">Leave</button> }
      </div>
    }
  `,
})
export class Group implements OnInit {
  readonly slug = input.required<string>();
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  readonly page = signal<GroupPage | null>(null);
  readonly initials = initials;
  readonly count = count;
  readonly when = when;
  readonly icon = icon;

  async ngOnInit(): Promise<void> {
    try {
      this.page.set(await loadGroup(this.api, this.slug()));
    } catch (e) {
      this.toast.say(problem(e));
    }
  }

  async act(what: 'join' | 'leave'): Promise<void> {
    const g = this.page()!.group;
    try {
      await (what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
      this.toast.say(what === 'join' ? (g.join === 'open' ? `Welcome to ${g.name} 🎉` : 'Request sent') : `Left ${g.name}`);
      await this.ngOnInit();
    } catch (e) {
      this.toast.say(problem(e));
    }
  }

  back(): void {
    history.back();
  }

  tint(id: number): string {
    return colour(id);
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? '';
  }
}

/** One event, full screen: a hero, the facts, faces, and the answer bar. */
@Component({
  selector: 'deck-event',
  imports: [RouterLink, Steps],
  template: `
    @if (page(); as p) {
      @let v = p.view;
      @let e = v.event;
      <div class="hero-page" [style.--c]="tint(e.group)">
        <button type="button" class="back" (click)="back()" aria-label="Back">‹</button>
        <span class="emoji huge">{{ icon(e.kind) }}</span>
        <h1>{{ e.title }}</h1>
        <a [routerLink]="['/m/groups', v.group_slug]" class="on-hero">{{ v.group_name }}</a>
      </div>
      <div class="page-body">
        @if (e.status === 'cancelled') { <p class="banner">Cancelled</p> }
        <ul class="facts">
          <li>🕒 <span>{{ e.start ? when(e.start, e.end) : 'Time to be decided' }}@if (e.start) { <small>{{ rel(e.start) }}</small> }</span></li>
          <li>📍 <span>{{ e.place || (e.where_kind === 'tbd' ? 'Place TBD' : "Someone's home") }}@if (e.address) { <small>{{ e.address }}</small> }</span></li>
          <li>👥 <span>{{ headline(v.heads, e.capacity, v.maybe) }}@if (v.waitlist) { <small>{{ v.waitlist }} on the waitlist</small> }</span></li>
          <li>🙋 <span>{{ v.host_names.join(', ') }}<small>{{ v.host_names.length === 1 ? 'host' : 'hosts' }}</small></span></li>
          @if (e.cost) { <li>💶 <span>{{ e.cost }}</span></li> }
        </ul>
        @if (e.about) { <p class="about">{{ e.about }}</p> }
        @if (e.bring.length) {
          <h2 class="section">Bring list</h2>
          <div class="bars">@for (s of e.bring; track s.id) { <div class="bar"><span>{{ s.name }}</span><meter [value]="claimed(v, s.id)" min="0" [max]="s.count"></meter><small>{{ claimed(v, s.id) }}/{{ s.count }}</small></div> }</div>
        }
        <h2 class="section">Who's coming</h2>
        <div class="faces">
          @for (r of going(); track r.person) { <span class="face" [style.background]="tint(r.person + 50)" [title]="r.display_name + ' · ' + label(r.status)" [class.pending]="r.status !== 'going'">{{ initials(r.display_name) }}@if (r.plus) { <i>+{{ r.plus }}</i> }</span> }
          @if (!going().length) { <p class="none">Be the first!</p> }
        </div>
        @if (v.can_edit) {
          <h2 class="section">Host</h2>
          <div class="row-buttons">
            <a class="ghost" [routerLink]="['/m/new']" [queryParams]="{ edit: e.id }">Edit</a>
            @if (e.status === 'scheduled' || e.status === 'draft') { <button type="button" class="ghost danger" (click)="cancelEvent()">Cancel event</button> }
          </div>
        }
      </div>
      @if (v.can_answer) {
        <div class="sticky answer-bar">
          @if (v.mine) { <span class="mine" [attr.data-s]="v.mine.status">{{ label(v.mine.status) }}</span> }
          <button type="button" class="round no" (click)="ask('no')" aria-label="Can't come">✕</button>
          <button type="button" class="round maybe" (click)="ask('maybe')" aria-label="Maybe">?</button>
          <button type="button" class="round yes" (click)="ask('going')" aria-label="Going">✓</button>
        </div>
      }
      @if (asking()) { <deck-steps [view]="v" [status]="asking()!" (done)="answered($event)" (cancel)="asking.set(null)" /> }
    }
  `,
})
export class EventScreen implements OnInit {
  readonly id = input.required<string>();
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  readonly page = signal<EventPage | null>(null);
  readonly asking = signal<RsvpInput['status'] | null>(null);
  readonly going = computed(() => (this.page()?.rsvps ?? []).filter((r) => r.status !== 'no'));
  readonly when = when;
  readonly headline = headline;
  readonly initials = initials;
  readonly icon = icon;

  async ngOnInit(): Promise<void> {
    try {
      this.page.set(await loadEvent(this.api, Number(this.id())));
    } catch (e) {
      this.toast.say(problem(e));
    }
  }

  async ask(status: RsvpInput['status']): Promise<void> {
    if (status !== 'no') {
      this.asking.set(status);
      return;
    }
    const v = this.page()!.view;
    try {
      this.answered(await this.api.send<EventView>('PUT', `/api/v1/events/${v.event.id}/rsvps/me`, { status: 'no', rev_seen: v.event.rev }, 'EventView'));
    } catch (e) {
      this.toast.say(problem(e));
    }
  }

  async answered(v: EventView): Promise<void> {
    this.asking.set(null);
    this.toast.say(`Saved: ${this.label(v.mine?.status ?? '')}`);
    await this.ngOnInit();
  }

  async cancelEvent(): Promise<void> {
    if (!confirm('Cancel this event? Everyone who answered is told.')) return;
    await this.api.send('POST', `/api/v1/events/${this.id()}/cancel`, undefined, 'EventView').catch((e) => this.toast.say(problem(e)));
    await this.ngOnInit();
  }

  back(): void {
    history.back();
  }

  claimed(v: EventView, id: number): number {
    return v.claimed.find((c) => c.id === id)?.count ?? 0;
  }

  tint(id: number): string {
    return colour(id);
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? '';
  }

  rel(t: number): string {
    return relative(t);
  }
}

/** Notifications as a feed. */
@Component({
  selector: 'deck-inbox',
  imports: [RouterLink],
  template: `
    <header class="head"><div><small>{{ unread() }} unread</small><h1>Inbox</h1></div>
      @if (unread()) { <button type="button" class="bell" (click)="readAll()" aria-label="Mark all read">✓</button> }</header>
    <ul class="feed">
      @for (n of notices(); track n.id) {
        <li [class.unread]="!n.read"><a [routerLink]="n.event ? ['/m/e', n.event] : ['/m/groups']">
          <span class="face" [style.background]="tint(n.group)">{{ n.actor_name ? initials(n.actor_name) : '🎉' }}</span>
          <span><b>{{ text(n) }}</b><small>{{ rel(n.created) }}</small></span></a></li>
      } @empty { <li class="none">All quiet.</li> }
    </ul>
  `,
})
export class Inbox implements OnInit {
  private readonly api = inject(Api);
  readonly notices = signal<NoticeView[]>([]);
  readonly unread = computed(() => this.notices().filter((n) => !n.read).length);
  readonly initials = initials;

  async ngOnInit(): Promise<void> {
    this.notices.set(await loadNotices(this.api).catch(() => []));
  }

  async readAll(): Promise<void> {
    await markRead(this.api);
    await this.ngOnInit();
  }

  text(n: NoticeView): string {
    const verb = NOTICE_TEXT[n.kind] ?? n.kind;
    return verb.endsWith(':') || !n.actor_name ? `${verb} ${n.event_title || n.group_name}` : `${n.actor_name} ${verb} ${n.event_title || n.group_name}`;
  }

  tint(id: number): string {
    return colour(id);
  }

  rel(t: number): string {
    return relative(t);
  }
}

/** Me: an iOS-style settings list; each row opens a sheet. */
@Component({
  selector: 'deck-me',
  template: `
    @if (me(); as m) {
      <div class="hero-page small" [style.--c]="tint(m.id + 50)"><span class="ini big">{{ initials(m.display_name) }}</span><h1>{{ m.display_name }}</h1><p>{{ m.role }}{{ m.household_name ? ' · ' + m.household_name : '' }}</p></div>
      <div class="page-body">
        <ul class="settings">
          <li><button type="button" (click)="edit('display_name', 'Your name', m.display_name)"><span>Name</span><em>{{ m.display_name }}</em></button></li>
          <li><button type="button" (click)="edit('email', 'Email', m.email)"><span>Email</span><em>{{ m.email || 'none' }}</em></button></li>
          <li><button type="button" (click)="edit('bio', 'About you', m.bio)"><span>About</span><em>{{ m.bio || 'add a line' }}</em></button></li>
          <li><button type="button" (click)="cycle(m)"><span>Who can find me</span><em>{{ m.discoverable === 'public' ? 'Everyone' : m.discoverable === 'members' ? 'My groups' : 'Nobody' }}</em></button></li>
          <li><label><span>Email notifications</span><input type="checkbox" role="switch" [checked]="m.email_notify" [disabled]="!m.email" (change)="flip(m)" /></label></li>
        </ul>
        <ul class="settings">
          <li><button type="button" (click)="edit('pin', 'New PIN', '')"><span>Change PIN</span><em>••••</em></button></li>
          <li><button type="button" (click)="view.toDesk()"><span>Desktop view</span><em>forms, calendar, chat</em></button></li>
        </ul>
        <h2 class="section">People you can find</h2>
        <input class="big" type="search" placeholder="Search people" (input)="search($any($event.target).value)" />
        <ul class="feed">@for (p of people(); track p.id) { <li><span class="row"><span class="face" [style.background]="tint(p.id + 50)">{{ initials(p.display_name) }}</span><span><b>{{ p.display_name }}</b><small>{{ p.bio }}</small></span></span></li> }</ul>
        <button type="button" class="ghost wide danger" (click)="signOut()">Sign out</button>
      </div>
      @if (editing(); as ed) {
        <div class="sheet small" role="dialog" aria-modal="true">
          <header><button type="button" class="ghost" (click)="editing.set(null)">Cancel</button><b>{{ ed.label }}</b><span></span></header>
          <div class="step">
            @if (ed.field === 'pin') {
              <input class="big" type="password" inputmode="numeric" placeholder="Current PIN" autocomplete="current-password" (input)="current = val($event)" />
              <input class="big" type="password" inputmode="numeric" placeholder="New PIN (4–8 digits)" autocomplete="new-password" (input)="ed.value = val($event)" />
            } @else if (ed.field === 'bio') {
              <textarea class="big" rows="4" maxlength="280" [value]="ed.value" (input)="ed.value = val($event)"></textarea>
            } @else {
              <input class="big" [value]="ed.value" (input)="ed.value = val($event)" />
            }
            @if (error()) { <p class="error">{{ error() }}</p> }
          </div>
          <footer><button type="button" class="go" (click)="save(ed)">Save</button></footer>
        </div>
      }
    }
  `,
})
export class Profile implements OnInit {
  readonly view = inject(View);
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  readonly me = signal<Me | null>(null);
  readonly people = signal<PersonView[]>([]);
  readonly editing = signal<{ field: string; label: string; value: string } | null>(null);
  readonly error = signal('');
  readonly initials = initials;
  current = '';

  async ngOnInit(): Promise<void> {
    this.me.set(await this.api.get<Me>('/api/v1/auth/me', 'Me'));
    await this.search('');
  }

  async search(q: string): Promise<void> {
    this.people.set(await loadPeople(this.api, q).catch(() => []));
  }

  edit(field: string, label: string, value: string): void {
    this.error.set('');
    this.editing.set({ field, label, value });
  }

  async save(ed: { field: string; value: string }): Promise<void> {
    try {
      if (ed.field === 'pin') await this.api.send('PUT', '/api/v1/me/pin', { current: this.current, pin: ed.value }, 'Done');
      else await this.api.send('PATCH', '/api/v1/me', { [ed.field]: ed.value }, 'Me');
      this.editing.set(null);
      this.toast.say('Saved');
      await this.api.refresh();
      await this.ngOnInit();
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async cycle(m: Me): Promise<void> {
    const next = { public: 'members', members: 'nobody', nobody: 'public' }[m.discoverable];
    await this.api.send('PATCH', '/api/v1/me', { discoverable: next }, 'Me');
    await this.ngOnInit();
  }

  async flip(m: Me): Promise<void> {
    await this.api.send('PATCH', '/api/v1/me', { email_notify: !m.email_notify }, 'Me');
    await this.ngOnInit();
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    await this.router.navigateByUrl('/m/signin');
  }

  tint(id: number): string {
    return colour(id);
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
