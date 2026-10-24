import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { blankAnswer, colour, guestLimit, headline, KIND_INFO, RsvpInput, STATUS_LABEL, toggle, when } from 'party-core';
import { Api, answerEvent, EventPage, loadEvent, problem } from 'party-ng';
import { Cal, Nav } from './state';

/** The drawer for one event: what, when, who; your answer as a compact form; host tools. */
@Component({
  selector: 'cal-event',
  template: `
    @if (page(); as p) {
      @let v = p.view;
      @let e = v.event;
      <header class="band" [style.--c]="tint(e.group)">
        <button type="button" class="x" (click)="nav.close()" aria-label="Close">✕</button>
        <span class="kind">{{ icon(e.kind) }} {{ kindLabel(e.kind) }}</span>
        <h2>{{ e.title }}</h2>
        <button type="button" class="link on-band" (click)="nav.open('g', v.group_slug)">{{ v.group_name }}</button>
      </header>
      <div class="body">
        @if (e.status === 'cancelled') { <p class="banner">This event was cancelled.</p> }
        @if (e.status === 'draft') { <p class="banner">Draft: only hosts see it.</p> }
        <dl class="facts">
          <dt>🕒</dt><dd>{{ e.start ? when(e.start, e.end) : 'Time to be decided' }}@if (p.series) { <br /><small>{{ p.series.summary }}</small> }</dd>
          <dt>📍</dt><dd>{{ where() }}</dd>
          <dt>👥</dt><dd>{{ headline(v.heads, e.capacity, v.maybe) }}@if (v.waitlist) { · {{ v.waitlist }} on the waitlist }</dd>
          <dt>🙋</dt><dd>Hosted by {{ v.host_names.join(', ') }}</dd>
          @if (e.cost) { <dt>💶</dt><dd>{{ e.cost }}</dd> }
          @if (e.link) { <dt>🔗</dt><dd><a [href]="e.link" target="_blank" rel="noopener">{{ e.link }}</a></dd> }
          @if (e.rsvp_by) { <dt>⏰</dt><dd>Answer by {{ when(e.rsvp_by) }}</dd> }
        </dl>
        @if (e.about) { <p class="about">{{ e.about }}</p> }

        @if (v.can_edit && e.modules.includes('when') && !e.start) {
          <section>
            <h3>Pick the time <small>(you're a host)</small></h3>
            @for (o of e.when; track o.id) {
              <div class="vote-row"><span>{{ when(o.start, o.end) }}</span><meter [value]="votes(o.id)" min="0" [max]="maxVotes()"></meter><b>{{ votes(o.id) }}</b>
                <button type="button" class="small" (click)="lock(o.id)">Lock in</button></div>
            }
          </section>
        }

        @if (v.can_answer) {
          <form class="rsvp" (submit)="send($event)">
            <h3>{{ v.mine ? 'Your answer' : 'Will you come?' }}</h3>
            <div class="big3" role="radiogroup" aria-label="Your answer">
              @for (s of statuses; track s.value) {
                <button type="button" role="radio" [attr.aria-checked]="a().status === s.value" [class]="'s-' + s.value" [class.on]="a().status === s.value" (click)="set({ status: s.value })">{{ s.icon }}<span>{{ s.label }}</span></button>
              }
            </div>
            @if (a().status !== 'no') {
              @if (limit() > 0) {
                <div class="line"><span>Guests</span>
                  <span class="stepper"><button type="button" (click)="set({ plus: Math.max(0, (a().plus ?? 0) - 1) })" aria-label="Fewer guests">−</button><b>{{ a().plus }}</b><button type="button" (click)="set({ plus: Math.min(limit(), (a().plus ?? 0) + 1) })" aria-label="More guests">+</button></span>
                  <small>up to {{ limit() }}</small></div>
                @if (a().plus) {
                  <div class="line"><span>Of them kids</span><span class="stepper"><button type="button" (click)="set({ kids: Math.max(0, (a().kids ?? 0) - 1) })">−</button><b>{{ a().kids }}</b><button type="button" (click)="set({ kids: Math.min(a().plus ?? 0, (a().kids ?? 0) + 1) })">+</button></span></div>
                  <div class="line"><span>Names</span><input [value]="a().names" (input)="set({ names: val($event) })" placeholder="optional" /></div>
                }
              }
              @if (e.modules.includes('when') && e.when.length) {
                <div class="line top"><span>Times that work</span><div class="chips">
                  @for (o of e.when; track o.id) { <button type="button" class="chip" [class.on]="a().when?.includes(o.id)" (click)="set({ when: toggle(a().when ?? [], o.id) })">{{ when(o.start, o.end) }}</button> }
                </div></div>
              }
              @if (e.modules.includes('bring') && e.bring.length) {
                <div class="line top"><span>I'll bring</span><div class="chips">
                  @for (s of e.bring; track s.id) {
                    <button type="button" class="chip" [class.on]="a().bring?.includes(s.id)" [disabled]="full(s.id, s.count) && !a().bring?.includes(s.id)" (click)="set({ bring: toggle(a().bring ?? [], s.id) })">{{ s.name }} <small>{{ claimed(s.id) }}/{{ s.count }}</small></button>
                  }
                </div></div>
                <div class="line"><span>Or</span><input [value]="a().bring_other" (input)="set({ bring_other: val($event) })" placeholder="something else" /></div>
              }
              @if (e.modules.includes('shifts') && e.shifts.length) {
                <div class="line top"><span>Shifts</span><div class="chips">
                  @for (s of e.shifts; track s.id) {
                    <button type="button" class="chip" [class.on]="a().shifts?.includes(s.id)" [disabled]="taken(s.id) >= s.count && !a().shifts?.includes(s.id)" (click)="set({ shifts: toggle(a().shifts ?? [], s.id) })">{{ s.name }} <small>{{ hm(s.start) }}–{{ hm(s.end) }} · {{ taken(s.id) }}/{{ s.count }}</small></button>
                  }
                </div></div>
              }
              @if (e.modules.includes('rides')) {
                <div class="line"><span>Getting there</span>
                  <select [value]="a().ride" (change)="set({ ride: val($event) })"><option value="">—</option><option value="need">I need a lift</option><option value="offer">I can give lifts</option><option value="own">My own way</option></select>
                  @if (a().ride === 'offer' || a().ride === 'need') { <span class="stepper"><button type="button" (click)="set({ seats: Math.max(1, (a().seats ?? 1) - 1) })">−</button><b>{{ a().seats || 1 }}</b><button type="button" (click)="set({ seats: Math.min(8, (a().seats || 1) + 1) })">+</button></span><small>seats</small> }
                </div>
              }
              @if (e.modules.includes('diet')) {
                <div class="line"><span>Diet</span><input [value]="a().diet" (input)="set({ diet: val($event) })" [placeholder]="e.diet_prompt || 'allergies, vegetarian…'" /></div>
              }
              @for (q of e.modules.includes('questions') ? e.questions : []; track q.id) {
                <div class="line"><span>{{ q.prompt }}</span>
                  @if (q.kind === 'text') { <input [value]="answerTo(q.id)" (input)="answer(q.id, val($event))" /> }
                  @else {
                    <select [value]="answerTo(q.id)" (change)="answer(q.id, val($event))"><option value="">—</option>@for (c of q.kind === 'yesno' ? ['yes', 'no'] : q.choices; track c) { <option [value]="c">{{ c }}</option> }</select>
                  }
                </div>
              }
            }
            <div class="line"><span>Note</span><input [value]="a().note" (input)="set({ note: val($event) })" placeholder="everyone sees it" /></div>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <button type="submit" class="primary" [disabled]="busy()">{{ v.mine ? 'Update my answer' : 'Send my answer' }}</button>
          </form>
        } @else if (v.mine) {
          <p class="banner">You: {{ label(v.mine.status) }}{{ v.locked ? ' (answers are closed)' : '' }}</p>
        } @else if (!v.locked && e.status === 'scheduled') {
          <p class="banner">Join <button type="button" class="link" (click)="nav.open('g', v.group_slug)">{{ v.group_name }}</button> to answer.</p>
        }

        <section>
          <h3>Who's coming</h3>
          <ul class="people">
            @for (r of p.rsvps; track r.person) {
              <li [attr.data-s]="r.status"><span class="dot"></span>{{ r.display_name }}@if (r.plus) { <small>+{{ r.plus }}</small> }<em>{{ label(r.status) }}</em></li>
            } @empty { <li class="muted">No answers yet.</li> }
          </ul>
        </section>

        @if (v.can_edit && e.status !== 'cancelled' && e.status !== 'done') {
          <section class="tools">
            <h3>Host tools</h3>
            <button type="button" (click)="nav.open('edit', e.id)">Edit details</button>
            <button type="button" class="danger" (click)="cancel()">Cancel event</button>
            <p class="muted">Tip: drag the event to another day in the calendar to move it.</p>
          </section>
        }
      </div>
    } @else if (error()) {
      <div class="body"><button type="button" class="x" (click)="nav.close()">✕</button><p class="error">{{ error() }}</p></div>
    } @else {
      <div class="body"><p class="muted">Loading…</p></div>
    }
  `,
})
export class EventPanel {
  readonly id = input.required<number>();
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  private readonly cal = inject(Cal);
  readonly page = signal<EventPage | null>(null);
  readonly a = signal<RsvpInput>({ status: 'going', rev_seen: 0 });
  readonly error = signal('');
  readonly busy = signal(false);
  readonly limit = computed(() => (this.page() ? guestLimit(this.page()!.view.event) : 0));
  readonly maxVotes = computed(() => Math.max(1, ...(this.page()?.view.votes.map((v) => v.count) ?? [1])));
  readonly statuses = [
    { value: 'going' as const, label: 'Going', icon: '✓' },
    { value: 'maybe' as const, label: 'Maybe', icon: '?' },
    { value: 'no' as const, label: "Can't", icon: '✗' },
  ];
  readonly when = when;
  readonly headline = headline;
  readonly toggle = toggle;
  readonly Math = Math;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  async load(id: number): Promise<void> {
    this.error.set('');
    try {
      const p = await loadEvent(this.api, id);
      this.page.set(p);
      this.a.set(blankAnswer(p.view.event, p.view.mine));
    } catch (e) {
      this.page.set(null);
      this.error.set(problem(e));
    }
  }

  set(change: Partial<RsvpInput>): void {
    this.a.update((a) => ({ ...a, ...change }));
  }

  answer(question: number, value: string): void {
    this.set({ answers: [...(this.a().answers ?? []).filter((x) => x.question !== question), { question, value }] });
  }

  answerTo(question: number): string {
    return this.a().answers?.find((x) => x.question === question)?.value ?? '';
  }

  async send(ev: Event): Promise<void> {
    ev.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      const v = await answerEvent(this.api, this.id(), this.a());
      this.cal.say(v.mine?.status === 'waitlist' ? "It's full: you're on the waitlist." : `Saved: ${STATUS_LABEL[v.mine?.status ?? 'going']}.`);
      await Promise.all([this.load(this.id()), this.cal.load(), this.api.refreshSummary()]);
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }

  async lock(option: number): Promise<void> {
    try {
      await this.api.send('POST', `/api/v1/events/${this.id()}/lock`, { option }, 'EventView');
      this.cal.say('Time locked in.');
      await Promise.all([this.load(this.id()), this.cal.load()]);
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  async cancel(): Promise<void> {
    if (!confirm('Cancel this event? Everyone who answered is told.')) return;
    try {
      await this.api.send('POST', `/api/v1/events/${this.id()}/cancel`, undefined, 'EventView');
      this.cal.say('Event cancelled.');
      await Promise.all([this.load(this.id()), this.cal.load()]);
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  where(): string {
    const e = this.page()!.view.event;
    if (e.where_kind === 'tbd') return 'Place to be decided';
    return [e.place, e.address].filter(Boolean).join(', ') || "Someone's home";
  }

  claimed(id: number): number {
    return this.page()?.view.claimed.find((c) => c.id === id)?.count ?? 0;
  }

  full(id: number, count: number): boolean {
    return this.claimed(id) >= count;
  }

  taken(id: number): number {
    return this.page()?.view.taken.find((c) => c.id === id)?.count ?? 0;
  }

  votes(id: number): number {
    return this.page()?.view.votes.find((c) => c.id === id)?.count ?? 0;
  }

  hm(t: number): string {
    return t ? new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  tint(id: number): string {
    return colour(id);
  }

  icon(k: string): string {
    return KIND_INFO[k as keyof typeof KIND_INFO]?.icon ?? '📅';
  }

  kindLabel(k: string): string {
    return KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? k;
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s;
  }
}
