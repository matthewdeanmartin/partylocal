import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { blankAnswer, guestLimit, KIND_INFO, RsvpInput, STATUS_LABEL, toggle, when } from 'party-core';
import { Api, answerEvent, EventPage, loadEvent, problem, relative } from 'party-ng';

/**
 * An event as an article: headline, particulars box, the guest list in
 * small caps, and a reply slip: one sentence with blanks.
 */
@Component({
  selector: 'gz-article',
  imports: [RouterLink],
  template: `
    @if (page(); as p) {
      @let v = p.view;
      @let e = v.event;
      <article class="feature">
        <p class="kicker">{{ kind(e.kind) }} · <a [routerLink]="['/societies', v.group_slug]">{{ v.group_name }}</a> · Page E{{ e.id }}</p>
        <h1 [class.struck]="e.status === 'cancelled'">{{ e.title }}</h1>
        @if (e.status === 'cancelled') { <p class="stop">CANCELLED. The hosts regret that this gathering will not take place.</p> }
        @if (e.status === 'draft') { <p class="stop">PROOF: not yet published. Only the hosts can read this.</p> }
        <p class="byline">By {{ v.host_names.join(' and ') }} · {{ e.start ? relative(e.start) : 'date by vote' }}</p>
        <div class="spread">
          <div class="columns body">
            <p class="drop">{{ e.about || 'The hosts have not supplied further particulars.' }}</p>
            @if (p.series) { <p><a [routerLink]="['/series', p.series.id]">Series settings and regular attendance</a></p><p><em>This is a regular fixture: {{ p.series.summary.toLowerCase() }}.</em></p> }
            <h2 class="rule">The guest list</h2>
            <p>
              @for (r of attending(); track r.person; let last = $last) { <span class="smallcaps">{{ r.display_name }}</span>@if (r.plus) { (with {{ r.plus }}) }@if (r.status === 'maybe') { <em> (perhaps)</em> }@if (r.status === 'waitlist') { <em> (waiting)</em> }{{ last ? '.' : ', ' }} }
              @if (!attending().length) { No replies yet. }
            </p>
            @if (regrets().length) { <p class="small">Regrets from {{ regrets().join(', ') }}.</p> }
          </div>
          <aside class="particulars">
            <h2>The particulars</h2><p><a [routerLink]="['/manage/events', e.id]">Full attendance, answer for someone, and host ride tools</a></p>
            <dl>
              <dt>When</dt><dd>{{ e.start ? when(e.start, e.end) : 'To be settled by vote' }}</dd>
              <dt>Where</dt><dd>{{ where() }}</dd>
              <dt>Admission</dt><dd>{{ e.cost || 'Free' }}{{ e.capacity ? '; ' + e.capacity + ' places' : '' }}</dd>
              <dt>Expected</dt><dd>{{ v.heads }}{{ v.maybe ? ' (+' + v.maybe + ' undecided)' : '' }}{{ v.waitlist ? '; ' + v.waitlist + ' waiting' : '' }}</dd>
              @if (e.rsvp_by) { <dt>Reply by</dt><dd>{{ when(e.rsvp_by) }}</dd> }
              @if (e.bring.length) { <dt>Wanted</dt><dd>@for (s of e.bring; track s.id; let last = $last) { {{ s.name }} ({{ left(s.id, s.count) }} still){{ last ? '' : '; ' }} }</dd> }
            </dl>
            @if (v.can_edit) { <p><a [routerLink]="['/events', e.id, 'edit']">Hosts and access · full editor</a></p> }
            @if (e.map) { <p><a [href]="e.map" target="_blank" rel="noopener">Open map</a></p> }
            @if (v.can_edit && e.status !== 'cancelled' && e.status !== 'done') {
              <p class="small"><a routerLink="/press" [queryParams]="{ edit: e.id }">Correct this story</a> · <button type="button" class="tiny" (click)="cancel()">spike it (cancel)</button></p>
            }
          </aside>
        </div>

        @if (v.can_edit && e.modules.includes('when') && !e.start) {
          <section class="slip editors">
            <h2>From the editors' desk</h2>
            <p>The readers have voted.
              @for (o of e.when; track o.id) { <button type="button" class="tiny" (click)="lock(o.id)">Fix it for {{ when(o.start, o.end) }} ({{ votes(o.id) }} {{ votes(o.id) === 1 ? 'vote' : 'votes' }})</button> }</p>
          </section>
        }

        @if (v.can_answer) {
          <form class="slip" id="reply" (submit)="send($event)">
            <h2>Reply slip <span class="scissors" aria-hidden="true">✂ - - - - - - - - - - - - - -</span></h2>
            <p class="madlib">
              I, <b>{{ api.me()?.display_name }}</b>,
              <select class="blank" [value]="a().status" (change)="set({ status: $any(val($event)) })" aria-label="Your answer">
                <option value="going">shall attend</option><option value="maybe">may attend</option><option value="no">regret that I cannot attend</option>
              </select>
              <b>{{ e.title }}</b>@if (a().status !== 'no' && limit() > 0) {,
                bringing
                <select class="blank short" [value]="a().plus" (change)="set({ plus: +val($event) })" aria-label="Guests">@for (n of guestsRange(); track n) { <option [value]="n" [selected]="n === a().plus">{{ n === 0 ? 'no' : n }}</option> }</select>
                {{ a().plus === 1 ? 'guest' : 'guests' }}@if (a().plus) {, namely <input class="blank" [value]="a().names" (input)="set({ names: val($event) })" placeholder="their names" aria-label="Guests' names" />,
                  of whom <select class="blank short" [value]="a().kids" (change)="set({ kids: +val($event) })" aria-label="Kids">@for (n of kidsRange(); track n) { <option [value]="n" [selected]="n === a().kids">{{ n === 0 ? 'none' : n }}</option> }</select> {{ a().kids === 1 ? 'is a child' : 'are children' }} }}.
              @if (a().status !== 'no') {
                @if (e.modules.includes('when') && e.when.length) {
                  Of the proposed dates,
                  @for (o of e.when; track o.id; let last = $last) { <label class="inline-check"><input type="checkbox" [checked]="a().when?.includes(o.id)" (change)="set({ when: toggle(a().when ?? [], o.id) })" />{{ when(o.start, o.end) }}</label>{{ last ? '' : ', ' }} }
                  would suit me.
                }
                @if (e.modules.includes('bring') && e.bring.length) {
                  For the table I shall bring
                  <select class="blank" [value]="firstBring()" (change)="bring(+val($event))" aria-label="I'll bring">
                    <option value="0">nothing in particular</option>
                    @for (s of e.bring; track s.id) { <option [value]="s.id" [disabled]="left(s.id, s.count) <= 0 && !a().bring?.includes(s.id)" [selected]="s.id === firstBring()">a {{ s.name.toLowerCase() }}{{ left(s.id, s.count) <= 0 && !a().bring?.includes(s.id) ? ' (covered)' : '' }}</option> }
                  </select>@if (a().bring_other || !firstBring()) { and <input class="blank" [value]="a().bring_other" (input)="set({ bring_other: val($event) })" placeholder="something else" aria-label="Something else" /> }.
                }
                @if (e.modules.includes('shifts') && e.shifts.length) {
                  I volunteer for the
                  <select class="blank" [value]="a().shifts?.[0] ?? 0" (change)="set({ shifts: +val($event) ? [+val($event)] : [] })" aria-label="Shift">
                    <option value="0">(no particular)</option>
                    @for (s of e.shifts; track s.id) { <option [value]="s.id" [selected]="a().shifts?.[0] === s.id">{{ s.name.toLowerCase() }} shift, {{ hm(s.start) }}–{{ hm(s.end) }}</option> }
                  </select> shift.
                }
                @if (e.modules.includes('rides')) {
                  As to getting there, I
                  <select class="blank" [value]="a().ride" (change)="set({ ride: val($event), seats: a().seats || 1 })" aria-label="Rides">
                    <option value="">have not decided</option><option value="need">shall need a lift</option><option value="offer">can offer lifts</option><option value="own">shall make my own way</option>
                  </select>@if (a().ride === 'offer' || a().ride === 'need') {, for <input class="blank short" type="number" min="1" max="8" [value]="a().seats" (input)="set({ seats: +val($event) })" aria-label="Seats" /> {{ a().ride === 'offer' ? 'passengers' : 'of us' }}}.
                }
                @if (e.modules.includes('diet')) {
                  On matters of diet, the hosts should know <input class="blank wide" [value]="a().diet" (input)="set({ diet: val($event) })" [placeholder]="e.diet_prompt ? e.diet_prompt.toLowerCase() : 'nothing in particular'" aria-label="Diet" />.
                }
                @for (q of e.modules.includes('questions') ? e.questions : []; track q.id) {
                  To the question “{{ q.prompt }}” I answer
                  @if (q.kind === 'text') { <input class="blank" [value]="answerTo(q.id)" (input)="answer(q.id, val($event))" [attr.aria-label]="q.prompt" /> }
                  @else { <select class="blank" [value]="answerTo(q.id)" (change)="answer(q.id, val($event))" [attr.aria-label]="q.prompt"><option value="">(no reply)</option>@for (c of q.kind === 'yesno' ? ['yes', 'no'] : q.choices; track c) { <option [value]="c" [selected]="answerTo(q.id) === c">{{ c }}</option> }</select> }.
                }
              }
              <br /><span class="ps">P.S. <input class="blank wide" [value]="a().note" (input)="set({ note: val($event) })" placeholder="a note for everyone (optional)" aria-label="Note" /></span>
            </p>
            <p class="sign">Yours faithfully, <i>{{ api.me()?.display_name }}</i></p>
            @if (error()) { <p class="stop">{{ error() }}</p> }
            @if (saved()) { <p class="received">✓ {{ saved() }}</p> }
            <button type="submit" [disabled]="busy()">{{ v.mine ? 'Send a corrected reply' : 'Post my reply' }}</button>
          </form>
        } @else if (v.mine) {
          <p class="received">Your reply is on file: {{ label(v.mine.status) }}.{{ v.locked ? ' Replies are now closed.' : '' }}</p>
        } @else if (e.status === 'scheduled' && !v.locked) {
          <p class="small">Only members of <a [routerLink]="['/societies', v.group_slug]">{{ v.group_name }}</a> may reply.</p>
        }
      </article>
    } @else if (error()) { <p class="stop">{{ error() }}</p> }
  `,
})
export class Article implements OnInit {
  readonly id = input.required<string>();
  readonly api = inject(Api);
  readonly page = signal<EventPage | null>(null);
  readonly a = signal<RsvpInput>({ status: 'going', rev_seen: 0 });
  readonly error = signal('');
  readonly saved = signal('');
  readonly busy = signal(false);
  readonly limit = computed(() => (this.page() ? guestLimit(this.page()!.view.event) : 0));
  readonly guestsRange = computed(() => Array.from({ length: Math.min(this.limit(), 9) + 1 }, (_, n) => n));
  readonly kidsRange = computed(() => Array.from({ length: (this.a().plus ?? 0) + 1 }, (_, n) => n));
  readonly attending = computed(() => (this.page()?.rsvps ?? []).filter((r) => r.status !== 'no'));
  readonly regrets = computed(() => (this.page()?.rsvps ?? []).filter((r) => r.status === 'no').map((r) => r.display_name));
  readonly firstBring = computed(() => this.a().bring?.[0] ?? 0);
  readonly where = computed(() => {
    const e = this.page()?.view.event;
    if (!e) return '';
    if (e.where_kind === 'tbd') return 'To be announced';
    return [e.place, e.address].filter(Boolean).join(', ') || 'A private residence';
  });
  readonly when = when;
  readonly relative = relative;
  readonly toggle = toggle;

  async ngOnInit(): Promise<void> {
    try {
      const p = await loadEvent(this.api, Number(this.id()));
      this.page.set(p);
      this.a.set(blankAnswer(p.view.event, p.view.mine));
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  set(change: Partial<RsvpInput>): void {
    this.a.update((a) => ({ ...a, ...change }));
    this.saved.set('');
  }

  bring(id: number): void {
    this.set({ bring: id ? [id] : [] });
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
      const v = await answerEvent(this.api, Number(this.id()), this.a());
      const s = v.mine?.status;
      await this.ngOnInit();
      this.saved.set(s === 'waitlist' ? 'Received. The gathering is full; you are on the waiting list.' : `Received with thanks: ${this.label(s ?? '').toLowerCase()}.`);
      void this.api.refreshSummary();
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }

  async lock(option: number): Promise<void> {
    await this.api.send('POST', `/api/v1/events/${this.id()}/lock`, { option }, 'EventView').catch((e) => this.error.set(problem(e)));
    await this.ngOnInit();
  }

  async cancel(): Promise<void> {
    if (!confirm('Spike this story? Everyone who replied will be told it is cancelled.')) return;
    await this.api.send('POST', `/api/v1/events/${this.id()}/cancel`, undefined, 'EventView').catch((e) => this.error.set(problem(e)));
    await this.ngOnInit();
  }

  left(id: number, total: number): number {
    return total - (this.page()?.view.claimed.find((c) => c.id === id)?.count ?? 0);
  }

  votes(id: number): number {
    return this.page()?.view.votes.find((c) => c.id === id)?.count ?? 0;
  }

  hm(t: number): string {
    return new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  kind(k: string): string {
    return KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? 'Gathering';
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s;
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
