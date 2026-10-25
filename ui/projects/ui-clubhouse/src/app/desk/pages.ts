import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { count, EventSummary, EventView, GroupView, JOIN_LABEL, KIND_INFO, NOTICE_TEXT, NoticeView, PersonView, ROLE_LABEL, STATUS_LABEL, when } from 'party-core';
import { Api, GroupPage, joinGroup, leaveGroup, loadGroup, loadNotices, loadOverview, loadPeople, markRead, Overview, problem, relative } from 'party-ng';
import { Theme } from '../theme';

const kindLabel = (k: string) => KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? 'Event';
const statusLabel = (s: string) => STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? '';

/** Home: what's next (the lead), what else is coming, and what needs an answer. */
@Component({
  selector: 'ch-home',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    @if (error()) { <p class="stop">{{ error() }}</p> }
    @if (lead(); as l) {
      <article class="lead">
        <p class="kicker">{{ L.leadKicker }} · {{ kindLabel(l.event.kind) }} · {{ l.group_name }}</p>
        <h1><a [routerLink]="['/e', l.event.id]">{{ l.event.title }}</a></h1>
        <p class="dek">{{ dek(l) }}</p>
        <p class="byline">{{ L.leadBy(l.host_names.join(' & '), l.group_name) }}</p>
        <div class="columns">
          <p class="drop">{{ l.event.about || L.noAbout }}</p>
          <p>{{ L.expected(l.heads, l.event.capacity, l.maybe) }} {{ l.mine ? L.yourReplyOnFile(statusLabel(l.mine.status).toLowerCase()) : L.noReplyYet }}</p>
          <p class="more"><a [routerLink]="['/e', l.event.id]">{{ L.leadMore(l.event.id) }}</a></p>
        </div>
      </article>
    }
    <div class="spread">
      <section class="stories">
        <h2 class="rule">{{ L.alsoHeading }}</h2>
        <div class="grid3">
          @for (e of rest(); track e.id) {
            <article class="story" [class.cancelled]="e.status === 'cancelled'">
              <p class="kicker">{{ e.group_name }}</p>
              <h3><a [routerLink]="['/e', e.id]">{{ e.title }}</a></h3>
              <p class="dek small">{{ e.polling ? L.dateByVote : when(e.start, e.end) }}</p>
              <p class="small">{{ L.attending(e.heads) }}{{ e.capacity ? L.ofPlaces(e.capacity) : '' }}.
                @if (e.my_status) { <em>{{ L.you }}: {{ statusLabel(e.my_status) }}.</em> }</p>
            </article>
          } @empty { <p class="small">{{ L.quietWeek }}</p> }
        </div>
      </section>
      <aside class="sidebar">
        <h2 class="rule">{{ L.awaitingHeading }}</h2>
        @for (e of o()?.waiting ?? []; track e.id) {
          <a class="coupon" [routerLink]="['/e', e.id]" fragment="reply"><span class="scissors" aria-hidden="true">✂</span>
            <b>{{ e.title }}</b><small>{{ e.polling ? L.dateByVote : when(e.start) }} · {{ e.group_name }}</small><span class="cta">{{ L.awaitingCta }}</span></a>
        } @empty { <p class="small">{{ L.allReplied }}</p> }
        <h2 class="rule">{{ L.weekHeading }}</h2>
        <p class="forecast">{{ L.weekLine(thisWeek(), o()?.plans?.length ?? 0) }}</p>
        @if (o()?.others?.length) {
          <h2 class="rule">{{ L.joinHeading }}</h2>
          @for (g of (o()?.others ?? []).slice(0, 4); track g.id) {
            <p class="small"><a [routerLink]="['/groups', g.slug]"><b>{{ g.name }}</b></a>, {{ count(g.members, 'member') }}. {{ g.about }}</p>
          }
        }
      </aside>
    </div>
  `,
})
export class Home implements OnInit {
  readonly theme = inject(Theme);
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
      // The lead: the soonest thing you're in or invited to, else the soonest.
      const pick = [...o.plans, ...o.waiting].filter((e) => e.start).sort((a, b) => a.start - b.start)[0] ?? o.upcoming[0];
      if (pick) this.lead.set(await this.api.get<EventView>(`/api/v1/events/${pick.id}`, 'EventView'));
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  dek(v: EventView): string {
    const e = v.event;
    const L = this.theme.t();
    const at = e.where_kind === 'tbd' ? L.facts.tbd : e.place || L.facts.home;
    return e.start ? `${when(e.start, e.end)} · ${at}` : `${e.modules.includes('when') ? L.dateByVote : 'Time not yet determined'} · ${at}`;
  }
}

/** My plans, by date, and what still needs an answer. */
@Component({
  selector: 'ch-plans',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    <h1 class="section-head">{{ L.plansTitle }}</h1>
    <p class="standfirst">{{ L.plansLede }}</p>
    <div class="columns diary">
      @for (e of plans(); track e.id) {
        <p class="entry"><span class="date">{{ e.polling ? L.dateByVote : day(e.start) }}</span>
          <a [routerLink]="['/e', e.id]"><b>{{ e.title }}</b></a>, {{ e.group_name }}. <em>{{ statusLabel(e.my_status) }}.</em></p>
      } @empty { <p>{{ L.plansEmpty }}</p> }
    </div>
    @if (waiting().length) {
      <h2 class="rule">{{ L.outstanding }}</h2>
      <div class="coupons">
        @for (e of waiting(); track e.id) {
          <a class="coupon" [routerLink]="['/e', e.id]" fragment="reply"><span class="scissors" aria-hidden="true">✂</span><b>{{ e.title }}</b><small>{{ e.polling ? L.dateByVote : when(e.start) }}</small><span class="cta">{{ L.replyCta }}</span></a>
        }
      </div>
    }
  `,
})
export class Plans implements OnInit {
  readonly theme = inject(Theme);
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
    const d = new Date(t * 1000);
    return `${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }
}

/** Every group: yours, then ones you could join. */
@Component({
  selector: 'ch-groups',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    <h1 class="section-head">{{ L.groupsTitle }}</h1>
    <p class="standfirst">{{ L.groupsLede }} <a routerLink="/groups/new">{{ L.startGroup }}</a></p>
    <h2 class="rule">{{ L.yourGroups }}</h2>
    <div class="grid3">
      @for (g of mine(); track g.id) {
        <article class="story"><h3><a [routerLink]="['/groups', g.slug]">{{ g.name }}</a></h3>
          <p class="small">{{ count(g.members, 'member') }}. {{ g.my_status === 'requested' ? L.applying : L.youAre(role(g.my_role)) }}@if (g.requests) { <b> {{ L.requestsWaiting(g.requests) }}</b> }</p></article>
      }
    </div>
    <h2 class="rule">{{ L.openGroups }}</h2>
    <div class="grid3">
      @for (g of others(); track g.id) { <article class="story"><h3><a [routerLink]="['/groups', g.slug]">{{ g.name }}</a></h3><p class="small">{{ g.about }}</p><p class="small"><em>{{ join(g) }}.</em></p></article> }
      @empty { <p class="small">{{ L.noneOpen }}</p> }
    </div>
  `,
})
export class Groups implements OnInit {
  readonly theme = inject(Theme);
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
    return (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? 'member').toLowerCase();
  }

  join(g: GroupView): string {
    return JOIN_LABEL[g.join];
  }
}

/** One group: what it is, what's coming, who's in it. */
@Component({
  selector: 'ch-group',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    @if (page(); as p) {
      @let g = p.group;
      <p class="kicker center">{{ L.groupKicker }}</p>
      <h1 class="section-head">{{ g.name }}</h1>
      <p class="standfirst">{{ g.about || L.noAims }}</p>
      <p class="byline center">{{ count(g.members, 'member') }} · {{ g.kind }} · {{ join(g) }}</p>
      <div class="actions">
        @if (!g.my_status && g.join !== 'invite') { <button type="button" (click)="act('join')">{{ L.join(g.join === 'open') }}</button> }
        @if (g.my_status === 'requested') { <span>{{ L.applying }}</span><button type="button" class="quiet" (click)="act('leave')">{{ L.withdraw }}</button> }
        @if (g.my_status === 'active') { <button type="button" class="quiet" (click)="act('leave')">{{ L.leave }}</button> }
        @if (g.can_create_events) { <a class="button" routerLink="/new" [queryParams]="{ group: g.slug }">{{ L.host }}</a> <a class="button" [routerLink]="['/groups', g.slug, 'bulk']">Bulk add events</a> }
      </div>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <div class="spread">
        <section>
          <h2 class="rule">{{ L.forthcoming }}</h2>
          @for (e of p.events; track e.id) { <p class="entry"><span class="date">{{ e.polling ? L.dateByVote : when(e.start, e.end) }}</span><a [routerLink]="['/e', e.id]"><b>{{ e.title }}</b></a>@if (e.my_status) { <em> · {{ e.my_status }}</em> }</p> }
          @empty { <p class="small">{{ L.nothingPlanned }}</p> }
          @if (p.past.length) {
            <h2 class="rule">{{ L.recently }}</h2>
            @for (e of p.past; track e.id) { <p class="entry small"><span class="date">{{ when(e.start) }}</span>{{ e.title }} ({{ e.status }})</p> }
          }
        </section>
        <aside class="sidebar">
          <h2 class="rule">{{ L.roll }}</h2>
          @for (m of p.members; track m.person) {
            <p class="small"><a class="smallcaps" [routerLink]="['/groups', g.slug, 'members', m.person]">{{ m.display_name }}</a>, {{ m.status === 'requested' ? L.applicant : role(m.role) }}
              @if (g.can_manage && m.status === 'requested') { <button type="button" class="tiny" (click)="admit(m.person)">{{ L.admit }}</button> }</p>
          } @empty { <p class="small">{{ L.rollPrivate }}</p> }
        </aside>
      </div>
      @if (g.can_manage) {
        <p><a class="button" [routerLink]="['/groups', g.slug, 'invite']">{{ L.invite }}</a> <a [routerLink]="['/manage/groups', g.slug]">Group settings and organizer tools</a></p>
      }
      <div>
      </div>
    } @else if (error()) { <p class="stop">{{ error() }}</p> }
  `,
})
export class Group implements OnInit {
  readonly slug = input.required<string>();
  readonly theme = inject(Theme);
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

/** Notifications. */
@Component({
  selector: 'ch-notices',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    <h1 class="section-head">{{ L.noticesTitle }}</h1>
    <p class="standfirst">{{ L.noticesLede }} @if (unread()) { <button type="button" class="quiet" (click)="readAll()">{{ L.markRead }}</button> }</p>
    <div class="classifieds">
      @for (n of notices(); track n.id) {
        <a class="ad" [class.unread]="!n.read" [routerLink]="n.event ? ['/e', n.event] : ['/groups']">
          <b class="smallcaps">{{ L.noticeKind[n.kind] ?? n.kind }}.</b>
          {{ text(n) }}. <small>{{ rel(n.created) }}{{ n.count > 1 ? ' · ×' + n.count : '' }}</small></a>
      } @empty { <p>{{ L.noNotices }}</p> }
    </div>
  `,
})
export class Notices implements OnInit {
  readonly theme = inject(Theme);
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

/** People you can find. */
@Component({
  selector: 'ch-people',
  imports: [RouterLink],
  template: `
    @let L = theme.t();
    <h1 class="section-head">{{ L.peopleTitle }}</h1>
    <p class="standfirst">{{ L.peopleLede }} <input id="people-search" type="search" class="blank" [placeholder]="L.peopleSearch" (input)="search($any($event.target).value)" [attr.aria-label]="L.peopleSearch" /></p>
    <div class="columns directory">
      @for (p of people(); track p.id) {
        <p class="entry"><a class="smallcaps" [routerLink]="['/people', p.id]">{{ p.display_name }}</a>@if (p.household_name) { , {{ L.of }} {{ p.household_name }} }. {{ p.bio }}</p>
      } @empty { <p>{{ L.nobody }}</p> }
    </div>
  `,
})
export class People implements OnInit {
  readonly theme = inject(Theme);
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
