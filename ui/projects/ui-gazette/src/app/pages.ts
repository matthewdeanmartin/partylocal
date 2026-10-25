import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { count, EventSummary, EventView, GroupView, JOIN_LABEL, KIND_INFO, NOTICE_TEXT, NoticeView, PersonView, ROLE_LABEL, STATUS_LABEL, when } from 'party-core';
import { Api, GroupPage, joinGroup, leaveGroup, loadGroup, loadNotices, loadOverview, loadPeople, markRead, Overview, problem, relative } from 'party-ng';

const kindLabel = (k: string) => KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? 'Gathering';
const statusLabel = (s: string) => STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? '';

/** The front page: a lead story, columns of the rest, and reply coupons. */
@Component({
  selector: 'gz-front',
  imports: [RouterLink],
  template: `
    @if (error()) { <p class="stop">{{ error() }}</p> }
    @if (lead(); as l) {
      <article class="lead">
        <p class="kicker">{{ kindLabel(l.event.kind) }} · {{ l.group_name }}</p>
        <h1><a [routerLink]="['/e', l.event.id]">{{ l.event.title }}</a></h1>
        <p class="dek">{{ dek(l) }}</p>
        <p class="byline">By {{ l.host_names.join(' and ') }}, for {{ l.group_name }}</p>
        <div class="columns">
          <p class="drop">{{ l.event.about || 'Particulars are few, but the hosts promise a good time to all who come. Readers are encouraged to reply promptly.' }}</p>
          <p>{{ headcount(l) }}</p>
          <p class="more"><a [routerLink]="['/e', l.event.id]">Continued on page E{{ l.event.id }}, with the reply slip →</a></p>
        </div>
      </article>
    }
    <div class="spread">
      <section class="stories">
        <h2 class="rule">Also in this issue</h2>
        <div class="grid3">
          @for (e of rest(); track e.id) {
            <article class="story" [class.cancelled]="e.status === 'cancelled'">
              <p class="kicker">{{ e.group_name }}</p>
              <h3><a [routerLink]="['/e', e.id]">{{ e.title }}</a></h3>
              <p class="dek small">{{ e.polling ? 'Date to be settled by vote' : when(e.start, e.end) }}</p>
              <p class="small">{{ e.heads }} {{ e.heads === 1 ? 'reader has' : 'readers have' }} said they will attend{{ e.capacity ? ', of ' + e.capacity + ' places' : '' }}.
                @if (e.my_status) { <em>You: {{ statusLabel(e.my_status) }}.</em> }</p>
            </article>
          } @empty { <p class="small">A quiet week: no further gatherings reported.</p> }
        </div>
      </section>
      <aside class="sidebar">
        <h2 class="rule">Awaiting your reply</h2>
        @for (e of o()?.waiting ?? []; track e.id) {
          <a class="coupon" [routerLink]="['/e', e.id]" [fragment]="'reply'"><span class="scissors" aria-hidden="true">✂</span>
            <b>{{ e.title }}</b><small>{{ e.polling ? 'a date to vote on' : when(e.start) }} · {{ e.group_name }}</small><span class="cta">Clip and reply →</span></a>
        } @empty { <p class="small">You are all replied up. The editors salute you.</p> }
        <h2 class="rule">The week ahead</h2>
        <p class="forecast"><b>{{ thisWeek() }}</b> {{ thisWeek() === 1 ? 'gathering' : 'gatherings' }} in the next seven days; <b>{{ o()?.plans?.length ?? 0 }}</b> in your diary.</p>
        <h2 class="rule">Societies to join</h2>
        @for (g of (o()?.others ?? []).slice(0, 4); track g.id) {
          <p class="small"><a [routerLink]="['/societies', g.slug]"><b>{{ g.name }}</b></a>, {{ count(g.members, 'member') }}. {{ g.about }}</p>
        }
      </aside>
    </div>
  `,
})
export class Front implements OnInit {
  private readonly api = inject(Api);
  readonly o = signal<Overview | null>(null);
  readonly lead = signal<EventView | null>(null);
  readonly error = signal('');
  readonly when = when;
  readonly count = count;
  readonly kindLabel = kindLabel;
  readonly statusLabel = statusLabel;
  readonly rest = computed(() => (this.o()?.upcoming ?? []).filter((e) => e.id !== this.lead()?.event.id).slice(0, 9));
  readonly thisWeek = computed(() => (this.o()?.upcoming ?? []).filter((e) => e.start && e.start < Date.now() / 1000 + 7 * 86_400).length);

  async ngOnInit(): Promise<void> {
    try {
      const o = await loadOverview(this.api);
      this.o.set(o);
      // The lead: the busiest thing coming up that you can go to.
      const pick = [...o.waiting, ...o.plans].filter((e) => e.start).sort((a, b) => b.heads - a.heads)[0] ?? o.upcoming[0];
      if (pick) this.lead.set(await this.api.get<EventView>(`/api/v1/events/${pick.id}`, 'EventView'));
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  dek(v: EventView): string {
    const e = v.event;
    const at = e.where_kind === 'tbd' ? 'at a place yet to be named' : `at ${e.place || 'a private residence'}`;
    return e.start ? `${when(e.start, e.end)}, ${at}.` : `${e.modules.includes('when') ? 'The date is to be settled by a vote' : 'Time not yet determined'}, ${at}.`;
  }

  headcount(v: EventView): string {
    const going = v.heads ? `${v.heads} ${v.heads === 1 ? 'person is' : 'people are'} expected` : 'No one has yet replied';
    const room = v.event.capacity ? `, with room for ${v.event.capacity}` : '';
    const maybe = v.maybe ? `; ${v.maybe} more ${v.maybe === 1 ? 'is' : 'are'} undecided` : '';
    return `${going}${room}${maybe}. ${v.mine ? `Your reply is on file: ${statusLabel(v.mine.status).toLowerCase()}.` : 'Your reply has not yet been received.'}`;
  }
}

/** Your diary: what you've accepted, by date, like an engagements column. */
@Component({
  selector: 'gz-diary',
  imports: [RouterLink],
  template: `
    <h1 class="section-head">Your Diary</h1>
    <p class="standfirst">Engagements accepted, considered and pending, as recorded by this office.</p>
    <div class="columns diary">
      @for (e of plans(); track e.id) {
        <p class="entry"><span class="date">{{ e.polling ? 'Date to be settled' : day(e.start) }}</span>
          <a [routerLink]="['/e', e.id]"><b>{{ e.title }}</b></a>, {{ e.group_name }}. <em>{{ statusLabel(e.my_status) }}.</em></p>
      } @empty { <p>Your diary is empty. See the front page for gatherings.</p> }
    </div>
    @if (waiting().length) {
      <h2 class="rule">Replies outstanding</h2>
      <div class="coupons">
        @for (e of waiting(); track e.id) {
          <a class="coupon" [routerLink]="['/e', e.id]" fragment="reply"><span class="scissors" aria-hidden="true">✂</span><b>{{ e.title }}</b><small>{{ e.polling ? 'a date to vote on' : when(e.start) }}</small><span class="cta">Reply →</span></a>
        }
      </div>
    }
  `,
})
export class Diary implements OnInit {
  private readonly api = inject(Api);
  readonly plans = signal<EventSummary[]>([]);
  readonly waiting = signal<EventSummary[]>([]);
  readonly when = when;
  readonly statusLabel = statusLabel;

  async ngOnInit(): Promise<void> {
    const o = await loadOverview(this.api).catch(() => null);
    this.plans.set(o?.plans ?? []);
    this.waiting.set(o?.waiting ?? []);
  }

  day(t: number): string {
    return new Date(t * 1000).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
}

/** The society pages: every group, as short notices. */
@Component({
  selector: 'gz-societies',
  imports: [RouterLink],
  template: `
    <h1 class="section-head">The Society Pages</h1>
    <p class="standfirst">Clubs, circles and one-off gatherings of the house and its neighbours. <a routerLink="/societies/found">Found a society →</a></p>
    <h2 class="rule">Your memberships</h2>
    <div class="grid3">
      @for (g of mine(); track g.id) { <article class="story"><h3><a [routerLink]="['/societies', g.slug]">{{ g.name }}</a></h3><p class="small">{{ count(g.members, 'member') }}. {{ g.my_status === 'requested' ? 'Your application is under consideration.' : 'You are ' + role(g.my_role) + '.' }}@if (g.requests) { <b> {{ g.requests }} application(s) await you.</b> }</p></article> }
    </div>
    <h2 class="rule">Open to new members</h2>
    <div class="grid3">
      @for (g of others(); track g.id) { <article class="story"><h3><a [routerLink]="['/societies', g.slug]">{{ g.name }}</a></h3><p class="small">{{ g.about }}</p><p class="small"><em>{{ join(g) }}.</em></p></article> }
      @empty { <p class="small">None at present.</p> }
    </div>
  `,
})
export class Societies implements OnInit {
  private readonly api = inject(Api);
  readonly mine = signal<GroupView[]>([]);
  readonly others = signal<GroupView[]>([]);
  readonly count = count;

  async ngOnInit(): Promise<void> {
    const o = await loadOverview(this.api).catch(() => null);
    this.mine.set(o?.mine ?? []);
    this.others.set(o?.others ?? []);
  }

  role(r: string): string {
    const l = (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? 'a member').toLowerCase();
    return l === 'member' ? 'a member' : `an ${l}`;
  }

  join(g: GroupView): string {
    return JOIN_LABEL[g.join];
  }
}

/** One society: its notice, coming events and its roll. */
@Component({
  selector: 'gz-society',
  imports: [RouterLink],
  template: `
    @if (page(); as p) {
      @let g = p.group;
      <p class="kicker">The Society Pages</p>
      <h1 class="section-head">{{ g.name }}</h1>
      <p class="standfirst">{{ g.about || 'The society has not yet published a statement of aims.' }}</p>
      <p><a [routerLink]="['/manage/groups', g.slug]">Members, requests and group tools</a></p><p class="byline">{{ count(g.members, 'member') }} · {{ g.kind }} · {{ join(g) }}</p>
      <div class="actions">
        @if (g.can_manage) { <a [routerLink]="['/groups', g.slug, 'invite']">Invite people</a> }
        @if (g.can_create_events) { <a [routerLink]="['/groups', g.slug, 'bulk']">Bulk add events</a> }
        @if (!g.my_status && g.join !== 'invite') { <button type="button" (click)="act('join')">{{ g.join === 'open' ? 'Become a member' : 'Apply for membership' }}</button> }
        @if (g.my_status === 'requested') { <span>Your application is under consideration.</span><button type="button" class="quiet" (click)="act('leave')">Withdraw it</button> }
        @if (g.my_status === 'active') { <button type="button" class="quiet" (click)="act('leave')">Resign membership</button> }
        @if (g.can_create_events) { <a class="button" routerLink="/press" [queryParams]="{ group: g.slug }">Announce a gathering</a> }
      </div>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <div class="spread">
        <section>
          <h2 class="rule">Forthcoming</h2>
          @for (e of p.events; track e.id) { <p class="entry"><span class="date">{{ e.polling ? 'Date by vote' : when(e.start, e.end) }}</span><a [routerLink]="['/e', e.id]"><b>{{ e.title }}</b></a>@if (e.my_status) { <em> · {{ e.my_status }}</em> }</p> }
          @empty { <p class="small">Nothing announced.</p> }
          @if (p.past.length) {
            <h2 class="rule">Recently</h2>
            @for (e of p.past; track e.id) { <p class="entry small"><span class="date">{{ when(e.start) }}</span>{{ e.title }} ({{ e.status }})</p> }
          }
        </section>
        <aside class="sidebar">
          <h2 class="rule">The roll</h2>
          @for (m of p.members; track m.person) {
            <p class="small"><a class="smallcaps" [routerLink]="['/groups', g.slug, 'members', m.person]">{{ m.display_name }}</a>, {{ m.status === 'requested' ? 'applicant' : role(m.role) }}
              @if (g.can_manage && m.status === 'requested') { <button type="button" class="tiny" (click)="admit(m.person)">admit</button> }</p>
          } @empty { <p class="small">The roll is private.</p> }
        </aside>
      </div>
    } @else if (error()) { <p class="stop">{{ error() }}</p> }
  `,
})
export class Society implements OnInit {
  readonly slug = input.required<string>();
  private readonly api = inject(Api);
  readonly page = signal<GroupPage | null>(null);
  readonly error = signal('');
  readonly when = when;
  readonly count = count;

  async ngOnInit(): Promise<void> {
    try {
      this.page.set(await loadGroup(this.api, this.slug()));
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async act(what: 'join' | 'leave'): Promise<void> {
    try {
      const g = this.page()!.group;
      await (what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
      await this.ngOnInit();
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async admit(person: number): Promise<void> {
    await this.api.send('PUT', `/api/v1/groups/${this.page()!.group.id}/members/${person}`, { status: 'active' }, 'MemberList').catch((e) => this.error.set(problem(e)));
    await this.ngOnInit();
  }

  role(r: string): string {
    return (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).toLowerCase();
  }

  join(g: GroupView): string {
    return JOIN_LABEL[g.join];
  }
}

/** Notifications, set as classified ads. */
@Component({
  selector: 'gz-notices',
  imports: [RouterLink],
  template: `
    <h1 class="section-head">Notices</h1>
    <p class="standfirst">Personal announcements addressed to you. @if (unread()) { <button type="button" class="quiet" (click)="readAll()">Mark all as read</button> }</p>
    <div class="classifieds">
      @for (n of notices(); track n.id) {
        <a class="ad" [class.unread]="!n.read" [routerLink]="n.event ? ['/e', n.event] : ['/societies']">
          <b class="smallcaps">{{ n.kind === 'reminder' ? 'Reminder' : n.kind === 'request' ? 'Application' : n.kind === 'invited' ? 'Invitation' : n.kind === 'cancelled' ? 'Cancellation' : n.kind === 'promoted' ? 'Good news' : 'Notice' }}.</b>
          {{ text(n) }}. <small>{{ rel(n.created) }}{{ n.count > 1 ? ' · ' + n.count + ' times' : '' }}</small></a>
      } @empty { <p>No notices.</p> }
    </div>
  `,
})
export class Notices implements OnInit {
  private readonly api = inject(Api);
  readonly notices = signal<NoticeView[]>([]);
  readonly unread = computed(() => this.notices().some((n) => !n.read));

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

  rel(t: number): string {
    return relative(t);
  }
}

/** Who's Who: the people you can find, alphabetically. */
@Component({
  selector: 'gz-whos-who',
  imports: [RouterLink],
  template: `
    <h1 class="section-head">Who's Who</h1>
    <p class="standfirst">Residents and friends who have consented to be listed. <input type="search" class="blank" placeholder="look someone up" (input)="search($any($event.target).value)" aria-label="Search" /></p>
    <div class="columns directory">
      @for (p of people(); track p.id) {
        <p class="entry"><a class="smallcaps" [routerLink]="['/people', p.id]">{{ p.display_name }}</a>@if (p.household_name) { , of {{ p.household_name }} }. {{ p.bio }}</p>
      } @empty { <p>No one by that name is listed.</p> }
    </div>
  `,
})
export class WhosWho implements OnInit {
  private readonly api = inject(Api);
  readonly people = signal<PersonView[]>([]);

  ngOnInit(): void {
    void this.search('');
  }

  async search(q: string): Promise<void> {
    const list = await loadPeople(this.api, q).catch(() => []);
    this.people.set([...list].sort((a, b) => a.display_name.localeCompare(b.display_name)));
  }
}
