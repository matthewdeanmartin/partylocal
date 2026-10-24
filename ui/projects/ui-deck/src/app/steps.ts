import { Component, computed, inject, input, output, signal } from '@angular/core';
import { blankAnswer, EventView, guestLimit, RsvpInput, toggle, when } from 'party-core';
import { Api, answerEvent, problem } from 'party-ng';

type Step = 'guests' | 'when' | 'bring' | 'shifts' | 'rides' | 'diet' | `q${number}` | 'note';

/** The steps an answer needs, from the event's modules (none for a plain "no"). */
export function stepsFor(v: EventView, status: RsvpInput['status']): Step[] {
  const e = v.event;
  if (status === 'no') return [];
  const out: Step[] = [];
  if (guestLimit(e) > 0) out.push('guests');
  if (e.modules.includes('when') && e.when.length) out.push('when');
  if (e.modules.includes('bring') && e.bring.length) out.push('bring');
  if (e.modules.includes('shifts') && e.shifts.length) out.push('shifts');
  if (e.modules.includes('rides')) out.push('rides');
  if (e.modules.includes('diet')) out.push('diet');
  if (e.modules.includes('questions')) e.questions.forEach((q) => out.push(`q${q.id}`));
  return out;
}

/**
 * Answering, one question per screen: big targets, a progress bar, Next.
 * Opens over whatever is showing; emits the event as it stands after.
 */
@Component({
  selector: 'deck-steps',
  template: `
    <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="view().event.title">
      <header>
        <button type="button" class="ghost" (click)="cancel.emit()">Cancel</button>
        <div class="progress" aria-hidden="true">@for (s of steps(); track s) { <i [class.on]="$index <= i()"></i> }</div>
        <span class="count">{{ i() + 1 }}/{{ steps().length }}</span>
      </header>
      <p class="for">{{ view().event.title }} · {{ status() === 'going' ? 'Going' : 'Maybe' }}</p>
      @let e = view().event;
      @let a = draft();
      <div class="step">
        @switch (step()) {
          @case ('guests') {
            <h2>Bringing anyone?</h2>
            <div class="big-stepper">
              <button type="button" (click)="set({ plus: Math.max(0, (a.plus ?? 0) - 1), kids: Math.min(a.kids ?? 0, Math.max(0, (a.plus ?? 0) - 1)) })" aria-label="Fewer">−</button>
              <output>{{ a.plus }}</output>
              <button type="button" (click)="set({ plus: Math.min(limit(), (a.plus ?? 0) + 1) })" aria-label="More">+</button>
            </div>
            <p class="hint">Up to {{ limit() }} {{ limit() === 1 ? 'guest' : 'guests' }}.</p>
            @if (a.plus) {
              <input class="big" placeholder="Their names (optional)" [value]="a.names" (input)="set({ names: val($event) })" />
              <div class="tiles row">
                @for (k of kidsOptions(); track k) { <button type="button" [class.on]="a.kids === k" (click)="set({ kids: k })">{{ k ? k + (k === 1 ? ' kid' : ' kids') : 'No kids' }}</button> }
              </div>
            }
          }
          @case ('when') {
            <h2>Which times work?</h2>
            <div class="tiles">
              @for (o of e.when; track o.id) { <button type="button" [class.on]="a.when?.includes(o.id)" (click)="set({ when: toggle(a.when ?? [], o.id) })"><b>{{ day(o.start) }}</b><small>{{ time(o.start) }}–{{ time(o.end) }} · {{ count(view().votes, o.id) }} said yes</small></button> }
            </div>
          }
          @case ('bring') {
            <h2>Can you bring something?</h2>
            <div class="tiles">
              @for (s of e.bring; track s.id) {
                <button type="button" [class.on]="a.bring?.includes(s.id)" [disabled]="count(view().claimed, s.id) >= s.count && !a.bring?.includes(s.id)" (click)="set({ bring: toggle(a.bring ?? [], s.id) })">
                  <b>{{ s.name }}</b><small>{{ s.count - count(view().claimed, s.id) }} of {{ s.count }} still needed</small></button>
              }
            </div>
            <input class="big" placeholder="Something else?" [value]="a.bring_other" (input)="set({ bring_other: val($event) })" />
          }
          @case ('shifts') {
            <h2>Pick a shift</h2>
            <div class="tiles">
              @for (s of e.shifts; track s.id) {
                <button type="button" [class.on]="a.shifts?.includes(s.id)" [disabled]="count(view().taken, s.id) >= s.count && !a.shifts?.includes(s.id)" (click)="set({ shifts: toggle(a.shifts ?? [], s.id) })">
                  <b>{{ s.name }}</b><small>{{ time(s.start) }}–{{ time(s.end) }} · {{ count(view().taken, s.id) }}/{{ s.count }}</small></button>
              }
            </div>
          }
          @case ('rides') {
            <h2>Getting there?</h2>
            <div class="tiles">
              @for (r of rides; track r.v) { <button type="button" [class.on]="a.ride === r.v" (click)="set({ ride: r.v, seats: r.v === 'offer' || r.v === 'need' ? a.seats || 1 : 0 })"><b>{{ r.icon }} {{ r.l }}</b></button> }
            </div>
            @if (a.ride === 'offer' || a.ride === 'need') {
              <div class="big-stepper small">
                <button type="button" (click)="set({ seats: Math.max(1, (a.seats ?? 1) - 1) })">−</button><output>{{ a.seats }}</output><button type="button" (click)="set({ seats: Math.min(8, (a.seats ?? 1) + 1) })">+</button>
              </div>
              <p class="hint">{{ a.ride === 'offer' ? 'spare seats' : 'seats needed' }}</p>
            }
            @if (e.rides_note) { <p class="hint">{{ e.rides_note }}</p> }
          }
          @case ('diet') {
            <h2>{{ e.diet_prompt || 'Anything the hosts should know about food?' }}</h2>
            <div class="tiles row">@for (d of diets; track d) { <button type="button" [class.on]="a.diet === d" (click)="set({ diet: a.diet === d ? '' : d })">{{ d }}</button> }</div>
            <input class="big" placeholder="Or type it" [value]="a.diet" (input)="set({ diet: val($event) })" />
          }
          @case ('note') {
            <h2>A note for everyone?</h2>
            <input class="big" placeholder="optional" [value]="a.note" (input)="set({ note: val($event) })" />
          }
          @default {
            @if (question(); as q) {
              <h2>{{ q.prompt }}</h2>
              @if (q.kind === 'text') {
                <input class="big" [value]="answerTo(q.id)" (input)="answer(q.id, val($event))" />
              } @else {
                <div class="tiles">@for (c of q.kind === 'yesno' ? ['yes', 'no'] : q.choices; track c) { <button type="button" [class.on]="answerTo(q.id) === c" (click)="answer(q.id, c); next()"><b>{{ c }}</b></button> }</div>
              }
            }
          }
        }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <footer>
        @if (i() > 0) { <button type="button" class="ghost" (click)="i.set(i() - 1)">Back</button> }
        <button type="button" class="go" [disabled]="busy()" (click)="next()">{{ last() ? 'Send' : 'Next' }}</button>
      </footer>
    </div>
  `,
})
export class Steps {
  readonly view = input.required<EventView>();
  readonly status = input.required<RsvpInput['status']>();
  readonly done = output<EventView>();
  readonly cancel = output<void>();
  private readonly api = inject(Api);
  readonly i = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly edits = signal<Partial<RsvpInput>>({});
  readonly draft = computed<RsvpInput>(() => ({ ...blankAnswer(this.view().event, this.view().mine), status: this.status(), ...this.edits() }));
  readonly steps = computed(() => [...stepsFor(this.view(), this.status()), 'note' as Step]);
  readonly step = computed(() => this.steps()[this.i()]);
  readonly last = computed(() => this.i() === this.steps().length - 1);
  readonly limit = computed(() => guestLimit(this.view().event));
  readonly kidsOptions = computed(() => Array.from({ length: (this.draft().plus ?? 0) + 1 }, (_, n) => n));
  readonly question = computed(() => {
    const s = this.step();
    return s.startsWith('q') ? this.view().event.questions.find((q) => `q${q.id}` === s) : undefined;
  });
  readonly rides = [
    { v: 'need' as const, l: 'I need a lift', icon: '🙋' }, { v: 'offer' as const, l: 'I can drive people', icon: '🚗' }, { v: 'own' as const, l: 'Making my own way', icon: '🚶' },
  ];
  readonly diets = ['Vegetarian', 'Vegan', 'Gluten-free', 'Nut allergy', 'No pork'];
  readonly toggle = toggle;
  readonly Math = Math;

  set(change: Partial<RsvpInput>): void {
    this.edits.update((x) => ({ ...x, ...change }));
  }

  answer(question: number, value: string): void {
    this.set({ answers: [...(this.draft().answers ?? []).filter((a) => a.question !== question), { question, value }] });
  }

  answerTo(question: number): string {
    return this.draft().answers?.find((a) => a.question === question)?.value ?? '';
  }

  async next(): Promise<void> {
    if (!this.last()) {
      this.i.update((i) => i + 1);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      this.done.emit(await answerEvent(this.api, this.view().event.id, this.draft()));
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }

  count(list: { id: number; count: number }[], id: number): number {
    return list.find((c) => c.id === id)?.count ?? 0;
  }

  day(t: number): string {
    return new Date(t * 1000).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  time(t: number): string {
    return t ? new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected readonly when = when;
}
