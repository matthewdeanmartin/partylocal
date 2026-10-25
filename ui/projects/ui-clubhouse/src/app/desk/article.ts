import { loadFeatureStyle } from '../feature-styles';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { blankAnswer, guestLimit, KIND_INFO, RsvpInput, STATUS_LABEL, toggle, when } from 'party-core';
import { Api, answerEvent, EventPage, loadEvent, problem, relative } from 'party-ng';
import { InvitePanel } from '../../../../local/src/app/invite-panel';
import { Theme } from '../theme';

/**
 * One event: the headline, a details box, who's coming, and the answer
 * form, a sentence with blanks in the theme's own words.
 */
@Component({
  selector: 'ch-event',
  imports: [RouterLink, InvitePanel],
  template: `
    @let L = theme.t();
    @let R = L.reply;
    @if (page(); as p) {
      @let v = p.view;
      @let e = v.event;
      <article class="feature">
        <p class="kicker">{{ kind(e.kind) }} · <a [routerLink]="['/groups', v.group_slug]">{{ v.group_name }}</a> · {{ L.pageOf(e.id) }}</p>
        <h1 [class.struck]="e.status === 'cancelled'">{{ e.title }}</h1>
        @if (e.status === 'cancelled') { <p class="stop">{{ L.cancelledBanner }}</p> }
        @if (e.status === 'draft') { <p class="stop">{{ L.draftBanner }}</p> }
        <p class="byline">{{ L.leadBy(v.host_names.join(' & '), v.group_name) }} · {{ e.start ? relative(e.start) : e.modules.includes('when') ? L.dateByVote : 'Time not yet determined' }}</p>
        <div class="spread">
          <div class="columns body">
            <p class="drop">{{ e.about || L.noAbout }}</p>
            @if (p.series) { <p><a [routerLink]="['/series', p.series.id]">Series settings and regular attendance</a></p><p><em>{{ L.regular(p.series.summary) }}</em></p> }
            <h2 class="rule">{{ L.guestList }}</h2>
            <p>
              @for (r of attending(); track r.person; let last = $last) { <span class="smallcaps">{{ r.display_name }}</span>@if (r.plus) { {{ ' ' + L.with(r.plus) }} }@if (r.status === 'maybe') { <em> {{ L.perhaps }}</em> }@if (r.status === 'waitlist') { <em> {{ L.waiting }}</em> }{{ last ? '.' : ', ' }} }
              @if (!attending().length) { {{ L.noReplies }} }
            </p>
            @if (regrets().length) { <p class="small">{{ L.regrets(regrets().join(', ')) }}</p> }
          </div>
          <aside class="particulars">
            <h2>{{ L.facts.title }}</h2><p><a [routerLink]="['/manage/events', e.id]">More event tools and answers</a></p>
            <dl>
              <dt>{{ L.facts.when }}</dt><dd>{{ e.modules.includes('when') && !e.start ? L.dateByVote : when(e.start, e.end) }}</dd>
              <dt>{{ L.facts.where }}</dt><dd>{{ where() }}</dd>
              <dt>{{ L.facts.admission }}</dt><dd>{{ e.cost || L.facts.free }}</dd>
              <dt>{{ L.facts.expected }}</dt><dd>{{ v.heads }}{{ e.capacity ? ' / ' + e.capacity : '' }}{{ v.maybe ? ' (+' + v.maybe + ')' : '' }}{{ v.waitlist ? ' · ' + v.waitlist + ' ⏳' : '' }}</dd>
              @if (e.rsvp_by) { <dt>{{ L.facts.replyBy }}</dt><dd>{{ when(e.rsvp_by) }}</dd> }
              @if (e.bring.length) { <dt>{{ L.facts.wanted }}</dt><dd>@for (s of e.bring; track s.id; let last = $last) { {{ s.name }} ({{ L.still(left(s.id, s.count)) }}){{ last ? '' : '; ' }} }</dd> }
            </dl>
            @if (v.can_edit) { <p><a [routerLink]="['/events', e.id, 'edit']">Hosts and access · full editor</a></p> }
            @if (e.map) { <p><a [href]="e.map" target="_blank" rel="noopener">Open map</a></p> }
            @if (v.can_edit && e.status !== 'cancelled' && e.status !== 'done') {
              <p class="small"><a routerLink="/new" [queryParams]="{ edit: e.id }">{{ L.correct }}</a> · <button type="button" class="tiny" (click)="cancel()">{{ L.spike }}</button></p>
            }
          </aside>
        </div>

        @if (v.can_edit && e.modules.includes('when') && !e.start) {
          <section class="slip editors">
            <h2>{{ L.editorsDesk }}</h2>
            <p>{{ L.votedLead }}
              @for (o of e.when; track o.id) { <button type="button" class="tiny" (click)="lock(o.id)">{{ L.fixFor(when(o.start, o.end), votes(o.id)) }}</button> }</p>
          </section>
        }

        @if (v.can_answer) {
          <form class="slip" id="reply" (submit)="send($event)">
            <h2>{{ R.title }} <span class="scissors" aria-hidden="true">✂ - - - - - - - - - - - - - -</span></h2>
            <p class="madlib">
              {{ R.lead(api.me()?.display_name ?? '') }}
              <select class="blank" [value]="a().status" (change)="set({ status: $any(val($event)) })" aria-label="Your answer">
                <option value="going">{{ R.status.going }}</option><option value="maybe">{{ R.status.maybe }}</option><option value="no">{{ R.status.no }}</option>
              </select>
              <b>{{ e.title }}</b>@if (a().status !== 'no' && limit() > 0) {,
                {{ R.bringing }}
                <select class="blank short" [value]="a().plus" (change)="set({ plus: +val($event) })" aria-label="Guests">@for (n of guestsRange(); track n) { <option [value]="n" [selected]="n === a().plus">{{ n === 0 ? R.guestsNone : n }}</option> }</select>
                {{ R.guest(a().plus ?? 0) }}@if (a().plus) {, {{ R.namely }} <input class="blank" [value]="a().names" (input)="set({ names: val($event) })" [placeholder]="R.namesHint" aria-label="Guests' names" />,
                  {{ R.ofWhom }} <select class="blank short" [value]="a().kids" (change)="set({ kids: +val($event) })" aria-label="Kids">@for (n of kidsRange(); track n) { <option [value]="n" [selected]="n === a().kids">{{ n === 0 ? R.kidsNone : n }}</option> }</select> {{ R.kids(a().kids ?? 0) }} }}.
              @if (a().status !== 'no') {
                @if (e.modules.includes('when') && e.when.length) {
                  {{ R.datesLead }}
                  @for (o of e.when; track o.id; let last = $last) { <label class="inline-check"><input type="checkbox" [checked]="a().when?.includes(o.id)" (change)="set({ when: toggle(a().when ?? [], o.id) })" />{{ when(o.start, o.end) }}</label>{{ last ? '' : ', ' }} }
                  {{ R.datesTail }}
                }
                @if (e.modules.includes('bring') && e.bring.length) {
                  {{ R.bringLead }}
                  <select class="blank" [value]="firstBring()" (change)="bring(+val($event))" aria-label="I'll bring">
                    <option value="0">{{ R.bringNothing }}</option>
                    @for (s of e.bring; track s.id) { <option [value]="s.id" [disabled]="left(s.id, s.count) <= 0 && !a().bring?.includes(s.id)" [selected]="s.id === firstBring()">{{ R.bringItem(s.name) }}{{ left(s.id, s.count) <= 0 && !a().bring?.includes(s.id) ? ' ' + R.covered : '' }}</option> }
                  </select>@if (a().bring_other || !firstBring()) { + <input class="blank" [value]="a().bring_other" (input)="set({ bring_other: val($event) })" [placeholder]="R.bringOther" aria-label="Something else" /> }.
                }
                @if (e.modules.includes('shifts') && e.shifts.length) {
                  {{ R.shiftLead }}
                  <select class="blank" [value]="a().shifts?.[0] ?? 0" (change)="set({ shifts: +val($event) ? [+val($event)] : [] })" aria-label="Shift">
                    <option value="0">{{ R.shiftNone }}</option>
                    @for (s of e.shifts; track s.id) { <option [value]="s.id" [selected]="a().shifts?.[0] === s.id">{{ s.name }}, {{ hm(s.start) }}–{{ hm(s.end) }}</option> }
                  </select> {{ R.shiftTail }}
                }
                @if (e.modules.includes('rides')) {
                  {{ R.rideLead }}
                  <select class="blank" [value]="a().ride" (change)="set({ ride: val($event), seats: a().seats || 1 })" aria-label="Rides">
                    <option value="">{{ R.ride.none }}</option><option value="need">{{ R.ride.need }}</option><option value="offer">{{ R.ride.offer }}</option><option value="own">{{ R.ride.own }}</option>
                  </select>@if (a().ride === 'offer' || a().ride === 'need') {, {{ R.rideFor }} <input class="blank short" type="number" min="1" max="8" [value]="a().seats" (input)="set({ seats: +val($event) })" aria-label="Seats" /> {{ a().ride === 'offer' ? R.ridePeople.offer : R.ridePeople.need }}}.
                }
                @if (e.modules.includes('diet')) {
                  {{ R.dietLead }} <input class="blank wide" [value]="a().diet" (input)="set({ diet: val($event) })" [placeholder]="e.diet_prompt || R.dietHint" aria-label="Diet" />.
                }
                @for (q of e.modules.includes('questions') ? e.questions : []; track q.id) {
                  {{ R.askLead(q.prompt) }}
                  @if (q.kind === 'text') { <input class="blank" [value]="answerTo(q.id)" (input)="answer(q.id, val($event))" [attr.aria-label]="q.prompt" /> }
                  @else { <select class="blank" [value]="answerTo(q.id)" (change)="answer(q.id, val($event))" [attr.aria-label]="q.prompt"><option value="">{{ R.noAnswer }}</option>@for (c of q.kind === 'yesno' ? ['yes', 'no'] : q.choices; track c) { <option [value]="c" [selected]="answerTo(q.id) === c">{{ c }}</option> }</select> }.
                }
              }
              <br /><span class="ps">{{ R.note }} <input class="blank wide" [value]="a().note" (input)="set({ note: val($event) })" [placeholder]="R.noteHint" aria-label="Note" /></span>
            </p>
            @if (R.signOff) { <p class="sign">{{ R.signOff }} <i>{{ api.me()?.display_name }}</i></p> }
            @if (error()) { <p class="stop">{{ error() }}</p> }
            @if (saved()) { <p class="received">✓ {{ saved() }}</p> }
            <button type="submit" [disabled]="busy()">{{ v.mine ? R.sendAgain : R.sendNew }}</button>
          </form>
        } @else if (v.mine) {
          <p class="received">{{ R.onFile(label(v.mine.status).toLowerCase()) }}{{ v.locked ? R.closed : '' }}</p>
        } @else if (e.status === 'scheduled' && !v.locked) {
          <p class="small">{{ R.membersOnly }} <a [routerLink]="['/groups', v.group_slug]">{{ v.group_name }}</a></p>
        }
        @if (v.can_edit && e.status === 'scheduled') {
          <h2 class="rule">{{ L.invite }}</h2>
          <div class="classic"><party-invite-panel kind="event" [target]="e.id" /></div>
        }
      </article>
    } @else if (error()) { <p class="stop">{{ error() }}</p> }
  `,
})
export class EventScreen implements OnInit {
  private readonly featureStyle = loadFeatureStyle('classic');

  readonly id = input.required<string>();
  readonly api = inject(Api);
  readonly theme = inject(Theme);
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
    const L = this.theme.t();
    if (!e) return '';
    if (e.where_kind === 'tbd') return L.facts.tbd;
    return [e.place, e.address].filter(Boolean).join(', ') || L.facts.home;
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
      const R = this.theme.t().reply;
      this.saved.set(s === 'waitlist' ? R.waitlisted : R.received(this.label(s ?? '').toLowerCase()));
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
    if (!confirm(this.theme.t().spikeConfirm)) return;
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
    return KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? 'Event';
  }

  label(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s;
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
