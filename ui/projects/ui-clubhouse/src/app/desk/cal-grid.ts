import { Component, computed, input, output } from '@angular/core';
import { colour, EventSummary, KIND_INFO, TimeOption } from 'party-core';
import { dayStart, hhmm, sameDay, secs } from './cal-state';

const MARK: Record<string, string> = { going: '✓', maybe: '?', no: '✗', waitlist: '⏳' };

/** The month: six weeks of day cells. Click a day for a new event; drag a chip to move it. */
@Component({
  selector: 'cal-month',
  template: `
    <div class="dow" aria-hidden="true">@for (d of weekdays; track d) { <span>{{ d }}</span> }</div>
    <div class="month" role="grid" [attr.aria-label]="title()">
      @for (week of weeks(); track $index) {
        <div class="week" role="row">
          @for (day of week; track day.getTime()) {
            <div class="day" role="gridcell" tabindex="-1"
              [class.out]="day.getMonth() !== anchor().getMonth()" [class.today]="isToday(day)" [class.past]="isPast(day)"
              [class.over]="dragOver === day.getTime()"
              (click)="create.emit(at(day, 19))"
              (dragover)="$event.preventDefault(); dragOver = day.getTime()" (dragleave)="dragOver = 0"
              (drop)="drop($event, day)">
              <span class="num">{{ day.getDate() === 1 ? monthShort(day) + ' ' : '' }}{{ day.getDate() }}</span>
              @for (e of on(day); track e.id) {
                <button type="button" class="chip" draggable="true"
                  [style.--c]="tint(e.group)" [attr.data-s]="e.my_status || 'none'" [class.off]="e.status === 'cancelled'" [class.done]="e.status === 'done'"
                  (click)="$event.stopPropagation(); open.emit(e.id)" (dragstart)="drag($event, e)"
                  [title]="e.title + ' · ' + e.group_name">
                  <span class="mark">{{ mark(e) }}</span><span class="t">{{ time(e.start) }}</span> {{ e.title }}
                </button>
              }
              @for (o of ghosts(day); track o.option.id) {
                <button type="button" class="chip ghost" [style.--c]="tint(o.event.group)" (click)="$event.stopPropagation(); open.emit(o.event.id)"
                  [title]="'A possible time for ' + o.event.title">🗳 {{ time(o.option.start) }} {{ o.event.title }}?</button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class Month {
  readonly anchor = input.required<Date>();
  readonly events = input.required<EventSummary[]>();
  readonly options = input<Map<number, TimeOption[]>>(new Map());
  readonly open = output<number>();
  readonly create = output<number>();
  readonly move = output<{ id: number; to: Date }>();
  readonly weekdays = [1, 2, 3, 4, 5, 6, 0].map((d) => new Date(2026, 1, d + 1).toLocaleDateString(undefined, { weekday: 'short' }));
  dragOver = 0;

  readonly title = computed(() => this.anchor().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
  readonly weeks = computed(() => {
    const first = new Date(this.anchor().getFullYear(), this.anchor().getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const x = new Date(start);
        x.setDate(start.getDate() + w * 7 + d);
        return x;
      }),
    );
  });

  on(day: Date): EventSummary[] {
    return this.events()
      .filter((e) => e.start && sameDay(new Date(e.start * 1000), day))
      .sort((a, b) => a.start - b.start);
  }

  ghosts(day: Date): { event: EventSummary; option: TimeOption }[] {
    const out: { event: EventSummary; option: TimeOption }[] = [];
    for (const e of this.events().filter((x) => x.polling)) {
      for (const o of this.options().get(e.id) ?? []) if (sameDay(new Date(o.start * 1000), day)) out.push({ event: e, option: o });
    }
    return out;
  }

  drag(ev: DragEvent, e: EventSummary): void {
    ev.dataTransfer?.setData('text/plain', String(e.id));
  }

  drop(ev: DragEvent, day: Date): void {
    ev.preventDefault();
    this.dragOver = 0;
    const id = Number(ev.dataTransfer?.getData('text/plain'));
    if (id) this.move.emit({ id, to: day });
  }

  at(day: Date, hour: number): number {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    return secs(d);
  }

  isToday(d: Date): boolean {
    return sameDay(d, new Date());
  }

  isPast(d: Date): boolean {
    return d.getTime() < dayStart(new Date()).getTime();
  }

  monthShort(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short' });
  }

  time(t: number): string {
    return hhmm(t);
  }

  tint(id: number): string {
    return colour(id);
  }

  mark(e: EventSummary): string {
    return MARK[e.my_status] ?? KIND_INFO[e.kind]?.icon ?? '•';
  }
}

/** A week of hour rows; events are blocks sized by their length. Click an hour for a new event. */
@Component({
  selector: 'cal-week',
  template: `
    <div class="wk">
      <div class="hours" aria-hidden="true"><span></span>@for (h of hours; track h) { <span>{{ label(h) }}</span> }</div>
      @for (day of days(); track day.getTime()) {
        <div class="col" [class.today]="isToday(day)">
          <h3>{{ head(day) }}</h3>
          <div class="slots" (dragover)="$event.preventDefault()" (drop)="drop($event, day)">
            @for (h of hours; track h) { <button type="button" class="slot" (click)="create.emit(at(day, h))" [attr.aria-label]="'New event ' + head(day) + ' ' + label(h)"></button> }
            @for (e of on(day); track e.id) {
              <button type="button" class="block" draggable="true" (dragstart)="$any($event).dataTransfer.setData('text/plain', '' + e.id)"
                [style.--c]="tint(e.group)" [style.top.px]="top(e)" [style.height.px]="height(e)" [attr.data-s]="e.my_status || 'none'"
                [class.off]="e.status === 'cancelled'" (click)="open.emit(e.id)">
                <b>{{ e.title }}</b><small>{{ time(e.start) }}{{ e.end ? '–' + time(e.end) : '' }} · {{ e.group_name }}</small>
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class Week {
  readonly anchor = input.required<Date>();
  readonly events = input.required<EventSummary[]>();
  readonly open = output<number>();
  readonly create = output<number>();
  readonly move = output<{ id: number; to: Date }>();
  readonly hours = Array.from({ length: 17 }, (_, i) => i + 7);
  readonly days = computed(() => {
    const start = dayStart(this.anchor());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  });

  on(day: Date): EventSummary[] {
    return this.events().filter((e) => e.start && sameDay(new Date(e.start * 1000), day));
  }

  top(e: EventSummary): number {
    const d = new Date(e.start * 1000);
    return Math.max(0, (d.getHours() + d.getMinutes() / 60 - 7) * 36);
  }

  height(e: EventSummary): number {
    const len = (e.end > e.start ? e.end - e.start : 3 * 3600) / 3600;
    return Math.max(22, len * 36 - 2);
  }

  drop(ev: DragEvent, day: Date): void {
    ev.preventDefault();
    const id = Number(ev.dataTransfer?.getData('text/plain'));
    if (id) this.move.emit({ id, to: day });
  }

  at(day: Date, hour: number): number {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    return secs(d);
  }

  head(d: Date): string {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }

  label(h: number): string {
    return new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  }

  isToday(d: Date): boolean {
    return sameDay(d, new Date());
  }

  time(t: number): string {
    return hhmm(t);
  }

  tint(id: number): string {
    return colour(id);
  }
}

/** The next weeks as a list of days. */
@Component({
  selector: 'cal-agenda',
  template: `
    @for (d of days(); track d.day.getTime()) {
      <section class="agenda-day" [class.today]="isToday(d.day)">
        <h3><span>{{ d.day.getDate() }}</span>{{ head(d.day) }}</h3>
        <ul>
          @for (e of d.events; track e.id) {
            <li><button type="button" [style.--c]="tint(e.group)" [attr.data-s]="e.my_status || 'none'" (click)="open.emit(e.id)">
              <span class="t">{{ time(e.start) }}</span><b>{{ e.title }}</b><small>{{ e.group_name }}</small>
              <span class="st">{{ status(e) }}</span>
            </button></li>
          }
        </ul>
      </section>
    } @empty {
      <p class="empty">Nothing coming up. Click a day in Month view to plan something.</p>
    }
  `,
})
export class Agenda {
  readonly events = input.required<EventSummary[]>();
  readonly open = output<number>();
  readonly days = computed(() => {
    const today = dayStart(new Date()).getTime() / 1000;
    const map = new Map<number, EventSummary[]>();
    for (const e of this.events().filter((x) => x.start >= today).sort((a, b) => a.start - b.start)) {
      const k = dayStart(e.start).getTime();
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()].map(([k, events]) => ({ day: new Date(k), events }));
  });

  head(d: Date): string {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long' });
  }

  isToday(d: Date): boolean {
    return sameDay(d, new Date());
  }

  time(t: number): string {
    return hhmm(t);
  }

  tint(id: number): string {
    return colour(id);
  }

  status(e: EventSummary): string {
    if (e.status === 'cancelled') return 'cancelled';
    return ({ going: '✓ going', maybe: '? maybe', no: '✗ not going', waitlist: '⏳ waitlist' } as Record<string, string>)[e.my_status] ?? 'not answered';
  }
}
