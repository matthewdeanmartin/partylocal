import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  EventKind, EventView, fromLocalInput, KIND_INFO, Module, MODULE_LABEL, Question, SeriesView, Shift, Slot,
  TimeOption, toLocalInput, PersonList, PersonView, GroupView,
} from 'party-core';
import { Api, problem } from '../api';
import { value } from './auth';

type Repeat = '' | 'weekly' | 'monthly-nth' | 'monthly-date' | 'yearly';

/**
 * New event (`/groups/:ref/events/new`, `?series=1` for a recurring one) or
 * edit (`/events/:id/edit`, `?scope=following` for this and later ones).
 */
@Component({
  selector: 'party-event-form',
  imports: [RouterLink],
  styles: [`
    :host { display: block; padding: 1rem; }
    .card { max-width: 52rem; margin: auto; }
    fieldset { margin: 1rem 0; padding: 1rem; min-width: 0; }
    fieldset.form-fields { border: 0; padding: 0; margin: 0; }
    label { display: block; margin: .75rem 0; }
    input, textarea, select { max-width: 100%; box-sizing: border-box; }
    button { margin: .25rem; }
    .row { display: flex; flex-wrap: wrap; gap: .75rem; }
  `],
  template: `
    <section class="card narrow">
      <h1>{{ id() ? 'Edit event' : 'New event' }}</h1>
      @if (!id()) {
        <fieldset>
          <legend>What kind?</legend>
          <div class="chips">
            @for (k of kinds; track k) {
              <button type="button" class="chip" [class.on]="kind() === k" (click)="pickKind(k)">{{ info[k].icon }} {{ info[k].label }}</button>
            }
          </div>
        </fieldset>
      }
      @if (seriesId()) { <p><a [routerLink]="['/series', seriesId()]">Series settings</a> · {{ scope() === 'following' ? 'Editing this and following occurrences' : 'Editing only this occurrence' }}</p> }
      @if (scope() === 'following') { <p class="status on">Changes apply to this and every later active occurrence and future events. Time edits change the time of day, not the repeat dates. The schedule follows the board timezone; inputs use your device timezone.</p> }
      @if (loading()) { <p role="status">Loading event settings…</p> }
      @if (saved()) { <p role="status">{{ saved() }}</p> }
      @if (id()) { <p><a [routerLink]="['/events', id()]">Back to event</a></p> }
      <form (submit)="submit($event)">
        <fieldset class="form-fields" [disabled]="loading() || !allowed() || busy()">
        <label>Title <input maxlength="80" required [value]="title()" (input)="title.set(v($event))" /></label>
        <label>About <small>optional</small> <textarea rows="3" maxlength="4000" [value]="about()" (input)="about.set(v($event))"></textarea></label>
        @if (!polling()) {
          <div class="row">
            <label>Starts <small>Leave blank if time is not yet determined</small> <input type="datetime-local" [value]="start()" (input)="start.set(v($event))" /></label>
            <label>Ends <small>optional</small> <input type="datetime-local" [value]="end()" (input)="end.set(v($event))" /></label>
          </div>
        }
        @if (!id() && repeatable()) {
          <fieldset>
            <legend>Repeat</legend>
            <p>Weekly and monthly schedules use the board timezone and keep their local time through daylight-saving changes. Inputs use your device timezone. Yearly repeats keep the same month and date; February 29 is observed on February 28 in non-leap years and returns to February 29 in leap years.</p>
            <select [value]="repeat()" (change)="repeat.set($any(v($event)))" aria-label="Repeat">
              <option value="">Once</option>
              <option value="weekly">Weekly</option>
              <option value="monthly-nth">Monthly, same weekday (e.g. first Friday)</option>
              <option value="monthly-date">Monthly, same date</option><option value="yearly">Yearly (birthdays and anniversaries)</option>
            </select>
            @if (repeat() === 'weekly') {
              <label>Every <input type="number" min="1" max="4" [value]="every()" (input)="every.set(+v($event))" /> week(s)</label>
            }
            @if (repeat() === 'monthly-nth') {
              <label>Weekday occurrence <select [value]="nth()" (change)="nth.set(+v($event))"><option value="0">Infer from first date</option><option value="1">First</option><option value="2">Second</option><option value="3">Third</option><option value="4">Fourth</option><option value="-1">Last</option></select></label>
              <p>The first date must match the chosen weekday occurrence in the board timezone.</p>
            }
            @if (repeat()) {
              <label>Last allowed start <small>optional, inclusive</small><input type="datetime-local" [value]="repeatUntil()" (input)="repeatUntil.set(v($event))" /></label>
              <label>Total occurrence limit <small>0 = unlimited, at most 104</small><input type="number" min="0" max="104" [value]="repeatCount()" (input)="repeatCount.set(+v($event))" /></label>
              <label>Keep this many ahead <input type="number" min="1" max="8" [value]="window()" (input)="window.set(+v($event))" /></label>
            }
          </fieldset>
        }
        <fieldset>
          <legend>Where</legend>
          <div class="segmented small">
            @for (w of ['place', 'home', 'tbd']; track w) {
              <button type="button" [class.on]="whereKind() === w" (click)="whereKind.set($any(w))">{{ w === 'tbd' ? 'To be decided' : w === 'home' ? "Someone's home" : 'A place' }}</button>
            }
          </div>
          @if (whereKind() === 'place') {
            <label>Place <input maxlength="120" [value]="place()" (input)="place.set(v($event))" /></label>
          }
          @if (whereKind() === 'home') {
            <label>Whose home
              <select [value]="home()" (change)="home.set(+v($event))">
                <option value="0">Pick a household</option>
                @for (h of households(); track h.id) { <option [value]="h.id" [selected]="h.id === home()">{{ h.name }}</option> }
              </select></label>
          }
          <label>Map link <small>optional, https:// or http://</small><input type="url" maxlength="300" [value]="map()" (input)="map.set(v($event))" /></label>
          @if (whereKind() !== 'tbd') {
            <label>Address <small>shown on this board only</small> <input maxlength="200" [value]="address()" (input)="address.set(v($event))" /></label>
          }
        </fieldset>
        <fieldset>
          <legend>Hosts and access</legend>
          <p>Event hosts can edit this event and manage answers. This does not change group co-organizer roles. Choose 1 to 4 hosts.</p>
          @for (person of hosts(); track person) {
            <p>{{ personName(person) }} <button type="button" (click)="hosts.set(without(hosts(), $index))" [disabled]="hosts().length <= 1">Remove host</button></p>
          }
          <label>Visibility
            <select [value]="visibility()" (change)="visibility.set($any(v($event)))">
              <option value="group">Follow group visibility</option>
              <option value="invite-only">Invite only</option>
              <option value="public" [disabled]="!publicGroup()">Public (public groups only)</option>
            </select>
          </label>
          <p>Invite-only events are visible to hosts, group managers and direct invitees. Direct invitations do not add group membership.</p>
          @for (person of invitees(); track person) {
            <p>{{ personName(person) }} <button type="button" (click)="invitees.set(without(invitees(), $index))">Remove invitee</button></p>
          }
          <label>Find people <input type="search" [value]="peopleQuery()" (input)="peopleQuery.set(v($event))" /></label>
          <button type="button" (click)="searchPeople()" [disabled]="searching()">{{ searching() ? 'Searching…' : 'Search people' }}</button>
          @if (peopleError()) { <p role="alert">{{ peopleError() }}</p> }
          @for (person of people(); track person.id) {
            <p>{{ person.display_name }}
              <button type="button" [disabled]="hosts().includes(person.id) || hosts().length >= 4" (click)="hosts.set([...hosts(), person.id])">Add host</button>
              <button type="button" [disabled]="invitees().includes(person.id)" (click)="invitees.set([...invitees(), person.id])">Invite</button>
            </p>
          }
          @if (searched() && !people().length) { <p>No visible people match your search.</p> }
        </fieldset>
        <fieldset>
          <legend>Who and how many</legend>
          <label>Places <small>0 = no limit, counts guests too</small>
            <input type="number" min="0" max="2000" [value]="capacity()" (input)="capacity.set(+v($event))" /></label>
          <label>Guests per person
            <select [value]="plusOnes()" (change)="plusOnes.set($any(v($event)))">
              <option value="none">None</option>
              <option value="limited">Up to…</option>
              <option value="unlimited">Any number</option>
            </select></label>
          @if (plusOnes() === 'limited') {
            <label>Up to <input type="number" min="1" max="9" [value]="plusMax()" (input)="plusMax.set(+v($event))" /></label>
          }
          <label>Answers close <small>optional</small>
            <input type="datetime-local" [value]="rsvpBy()" (input)="rsvpBy.set(v($event))" /></label>
          <label>Remind people
            <select [value]="reminder()" (change)="reminder.set(+v($event))">
              <option value="0">No reminder</option>
              <option value="3600">An hour before</option>
              <option value="86400">The day before</option>
              <option value="604800">A week before</option>
            </select></label>
          <label class="switch"><input type="checkbox" [checked]="draft()" (change)="draft.set(!draft())" [disabled]="!!id() && !wasDraft()" /> Draft (only hosts see it)</label>
        </fieldset>
        <fieldset>
          <legend>Extras</legend>
          @for (m of optional; track m) {
            <label class="check"><input type="checkbox" [checked]="has(m)" (change)="flip(m)" /> {{ moduleLabel[m] }}</label>
          }
        </fieldset>
        @if (has('bring')) {
          <fieldset>
            <legend>Bring list</legend>
            @for (s of bring(); track $index) {
              <div class="row">
                <label>Item <input maxlength="40" [value]="s.name" (input)="s.name = v($event)" /></label>
                <label>How many <input type="number" min="1" max="99" [value]="s.count" (input)="s.count = +v($event)" /></label>
                <button type="button" class="secondary" (click)="bring.set(without(bring(), $index))">Remove</button>
              </div>
            }
            <button type="button" class="secondary" (click)="bring.set([...bring(), { id: 0, name: '', count: 1 }])">Add an item</button>
          </fieldset>
        }
        @if (has('diet')) {
          <label>Diet question <input maxlength="120" [value]="diet()" placeholder="Allergies or diet?" (input)="diet.set(v($event))" /></label>
        }
        @if (polling()) {
          <fieldset>
            <legend>Times to choose from (2 to 6)</legend>
            @for (o of when(); track $index) {
              <div class="row">
                <label>Option {{ $index + 1 }} <input type="datetime-local" [value]="local(o.start)" (input)="o.start = secs(v($event))" /></label>
                <button type="button" class="secondary" (click)="when.set(without(when(), $index))">Remove</button>
              </div>
            }
            @if (when().length < 6) { <button type="button" class="secondary" (click)="when.set([...when(), { id: 0, start: 0, end: 0 }])">Add a time</button> }
          </fieldset>
        }
        @if (has('shifts')) {
          <fieldset>
            <legend>Shifts</legend>
            @for (s of shifts(); track $index) {
              <div class="row">
                <label>Shift <input maxlength="40" [value]="s.name" (input)="s.name = v($event)" /></label>
                <label>From <input type="datetime-local" [value]="local(s.start)" (input)="s.start = secs(v($event))" /></label>
                <label>To <input type="datetime-local" [value]="local(s.end)" (input)="s.end = secs(v($event))" /></label>
                <label>People <input type="number" min="1" max="99" [value]="s.count" (input)="s.count = +v($event)" /></label>
                <button type="button" class="secondary" (click)="shifts.set(without(shifts(), $index))">Remove</button>
              </div>
            }
            <button type="button" class="secondary" (click)="shifts.set([...shifts(), { id: 0, name: '', start: 0, end: 0, count: 1 }])">Add a shift</button>
          </fieldset>
        }
        @if (has('questions')) {
          <fieldset>
            <legend>Questions (up to 4)</legend>
            @for (q of questions(); track $index) {
              <div class="row">
                <label>Question <input maxlength="120" [value]="q.prompt" (input)="q.prompt = v($event)" /></label>
                <label>Answer
                  <select [value]="q.kind" (change)="q.kind = $any(v($event))">
                    <option value="yesno">Yes / no</option>
                    <option value="choice">Pick one</option>
                    <option value="text">Short text</option>
                  </select></label>
                @if (q.kind === 'choice') {
                  <label>Choices, comma-separated <input [value]="q.choices.join(', ')" (input)="q.choices = split(v($event))" /></label>
                }
                <button type="button" class="secondary" (click)="questions.set(without(questions(), $index))">Remove</button>
              </div>
            }
            @if (questions().length < 4) {
              <button type="button" class="secondary" (click)="questions.set([...questions(), { id: 0, kind: 'yesno', prompt: '', choices: [] }])">Add a question</button>
            }
          </fieldset>
        }
        @if (has('rides')) {
          <label>Rides note <input maxlength="200" [value]="ridesNote()" placeholder="Meet at the church lot" (input)="ridesNote.set(v($event))" /></label>
        }
        @if (has('cost')) {
          <label>Cost <input maxlength="200" [value]="cost()" placeholder="$10 for pizza, pay Sam" (input)="cost.set(v($event))" /></label>
        }
        @if (has('link')) {
          <label>Online link <input type="url" maxlength="300" [value]="link()" (input)="link.set(v($event))" /></label>
        }
        </fieldset>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button type="submit" [disabled]="busy() || loading() || !allowed()">{{ busy() ? 'Saving…' : id() ? 'Save' : repeat() ? 'Start the series' : 'Create' }}</button>
      </form>
    </section>
  `,
})
export class EventForm implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  /** Route parameters: the group to create in, or the event to edit. */
  readonly ref = input<string>('');
  readonly id = input<string>('');
  /** Query: `series=1` starts with repeating on; `scope=following`. */
  readonly series = input<string>('');
  readonly scope = input<string>('');

  readonly loading = signal(true);
  readonly allowed = signal(false);
  readonly saved = signal('');
  readonly hosts = signal<number[]>([]);
  readonly invitees = signal<number[]>([]);
  readonly visibility = signal<'group' | 'invite-only' | 'public'>('group');
  readonly map = signal('');
  readonly publicGroup = signal(false);
  readonly people = signal<PersonView[]>([]);
  readonly peopleQuery = signal('');
  readonly peopleError = signal('');
  readonly searching = signal(false);
  readonly searched = signal(false);
  private readonly names = new Map<number, string>();

  personName(id: number): string { return this.names.get(id) ?? `Person #${id}`; }

  async searchPeople(): Promise<void> {
    this.searching.set(true); this.peopleError.set('');
    try {
      const people: PersonView[] = []; let after = 0;
      do {
        const page = await this.api.get<PersonList>(`/api/v1/people?q=${encodeURIComponent(this.peopleQuery())}&after=${after}`, 'PersonList');
        people.push(...page.people); after = page.next;
      } while (after);
      for (const p of people) this.names.set(p.id, p.display_name);
      this.people.set(people); this.searched.set(true);
    } catch (e) { this.peopleError.set(problem(e)); }
    finally { this.searching.set(false); }
  }

  readonly kind = signal<EventKind>('generic');
  readonly modules = signal<Module[]>(['headcount']);
  readonly title = signal('');
  readonly about = signal('');
  readonly start = signal('');
  readonly end = signal('');
  readonly whereKind = signal<'place' | 'home' | 'tbd'>('tbd');
  readonly place = signal('');
  readonly address = signal('');
  readonly home = signal(0);
  readonly capacity = signal(0);
  readonly plusOnes = signal<'none' | 'limited' | 'unlimited'>('unlimited');
  readonly plusMax = signal(2);
  readonly rsvpBy = signal('');
  readonly reminder = signal(0);
  readonly draft = signal(false);
  readonly wasDraft = signal(false);
  readonly bring = signal<Slot[]>([]);
  readonly diet = signal('');
  readonly when = signal<TimeOption[]>([]);
  readonly shifts = signal<Shift[]>([]);
  readonly questions = signal<Question[]>([]);
  readonly ridesNote = signal('');
  readonly cost = signal('');
  readonly link = signal('');
  readonly repeat = signal<Repeat>('');
  readonly seriesId = signal(0);
  readonly nth = signal(0);
  readonly repeatUntil = signal('');
  readonly repeatCount = signal(0);
  readonly every = signal(1);
  readonly window = signal(4);
  readonly households = signal<{ id: number; name: string }[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  private rev = 0;
  private group = 0;
  readonly pollLocked = signal(false);
  readonly polling = computed(() => this.has('when') && !this.pollLocked());
  readonly repeatable = computed(() => !this.has('when'));

  readonly kinds = Object.keys(KIND_INFO) as EventKind[];
  readonly info = KIND_INFO;
  readonly moduleLabel = MODULE_LABEL;
  readonly optional: Module[] = ['bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];
  readonly v = value;
  readonly local = toLocalInput;
  readonly secs = fromLocalInput;

  has(m: Module): boolean {
    return this.modules().includes(m);
  }

  flip(m: Module): void {
    if (m === 'when') this.pollLocked.set(false);
    this.modules.update((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));
    if (m === 'when' && this.has('when')) this.repeat.set('');
  }

  pickKind(k: EventKind): void {
    this.kind.set(k);
    this.modules.set([...KIND_INFO[k].modules]);
    const plus: Record<EventKind, 'none' | 'limited' | 'unlimited'> = {
      generic: 'unlimited', party: 'limited', dinner: 'none', potluck: 'limited', outing: 'limited',
      meeting: 'unlimited', workday: 'unlimited', poll: 'unlimited',
    };
    this.plusOnes.set(plus[k]);
    if (k === 'outing') this.whereKind.set('place');
    if (k === 'meeting') this.repeat.set('weekly');
  }

  without<T>(list: T[], i: number): T[] {
    return list.filter((_, j) => j !== i);
  }

  split(raw: string): string[] {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async ngOnInit(): Promise<void> {
    this.api
      .get<{ households: { id: number; name: string }[] }>('/api/v1/households', 'HouseholdList')
      .then((h) => this.households.set(h.households))
      .catch(() => undefined);
    if (this.series()) this.repeat.set('weekly');
    if (!this.id()) {
      try {
        const g = await this.api.get<GroupView>(`/api/v1/groups/${this.ref()}`, 'GroupView');
        this.group = g.id;
        this.allowed.set(g.can_create_events && g.status === 'active');
        this.publicGroup.set(g.visibility === 'public');
        const me = this.api.me();
        if (me) { this.hosts.set([me.id]); this.names.set(me.id, me.display_name); }
        if (!this.allowed()) this.error.set('You cannot create events in this group.');
      } catch (e) {
        this.error.set(problem(e));
      }
      this.loading.set(false);
      return;
    }
    try {
      const v = await this.api.get<EventView>(`/api/v1/events/${this.id()}`, 'EventView');
      if (!v.can_edit) { this.error.set('Only event hosts and group managers can edit this event.'); return; }
      this.allowed.set(true);
      const e = v.event;
      this.seriesId.set(e.series);
      this.hosts.set([...e.hosts]); this.invitees.set([...e.invitees]);
      e.hosts.forEach((id, i) => this.names.set(id, v.host_names[i] || `Person #${id}`));
      this.visibility.set(e.visibility); this.map.set(e.map);
      // A host outside the group can still edit even if the group itself is private.
      await this.api.get<GroupView>(`/api/v1/groups/${e.group}`, 'GroupView')
        .then(g => this.publicGroup.set(g.visibility === 'public')).catch(() => undefined);
      for (const id of e.invitees) {
        void this.api.get<PersonView>(`/api/v1/people/${id}`, 'PersonView').then(p => {
          this.names.set(id, p.display_name); this.invitees.update(ids => [...ids]);
        }).catch(() => undefined);
      }
      this.rev = e.rev;
      this.kind.set(e.kind);
      this.modules.set(e.modules);
      this.pollLocked.set(e.modules.includes('when') && e.start !== 0);
      this.title.set(e.title);
      this.about.set(e.about);
      this.start.set(toLocalInput(e.start));
      this.end.set(toLocalInput(e.end));
      this.whereKind.set(e.where_kind);
      this.place.set(e.place);
      this.address.set(e.address);
      this.home.set(e.home);
      this.capacity.set(e.capacity);
      this.plusOnes.set(e.plus_ones);
      this.plusMax.set(e.plus_max);
      this.rsvpBy.set(toLocalInput(e.rsvp_by));
      this.reminder.set(e.reminder_secs);
      this.draft.set(e.status === 'draft');
      this.wasDraft.set(e.status === 'draft');
      this.bring.set(e.bring.map((s) => ({ ...s })));
      this.diet.set(e.diet_prompt);
      this.when.set(e.when.map((o) => ({ ...o })));
      this.shifts.set(e.shifts.map((s) => ({ ...s })));
      this.questions.set(e.questions.map((q) => ({ ...q, choices: [...q.choices] })));
      this.ridesNote.set(e.rides_note);
      this.cost.set(e.cost);
      this.link.set(e.link);
    } catch (e) {
      this.error.set(problem(e));
    } finally { this.loading.set(false); }
  }

  private body(): Record<string, unknown> {
    const polling = this.polling();
    return {
      kind: this.id() ? undefined : this.kind(),
      hosts: this.hosts(), visibility: this.visibility(), invitees: this.invitees(), map: this.map().trim(),
      title: this.title(),
      about: this.about(),
      start: polling ? 0 : fromLocalInput(this.start()),
      end: polling ? 0 : fromLocalInput(this.end()),
      where_kind: this.whereKind(),
      place: this.place(),
      address: this.address(),
      home: this.home(),
      capacity: this.capacity(),
      plus_ones: this.plusOnes(),
      plus_max: this.plusOnes() === 'limited' ? this.plusMax() : 0,
      rsvp_by: fromLocalInput(this.rsvpBy()),
      reminder_secs: this.reminder(),
      status: this.draft() ? 'draft' : 'scheduled',
      modules: this.modules(),
      bring: this.has('bring') ? this.bring().filter((s) => s.name.trim()) : undefined,
      diet_prompt: this.diet(),
      when: this.has('when') ? this.when().filter((o) => o.start) : undefined,
      shifts: this.has('shifts') ? this.shifts().filter((s) => s.name.trim()) : undefined,
      questions: this.has('questions') ? this.questions().filter((q) => q.prompt.trim()) : undefined,
      rides_note: this.ridesNote(),
      cost: this.cost(),
      link: this.link(),
    };
  }

  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.loading() || !this.allowed() || this.busy()) return;
    this.saved.set('');
    if (!this.hosts().length || this.hosts().length > 4) { this.error.set('Choose 1 to 4 event hosts.'); return; }
    if (this.map().trim() && !/^https?:\/\//i.test(this.map().trim())) { this.error.set('Map links must start with https:// or http://.'); return; }
    this.busy.set(true);
    this.error.set('');
    try {
      if (this.id()) {
        const scope = this.scope() === 'following' ? '?scope=following' : '';
        const v = await this.api.send<EventView>('PATCH', `/api/v1/events/${this.id()}${scope}`, { ...this.body(), rev: this.rev }, 'EventView');
        this.rev = v.event.rev;
        this.wasDraft.set(v.event.status === 'draft');
        this.allowed.set(v.can_edit);
        this.saved.set(v.can_edit ? 'Event saved.' : 'Event saved. You no longer have permission to edit it.');
      } else if (this.repeat()) {
        const s = await this.api.send<SeriesView>(
          'POST',
          `/api/v1/groups/${this.group}/series`,
          { event: this.body(), rule: this.repeat(), every: this.every(), nth: this.nth() || undefined, until: fromLocalInput(this.repeatUntil()), count: this.repeatCount(), window: this.window() },
          'SeriesView',
        );
        const first = s.upcoming[0];
        await this.router.navigate(first ? ['/events', first.id] : ['/groups', this.ref()]);
      } else {
        const v = await this.api.send<EventView>('POST', `/api/v1/groups/${this.group}/events`, this.body(), 'EventView');
        await this.router.navigate(['/events', v.event.id]);
      }
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }
}
