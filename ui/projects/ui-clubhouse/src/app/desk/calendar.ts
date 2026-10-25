import { loadFeatureStyle } from '../feature-styles';
import { Component, computed, effect, HostListener, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { colour, EventView, TimeOption } from 'party-core';
import { Api, problem } from 'party-ng';
import { Theme } from '../theme';
import { Agenda, Month, Week } from './cal-grid';
import { Cal, secs } from './cal-state';

/**
 * The calendar as a feature: a page of the app. Events open their page,
 * a day opens the new-event form at that time, and hosts drag to move.
 * ?v=week|agenda and ?d=2026-11-1 keep the place.
 */
@Component({
  selector: 'ch-calendar',
  imports: [Month, Week, Agenda],
  template: `
    @let L = theme.t();
    <div class="calendar-page">
      <div class="cal-bar">
        <h1 class="section-head left">{{ title() }}</h1>
        <div class="cal-nav">
          <button type="button" (click)="step(-1)" aria-label="Previous">‹</button>
          <button type="button" (click)="go({ d: null })">Today</button>
          <button type="button" (click)="step(1)" aria-label="Next">›</button>
        </div>
        <div class="seg">
          @for (x of views; track x) { <button type="button" [class.on]="view() === x" (click)="go({ v: x === 'month' ? null : x })">{{ x }}</button> }
        </div>
      </div>
      <p class="standfirst left">{{ L.calendarLede }}</p>
      <div class="layers" aria-label="Groups shown">
        @for (g of cal.mine(); track g.id) {
          <label class="layer" [style.--c]="tint(g.id)"><input type="checkbox" [checked]="!cal.hidden().includes(g.id)" (change)="cal.toggle(g.id)" /><span></span>{{ g.name }}</label>
        }
      </div>
      @if (cal.error()) { <p class="stop">{{ cal.error() }}</p> }
      @switch (view()) {
        @case ('week') { <cal-week [anchor]="anchor()" [events]="cal.shown()" (open)="open($event)" (create)="create($event)" (move)="move($event)" /> }
        @case ('agenda') { <cal-agenda [events]="cal.shown()" (open)="open($event)" /> }
        @default { <cal-month [anchor]="anchor()" [events]="cal.shown()" [options]="options()" (open)="open($event)" (create)="create($event)" (move)="move($event)" /> }
      }
      @if (cal.toast()) { <p class="toast" role="status">{{ cal.toast() }}</p> }
    </div>
  `,
})
export class Calendar implements OnInit {
  private readonly featureStyle = loadFeatureStyle('calendar');

  readonly v = input('');
  readonly d = input('');
  readonly theme = inject(Theme);
  readonly cal = inject(Cal);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly views = ['month', 'week', 'agenda'] as const;
  readonly options = signal(new Map<number, TimeOption[]>());
  readonly view = computed(() => (this.v() || 'month') as 'month' | 'week' | 'agenda');
  readonly anchor = computed(() => {
    const [y, m, day] = this.d() ? this.d().split('-').map(Number) : [];
    return this.d() ? new Date(y, m - 1, day || 1) : new Date();
  });
  readonly title = computed(() => {
    const a = this.anchor();
    if (this.view() === 'agenda') return this.theme.t().calendarTitle;
    if (this.view() === 'week') {
      const s = new Date(a);
      s.setDate(a.getDate() - ((a.getDay() + 6) % 7));
      return s.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    }
    return a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });

  constructor() {
    // A poll's candidate times show as ghosts on their days.
    effect(() => {
      const polls = this.cal.shown().filter((e) => e.polling && e.status === 'scheduled');
      void Promise.all(polls.map((e) => this.api.get<EventView>(`/api/v1/events/${e.id}`, 'EventView').catch(() => null))).then((views) => {
        const m = new Map<number, TimeOption[]>();
        for (const v of views) if (v) m.set(v.event.id, v.event.when);
        this.options.set(m);
      });
    });
  }

  ngOnInit(): void {
    void this.cal.load();
  }

  go(params: Record<string, string | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }

  step(n: number): void {
    const a = new Date(this.anchor());
    if (this.view() === 'week') a.setDate(a.getDate() + 7 * n);
    else a.setMonth(a.getMonth() + n, 1);
    this.go({ d: `${a.getFullYear()}-${a.getMonth() + 1}-${a.getDate()}` });
  }

  open(id: number): void {
    void this.router.navigate(['/e', id]);
  }

  create(at: number): void {
    void this.router.navigate(['/new'], { queryParams: { start: at } });
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
      this.cal.say(`Moved “${v.event.title}” to ${target.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}.`);
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
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'ArrowRight') this.step(1);
  }
}
