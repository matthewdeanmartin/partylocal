import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  blankAnswer, EventView, guestLimit, headline, KIND_INFO, RideBoard, RsvpInput, RsvpView, SeriesView, STATUS_LABEL,
  toggle, when,
} from 'party-core';
import { Api, ApiError, problem } from '../api';
import { InvitePanel } from '../invite-panel';
import { value } from './auth';

/** One event: what, when, where, my answer, who's coming, host tools. */
@Component({
  selector: 'party-event',
  imports: [RouterLink, InvitePanel],
  template: `
    @if (error()) { <p class="error card" role="alert">{{ error() }}</p> }
    @if (view(); as v) {
      <section class="card">
        <div class="bar">
          <h1>{{ icon() }} {{ v.event.title }}</h1>
          @if (v.can_edit && active()) {
            <div class="actions">
              <a class="button secondary" [routerLink]="['/events', v.event.id, 'edit']">Edit</a>
              @if (v.event.series) {
                <a class="button secondary" [routerLink]="['/events', v.event.id, 'edit']" [queryParams]="{ scope: 'following' }">Edit this and later</a>
              }
            </div>
          }
        </div>
        <p><a [routerLink]="['/groups', v.group_slug]">{{ v.group_name }}</a> · hosted by {{ v.host_names.join(', ') }}</p>
        @if (v.event.status !== 'scheduled') { <p class="status">{{ v.event.status }}</p> }
        <dl class="facts">
          <dt>When</dt><dd>{{ v.event.start ? when(v.event.start, v.event.end) : 'Being decided (see below)' }}</dd>
          @if (where()) { <dt>Where</dt><dd>{{ where() }}
            @if (v.event.map) { · <a [href]="v.event.map" target="_blank" rel="noopener">map</a> }</dd> }
          <dt>Coming</dt><dd>{{ headline(v.heads, v.event.capacity, v.maybe) }}@if (v.waitlist) { · {{ v.waitlist }} waiting }</dd>
          @if (v.event.rsvp_by) { <dt>Answer by</dt><dd>{{ when(v.event.rsvp_by) }}</dd> }
          @if (v.event.cost) { <dt>Cost</dt><dd>{{ v.event.cost }}</dd> }
          @if (v.event.link) { <dt>Online</dt><dd><a [href]="v.event.link" target="_blank" rel="noopener">{{ v.event.link }}</a></dd> }
        </dl>
        @if (v.event.about) { <p class="notes">{{ v.event.about }}</p> }
        @if (!v.event.when.length || v.event.start) {
          <p class="aside"><a [href]="'/api/v1/events/' + v.event.id + '.ics'">Add to my calendar</a></p>
        }
        @if (series(); as s) {
          <p><a [routerLink]="['/series', s.id]">Series settings and regular attendance</a></p>
          <p class="aside">{{ s.summary }} ·
            <label class="switch inline"><input type="checkbox" [checked]="s.regular" (change)="regular(!s.regular)" /> I'm a regular (going to every one)</label></p>
        }
      </section>

      @if (v.can_answer || v.answer_for.length) {
        <section class="card">
          <h2>{{ who() === me() ? 'Your answer' : 'Answer for ' + whoName() }}</h2>
          @if (v.answer_for.length) {
            <label>Answering for
              <select [value]="who()" (change)="pickWho(+v2($event))">
                <option [value]="me()">Myself</option>
                @for (p of v.answer_for; track p.id) { <option [value]="p.id">{{ p.display_name }}</option> }
              </select></label>
          }
          @if (theirs(); as r) {
            <p class="aside">Now: {{ statusLabel[r.status] }}@if (r.by_name) {, answered by {{ r.by_name }}}@if (r.over_policy) { <span class="error"> · more guests than now allowed</span>}</p>
          }
          @if (!privateAnswer()) { <p>Private diet and question answers are kept unchanged when answering for a household member.</p> }
          <form (submit)="send($event)">
            <div class="segmented">
              @for (s of choices; track s) {
                <button type="button" [class.on]="form().status === s" (click)="patch({ status: s })">{{ statusLabel[s] }}</button>
              }
            </div>
            @if (form().status !== 'no') {
              @if (limit() > 0) {
                <div class="row">
                  <label>Guests <small>up to {{ limit() }}</small>
                    <input type="number" min="0" [max]="limit()" [value]="form().plus" (input)="patch({ plus: +v2($event) })" /></label>
                  <label>Of them, kids <input type="number" min="0" [max]="form().plus ?? 0" [value]="form().kids" (input)="patch({ kids: +v2($event) })" /></label>
                </div>
                @if (form().plus) { <label>Their names <small>optional</small> <input maxlength="200" [value]="form().names" (input)="patch({ names: v2($event) })" /></label> }
              }
              @if (has('when')) {
                <fieldset>
                  <legend>Which times work for you?</legend>
                  @for (o of v.event.when; track o.id) {
                    <label class="check"><input type="checkbox" [checked]="form().when?.includes(o.id)" (change)="patch({ when: toggle(form().when ?? [], o.id) })" />
                      {{ when(o.start, o.end) }} <small>{{ count(v.votes, o.id) }} yes</small></label>
                  }
                </fieldset>
              }
              @if (has('bring') && v.event.bring.length) {
                <fieldset>
                  <legend>I'll bring</legend>
                  @for (s of v.event.bring; track s.id) {
                    <label class="check"><input type="checkbox" [checked]="form().bring?.includes(s.id)" [disabled]="full(v.claimed, s.id, s.count) && !form().bring?.includes(s.id)"
                      (change)="patch({ bring: toggle(form().bring ?? [], s.id) })" />
                      {{ s.name }} <small>{{ count(v.claimed, s.id) }}/{{ s.count }}</small></label>
                  }
                  <label>Something else <input maxlength="100" [value]="form().bring_other" (input)="patch({ bring_other: v2($event) })" /></label>
                </fieldset>
              }
              @if (has('shifts') && v.event.shifts.length) {
                <fieldset>
                  <legend>I'll help with</legend>
                  @for (s of v.event.shifts; track s.id) {
                    <label class="check"><input type="checkbox" [checked]="form().shifts?.includes(s.id)" [disabled]="full(v.taken, s.id, s.count) && !form().shifts?.includes(s.id)"
                      (change)="patch({ shifts: toggle(form().shifts ?? [], s.id) })" />
                      {{ s.name }} <small>{{ when(s.start, s.end) }} · {{ count(v.taken, s.id) }}/{{ s.count }}</small></label>
                  }
                </fieldset>
              }
              @if (has('rides')) {
                <fieldset>
                  <legend>Getting there @if (v.event.rides_note) { <small>{{ v.event.rides_note }}</small> }</legend>
                  <select [value]="form().ride" (change)="patch({ ride: v2($event) })" aria-label="Ride">
                    <option value="">No answer</option>
                    <option value="own">I'll get there myself</option>
                    <option value="need">I need a ride</option>
                    <option value="offer">I can drive others</option>
                  </select>
                  @if (form().ride === 'need' || form().ride === 'offer') {
                    <label>{{ form().ride === 'need' ? 'Seats needed' : 'Seats free' }} <input type="number" min="1" max="8" [value]="form().seats || 1" (input)="patch({ seats: +v2($event) })" /></label>
                  }
                </fieldset>
              }
              @if (has('diet') && privateAnswer()) {
                <label>{{ v.event.diet_prompt || 'Allergies or diet?' }} <small>only hosts see this</small>
                  <input maxlength="200" [value]="form().diet" (input)="patch({ diet: v2($event) })" /></label>
              }
              @if (has('questions') && privateAnswer()) {
                @for (q of v.event.questions; track q.id) {
                  <label>{{ q.prompt }}
                    @if (q.kind === 'text') {
                      <input maxlength="200" [value]="answerOf(q.id)" (input)="setAnswer(q.id, v2($event))" />
                    } @else {
                      <select [value]="answerOf(q.id)" (change)="setAnswer(q.id, v2($event))">
                        <option value=""></option>
                        @for (c of q.kind === 'yesno' ? ['yes', 'no'] : q.choices; track c) { <option [value]="c">{{ c }}</option> }
                      </select>
                    }</label>
                }
              }
            }
            <label>Note <small>everyone sees it</small> <input maxlength="200" [value]="form().note" (input)="patch({ note: v2($event) })" /></label>
            @if (saved()) { <p class="ok" role="status">{{ saved() }}</p> }
            @if (formError()) { <p class="error" role="alert">{{ formError() }}</p> }
            <button type="submit" [disabled]="busy() || !answersReady()">Save answer</button>
          </form>
        </section>
      } @else if (v.locked && v.mine) {
        <section class="card"><p>Your answer: <strong>{{ statusLabel[v.mine.status] }}</strong>. Answers are closed.</p></section>
      }

      @if (rsvps().length) {
        <section class="card">
          <h2>Who's coming</h2>
          <ul class="accounts">
            @for (r of rsvps(); track r.person) {
              <li [class.disabled]="r.status === 'no'">
                <div><a [routerLink]="['/groups', v.group_slug, 'members', r.person]"><strong>{{ r.display_name }}</strong></a>@if (r.plus) { <small>+{{ r.plus }}{{ r.kids ? ' (' + r.kids + ' kids)' : '' }}</small> }
                  <small>{{ statusLabel[r.status] }}</small>
                  @if (r.by_name) { <small>by {{ r.by_name }}</small> }
                  @if (r.over_policy) { <small class="error">over the guest limit</small> }</div>
                @if (r.note) { <span class="aside">{{ r.note }}</span> }
                @if (r.bring.length || r.bring_other) { <span class="aside">Bringing {{ bringing(r) }}</span> }
                @if (r.names) { <span class="aside">Guests: {{ r.names }}</span> }
                @if (v.can_edit || r.person === me()) {
                  @for (a of r.answers; track a.question) { <span class="aside">{{ questionLabel(a.question) }}: {{ a.value }}</span> }
                }
                @if (r.shifts.length) { <span class="aside">Shifts: {{ shiftNames(r.shifts) }}</span> }
                @if (r.when.length) { <span class="aside">Time votes: {{ timeNames(r.when) }}</span> }
                @if (v.can_edit && r.ride) { <span class="aside">Ride: {{ r.ride }} @if (r.seats) { ({{ r.seats }} seats) }</span> }
                @if (v.can_edit && r.diet) { <span class="aside">Diet: {{ r.diet }}</span> }
              </li>
            }
          </ul>
        </section>
      }

      @if (v.can_edit && active()) {
        <party-invite-panel kind="event" [target]="v.event.id" />
        <section class="card">
          <h2>Host tools</h2>
          @if (v.event.when.length && !v.event.start) {
            <p>Pick the time:</p>
            <div class="actions">
              @for (o of v.event.when; track o.id) {
                <button type="button" class="secondary" (click)="lock(o.id)">{{ when(o.start, o.end) }} ({{ count(v.votes, o.id) }})</button>
              }
            </div>
          }
          @if (rideError()) { <p class="error" role="alert">{{ rideError() }}</p> }
          @if (rides(); as b) {
            <h3>Rides</h3>
            <p class="aside">{{ b.offers.length }} driving, {{ b.needs.length }} need a ride; {{ b.spare >= 0 ? b.spare + ' seats spare' : -b.spare + ' seats short' }}.</p>
            <ul class="people">
              @for (n of b.needs; track n.person) { <li>🙋 {{ n.display_name }} needs {{ n.seats }}</li> }
              @for (o of b.offers; track o.person) { <li>🚗 {{ o.display_name }} has {{ o.seats }}</li> }
            </ul>
          }
          <div class="actions">
            <button type="button" class="secondary" (click)="cancel()">Cancel event</button>
            @if (v.event.series && series()?.can_edit) {
              <a class="button secondary" [routerLink]="['/series', v.event.series]">Stop repeating / series settings</a>
            }
          </div>
        </section>
      }
      @if (v.can_edit) {
        <section class="card"><h2>Delete event</h2>
          <p>Permanently removes this occurrence and its answers. To tell guests it is off and keep attendance history, cancel it instead.</p>
          <button type="button" class="secondary" [disabled]="busy()" (click)="deleteEvent()">Delete event permanently</button>
        </section>
      }
    }
  `,
})
export class EventPage implements OnInit {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = input<string>('');
  readonly view = signal<EventView | null>(null);
  readonly rsvps = signal<RsvpView[]>([]);
  readonly rides = signal<RideBoard | null>(null);
  readonly rideError = signal('');
  readonly series = signal<SeriesView | null>(null);
  readonly form = signal<RsvpInput>({ status: 'going', rev_seen: 0 });
  readonly who = signal(0);
  readonly error = signal('');
  readonly formError = signal('');
  readonly saved = signal('');
  readonly busy = signal(false);
  readonly answersReady = signal(false);
  readonly privateAnswer = computed(() => !!this.view()?.can_edit || this.who() === this.me());
  questionLabel(id: number): string { return this.view()?.event.questions.find(q => q.id === id)?.prompt ?? `Question #${id}`; }
  shiftNames(ids: number[]): string { return ids.map(id => this.view()?.event.shifts.find(s => s.id === id)?.name ?? `Shift #${id}`).join(', '); }
  timeNames(ids: number[]): string { return ids.map(id => { const o = this.view()?.event.when.find(o => o.id === id); return o ? when(o.start, o.end) : `Time #${id}`; }).join('; '); }

  readonly me = computed(() => this.api.me()?.id ?? 0);
  readonly theirs = computed(() => {
    const v = this.view();
    if (!v) return null;
    return this.who() === this.me() ? v.mine ?? null : this.rsvps().find((r) => r.person === this.who()) ?? null;
  });
  readonly whoName = computed(() => this.view()?.answer_for.find((p) => p.id === this.who())?.display_name ?? '');
  readonly limit = computed(() => (this.view() ? guestLimit(this.view()!.event) : 0));
  readonly active = computed(() => ['draft', 'scheduled'].includes(this.view()?.event.status ?? ''));
  readonly where = computed(() => {
    const e = this.view()?.event;
    if (!e) return '';
    const parts = e.where_kind === 'home' ? ['at a household home', e.address] : [e.place, e.address];
    return parts.filter(Boolean).join(', ');
  });
  readonly statusLabel = STATUS_LABEL;
  readonly choices = ['going', 'maybe', 'no'] as const;
  readonly headline = headline;
  readonly when = when;
  readonly toggle = toggle;
  readonly v2 = value;

  icon(): string {
    const k = this.view()?.event.kind;
    return k ? KIND_INFO[k].icon : '';
  }

  has(m: string): boolean {
    return this.view()?.event.modules.includes(m as never) ?? false;
  }

  count(list: { id: number; count: number }[], id: number): number {
    return list.find((c) => c.id === id)?.count ?? 0;
  }

  full(list: { id: number; count: number }[], id: number, max: number): boolean {
    return this.count(list, id) >= max;
  }

  bringing(r: RsvpView): string {
    const names = r.bring.map((id) => this.view()?.event.bring.find((s) => s.id === id)?.name).filter(Boolean);
    if (r.bring_other) names.push(r.bring_other);
    return names.join(', ');
  }

  answerOf(q: number): string {
    return this.form().answers?.find((a) => a.question === q)?.value ?? '';
  }

  setAnswer(q: number, value: string): void {
    const rest = (this.form().answers ?? []).filter((a) => a.question !== q);
    this.patch({ answers: value ? [...rest, { question: q, value }] : rest });
  }

  patch(change: Partial<RsvpInput>): void {
    this.form.update((f) => ({ ...f, ...change }));
    this.saved.set('');
  }

  pickWho(id: number): void {
    if (id !== this.me() && !this.view()?.answer_for.some(p => p.id === id)) return;
    this.who.set(id);
    this.resetForm();
  }

  private resetForm(): void {
    const v = this.view();
    if (v) this.form.set(blankAnswer(v.event, this.theirs()));
  }

  async ngOnInit(): Promise<void> {
    this.who.set(this.me());
    await this.load();
  }

  private async load(): Promise<void> {
    this.answersReady.set(false); this.error.set(''); this.rideError.set(''); this.rides.set(null);
    try {
      const v = await this.api.get<EventView>(`/api/v1/events/${this.id()}`, 'EventView');
      this.view.set(v);
      const list = await this.api.get<{ rsvps: RsvpView[] }>(`/api/v1/events/${this.id()}/rsvps`, 'RsvpList');
      this.rsvps.set(list.rsvps);
      this.answersReady.set(true);
      this.rides.set(v.can_edit && v.event.modules.includes('rides')
        ? await this.api.get<RideBoard>(`/api/v1/events/${this.id()}/rides`, 'RideBoard').catch(e => { this.rideError.set('Could not load ride coordination: ' + problem(e)); return null; })
        : null);
      this.series.set(v.event.series
        ? await this.api.get<SeriesView>(`/api/v1/series/${v.event.series}`, 'SeriesView').catch(() => null)
        : null);
      this.resetForm();
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  submission(): RsvpInput {
    const body = { ...this.form() };
    if (!this.privateAnswer()) { delete body.diet; delete body.answers; }
    return body;
  }

  async send(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.answersReady()) return;
    const v = this.view();
    if (!v || (this.who() === this.me() ? !v.can_answer && !v.answer_for.some(p => p.id === this.me()) : !v.answer_for.some(p => p.id === this.who()))) { this.formError.set('You cannot answer for this person.'); return; }
    this.busy.set(true);
    this.formError.set('');
    const who = this.who() === this.me() ? 'me' : String(this.who());
    try {
      const v = await this.api.send<EventView>('PUT', `/api/v1/events/${this.id()}/rsvps/${who}`, this.submission(), 'EventView');
      this.view.set(v);
      const status = (who === 'me' ? v.mine?.status : undefined) ?? this.form().status;
      this.saved.set(status === 'waitlist' ? "It's full: you're on the waitlist, and we'll tell you if a place opens." : 'Saved.');
      await this.load();
      void this.api.refreshSummary();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'stale') {
        await this.load();
        this.formError.set('The event changed while you were answering. Here it is again; check and send.');
      } else {
        this.formError.set(problem(e));
      }
    } finally {
      this.busy.set(false);
    }
  }

  private async act(run: () => Promise<unknown>): Promise<void> {
    this.error.set('');
    try {
      await run();
      await this.load();
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  lock(option: number): Promise<void> {
    return this.act(() => this.api.send('POST', `/api/v1/events/${this.id()}/lock`, { option }, 'EventView'));
  }

  cancel(): Promise<void> {
    if (!confirm('Cancel this event? Everyone who answered is told.')) return Promise.resolve();
    return this.act(() => this.api.send('POST', `/api/v1/events/${this.id()}/cancel`, undefined, 'EventView'));
  }

  async deleteEvent(): Promise<void> {
    const v = this.view();
    if (!v?.can_edit || this.busy() || !confirm(`Permanently delete "${v.event.title}" and all its answers? This cannot be undone.`)) return;
    this.busy.set(true); this.error.set('');
    try {
      await this.api.send('DELETE', `/api/v1/events/${this.id()}`, undefined, 'Done');
      await this.router.navigate(['/groups', v.group_slug]);
    } catch (e) { this.error.set(problem(e)); }
    finally { this.busy.set(false); }
  }

  regular(on: boolean): Promise<void> {
    const s = this.series();
    if (!s) return Promise.resolve();
    return this.act(() => this.api.send('PUT', `/api/v1/series/${s.id}/regular`, { on }, 'SeriesView'));
  }

  async endSeries(): Promise<void> {
    const s = this.series();
    if (!s) return;
    const cancel = confirm('Stop repeating. Also cancel the upcoming ones already planned?');
    await this.act(() => this.api.send('DELETE', `/api/v1/series/${s.id}${cancel ? '?cancel=1' : ''}`, undefined, 'Done'));
    if (!this.error()) await this.router.navigate(['/groups', this.view()?.group_slug]);
  }
}
