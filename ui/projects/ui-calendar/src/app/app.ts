import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { colour, EventView, initials, TimeOption } from 'party-core';
import { Api, problem } from 'party-ng';
import { Agenda, Month, Week } from './grid';
import { EditPanel } from './edit-panel';
import { EventPanel } from './event-panel';
import { GroupPanel, Inbox, NewGroup, People, Profile } from './side-panels';
import { SignIn } from './signin';
import { Cal, Nav, secs } from './state';

/**
 * The calendar is the whole app: no menu. Groups are layers in the rail,
 * a day is where you create, an event chip is where you answer, and
 * everything else opens in the drawer on the right.
 */
@Component({
  selector: 'party-root',
  imports: [Month, Week, Agenda, EventPanel, EditPanel, GroupPanel, Inbox, People, Profile, NewGroup, SignIn],
  template: `
    @if (!api.ready()) {
      <p class="splash">Opening the calendar…</p>
    } @else if (!api.status()) {
      <p class="splash error">The board is not responding. Is it on, and are you on the home Wi-Fi?</p>
    } @else if (api.status()!.setup_needed || !api.me()) {
      <cal-signin />
    } @else {
      <header class="top">
        <button type="button" class="menu" (click)="rail.set(!rail())" aria-label="Calendars">☰</button>
        <span class="brand">🗓 party</span>
        <div class="nav">
          <button type="button" (click)="step(-1)" aria-label="Previous">‹</button>
          <button type="button" class="today" (click)="goToday()">Today</button>
          <button type="button" (click)="step(1)" aria-label="Next">›</button>
        </div>
        <h1>{{ title() }}</h1>
        <div class="seg views">
          @for (v of views; track v) { <button type="button" [class.on]="view() === v" (click)="nav.set({ v: v === 'month' ? null : v }, true)">{{ v }}</button> }
        </div>
        <span class="spacer"></span>
        <button type="button" class="icon" (click)="nav.open('p', 'people')" title="People">👥</button>
        <button type="button" class="icon bell" (click)="nav.open('p', 'inbox')" title="Notifications">🔔@if (api.summary()?.unread) { <b>{{ api.summary()!.unread }}</b> }</button>
        <button type="button" class="me" (click)="nav.open('p', 'me')" [style.background]="tint(api.me()!.id + 50)" [title]="api.me()!.display_name">{{ initials(api.me()!.display_name) }}</button>
      </header>
      <div class="frame" [class.rail-open]="rail()">
        <aside class="rail">
          <button type="button" class="create" (click)="nav.open('new', defaultStart())">＋ New event</button>
          <h4>My calendars</h4>
          <ul>
            @for (g of cal.mine(); track g.id) {
              <li><label><input type="checkbox" [checked]="!cal.hidden().includes(g.id)" (change)="cal.toggle(g.id)" [style.accent-color]="tint(g.id)" /><span class="sw" [style.background]="tint(g.id)"></span></label>
                <button type="button" class="link" (click)="nav.open('g', g.slug)">{{ g.name }}</button>
                @if (g.my_status === 'requested') { <small>asked</small> }
                @if (g.requests) { <b class="badge" title="join requests">{{ g.requests }}</b> }</li>
            }
          </ul>
          <button type="button" class="link small" (click)="nav.open('p', 'group')">＋ New group</button>
          @if (cal.others().length) {
            <h4>Discover</h4>
            <ul>
              @for (g of cal.others(); track g.id) {
                <li><span class="sw hollow" [style.border-color]="tint(g.id)"></span><button type="button" class="link" (click)="nav.open('g', g.slug)">{{ g.name }}</button></li>
              }
            </ul>
          }
          @if (polls().length) {
            <h4>Not scheduled yet</h4>
            <ul>
              @for (e of polls(); track e.id) {
                <li><span class="sw" [style.background]="tint(e.group)"></span><button type="button" class="link" (click)="nav.open('e', e.id)">🗳 {{ e.title }}</button></li>
              }
            </ul>
          }
          <h4>Key</h4>
          <p class="key"><span data-s="going">✓ going</span><span data-s="maybe">? maybe</span><span data-s="waitlist">⏳ waitlist</span><span data-s="none">◌ not answered</span></p>
          <p class="hint">Click a day to plan · drag to move · ←/→ months · t today · n new</p>
        </aside>
        <main>
          @if (cal.error()) { <p class="error">{{ cal.error() }}</p> }
          @switch (view()) {
            @case ('week') { <cal-week [anchor]="anchor()" [events]="cal.shown()" (open)="nav.open('e', $event)" (create)="nav.open('new', $event)" (move)="move($event)" /> }
            @case ('agenda') { <cal-agenda [events]="cal.shown()" (open)="nav.open('e', $event)" /> }
            @default { <cal-month [anchor]="anchor()" [events]="cal.shown()" [options]="options()" (open)="nav.open('e', $event)" (create)="nav.open('new', $event)" (move)="move($event)" /> }
          }
        </main>
        @if (drawer()) {
          <div class="scrim" (click)="nav.close()"></div>
          <aside class="drawer" role="dialog" aria-modal="true">
            @switch (drawer()) {
              @case ('e') { <cal-event [id]="+nav.get('e')" /> }
              @case ('new') { <cal-edit [start]="+nav.get('new')" [groupSlug]="nav.get('group')" /> }
              @case ('edit') { <cal-edit [id]="+nav.get('edit')" /> }
              @case ('g') { <cal-group [slug]="nav.get('g')" /> }
              @case ('inbox') { <cal-inbox /> }
              @case ('people') { <cal-people /> }
              @case ('me') { <cal-me /> }
              @case ('group') { <cal-new-group /> }
            }
          </aside>
        }
      </div>
      @if (cal.toast()) { <p class="toast" role="status">{{ cal.toast() }}</p> }
    }
  `,
})
export class App implements OnInit {
  readonly api = inject(Api);
  readonly cal = inject(Cal);
  readonly nav = inject(Nav);
  readonly rail = signal(false);
  readonly views = ['month', 'week', 'agenda'] as const;
  readonly options = signal(new Map<number, TimeOption[]>());
  readonly initials = initials;

  readonly view = computed(() => (this.nav.get('v') || 'month') as 'month' | 'week' | 'agenda');
  readonly anchor = computed(() => {
    const raw = this.nav.get('d');
    const [y, m, d] = raw ? raw.split('-').map(Number) : [];
    return raw ? new Date(y, m - 1, d || 1) : new Date();
  });
  readonly title = computed(() => {
    const a = this.anchor();
    if (this.view() === 'week') {
      const s = new Date(a);
      s.setDate(a.getDate() - ((a.getDay() + 6) % 7));
      return `Week of ${s.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    }
    return this.view() === 'agenda' ? 'Coming up' : a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });
  readonly drawer = computed(() => {
    for (const k of ['e', 'new', 'edit', 'g'] as const) if (this.nav.get(k)) return k;
    return this.nav.get('p') || '';
  });
  readonly polls = computed(() => this.cal.shown().filter((e) => e.polling && e.status === 'scheduled'));

  constructor() {
    // A poll's candidate times show as ghosts on their days.
    effect(() => {
      const polls = this.polls();
      void Promise.all(polls.map((e) => this.api.get<EventView>(`/api/v1/events/${e.id}`, 'EventView').catch(() => null))).then((views) => {
        const m = new Map<number, TimeOption[]>();
        for (const v of views) if (v) m.set(v.event.id, v.event.when);
        this.options.set(m);
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.api.refresh().catch(() => undefined);
    if (this.api.me()) await this.cal.load();
  }

  step(n: number): void {
    const a = new Date(this.anchor());
    if (this.view() === 'week') a.setDate(a.getDate() + 7 * n);
    else a.setMonth(a.getMonth() + n, 1);
    this.nav.set({ d: `${a.getFullYear()}-${a.getMonth() + 1}-${a.getDate()}` }, true);
  }

  goToday(): void {
    this.nav.set({ d: null }, true);
  }

  defaultStart(): number {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0);
    return secs(d);
  }

  /** Dragged to another day: same time of day, same length. */
  async move({ id, to }: { id: number; to: Date }): Promise<void> {
    try {
      const v = await this.api.get<EventView>(`/api/v1/events/${id}`, 'EventView');
      if (!v.can_edit) {
        this.cal.say('Only the hosts can move this event.');
        return;
      }
      const from = new Date(v.event.start * 1000);
      const target = new Date(to);
      target.setHours(from.getHours(), from.getMinutes(), 0, 0);
      const delta = secs(target) - v.event.start;
      if (!delta) return;
      await this.api.send('PATCH', `/api/v1/events/${id}`, { start: v.event.start + delta, end: v.event.end ? v.event.end + delta : 0, rev: v.event.rev }, 'EventView');
      this.cal.say(`Moved “${v.event.title}” to ${target.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}. Everyone answering was told.`);
      await this.cal.load();
    } catch (e) {
      this.cal.say(problem(e));
    }
  }

  tint(id: number): string {
    return colour(id);
  }

  @HostListener('document:keydown', ['$event'])
  key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.ctrlKey || e.metaKey || !this.api.me()) return;
    if (e.key === 'Escape' && this.drawer()) this.nav.close();
    else if (e.key === 'ArrowLeft' && !this.drawer()) this.step(-1);
    else if (e.key === 'ArrowRight' && !this.drawer()) this.step(1);
    else if (e.key === 't') this.goToday();
    else if (e.key === 'n') this.nav.open('new', this.defaultStart());
  }
}
