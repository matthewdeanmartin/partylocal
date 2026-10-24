import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { colour, EventKind, EventView, GroupView, initials, KIND_INFO, Module, MODULE_LABEL, when } from 'party-core';
import { Api, blankDraft, draftFrom, EventDraft, hostable, loadOverview, problem, saveEvent, withKind } from 'party-ng';
import { Toast } from './toast';

type Step = 'group' | 'kind' | 'title' | 'when' | 'where' | 'size' | 'extras' | 'review';

/**
 * Making an event, one full screen per question, thumb-sized. The day is
 * a strip of the next three weeks, the time a grid of chips; a poll adds
 * each picked slot as an option.
 */
@Component({
  selector: 'deck-wizard',
  template: `
    <div class="sheet page" role="dialog" aria-label="New event">
      <header>
        <button type="button" class="ghost" (click)="close()">{{ i() ? 'Close' : 'Cancel' }}</button>
        <div class="progress" aria-hidden="true">@for (s of steps(); track s) { <i [class.on]="$index <= i()"></i> }</div>
        <span class="count">{{ i() + 1 }}/{{ steps().length }}</span>
      </header>
      @let d = draft();
      <div class="step">
        @switch (step()) {
          @case ('group') {
            <h2>Which group is it for?</h2>
            <div class="tiles">
              @for (g of groups(); track g.id) { <button type="button" [class.on]="group() === g.id" [style.--c]="tint(g.id)" (click)="group.set(g.id); next()"><b><span class="ini small">{{ initials(g.name) }}</span> {{ g.name }}</b></button> }
            </div>
            @if (!groups().length) { <p class="hint">You can't create events in any group yet. Start a group from the Groups tab.</p> }
          }
          @case ('kind') {
            <h2>What are you planning?</h2>
            <div class="tiles grid2">
              @for (k of kinds; track k) { <button type="button" [class.on]="d.kind === k" (click)="kind(k)"><span class="emoji">{{ info[k].icon }}</span><b>{{ info[k].label }}</b></button> }
            </div>
          }
          @case ('title') {
            <h2>Give it a name</h2>
            <input class="big huge-text" maxlength="80" [value]="d.title" (input)="set({ title: val($event) })" [placeholder]="info[d.kind].label + ' at ours'" (keydown.enter)="next()" />
            <textarea class="big" rows="3" placeholder="Say a bit more (optional)" [value]="d.about" (input)="set({ about: val($event) })"></textarea>
          }
          @case ('when') {
            <h2>{{ polling() ? 'Which times could work?' : 'When?' }}</h2>
            <div class="days" role="listbox" aria-label="Day">
              @for (day of days; track day.getTime()) {
                <button type="button" role="option" [attr.aria-selected]="sameDay(day)" [class.on]="sameDay(day)" (click)="pickDay(day)"><small>{{ dow(day) }}</small><b>{{ day.getDate() }}</b><small>{{ mon(day) }}</small></button>
              }
            </div>
            <div class="times">
              @for (h of hours; track h) { <button type="button" [class.on]="hour() === h" (click)="pickHour(h)">{{ hourLabel(h) }}</button> }
            </div>
            <div class="tiles row">
              @for (l of lengths; track l.v) { <button type="button" [class.on]="length() === l.v" (click)="length.set(l.v); apply()">{{ l.l }}</button> }
            </div>
            @if (polling()) {
              <button type="button" class="go" (click)="addOption()" [disabled]="d.when.length >= 6">＋ Add {{ chosenLabel() }}</button>
              <div class="chips">@for (o of d.when; track $index) { <span class="chip">{{ when(o.start, o.end) }} <button type="button" (click)="drop('when', $index)" aria-label="Remove">✕</button></span> }</div>
            } @else {
              <p class="chosen">{{ when(d.start, d.end) }}</p>
              @if (!editId()) {
                <div class="tiles row">@for (r of repeats; track r.v) { <button type="button" [class.on]="d.repeat === r.v" (click)="set({ repeat: r.v })">{{ r.l }}</button> }</div>
              }
            }
          }
          @case ('where') {
            <h2>Where?</h2>
            <div class="tiles row">@for (w of wheres; track w.v) { <button type="button" [class.on]="d.where_kind === w.v" (click)="set({ where_kind: w.v })">{{ w.l }}</button> }</div>
            @if (d.where_kind !== 'tbd') {
              <input class="big" placeholder="Place (e.g. The back room at Hops & Co)" [value]="d.place" (input)="set({ place: val($event) })" />
              <input class="big" placeholder="Address (shown on the board only)" [value]="d.address" (input)="set({ address: val($event) })" />
            }
          }
          @case ('size') {
            <h2>How many people?</h2>
            <div class="big-stepper">
              <button type="button" (click)="set({ capacity: Math.max(0, d.capacity - (d.capacity > 20 ? 5 : 1)) })" aria-label="Fewer">−</button>
              <output>{{ d.capacity || '∞' }}</output>
              <button type="button" (click)="set({ capacity: d.capacity + (d.capacity >= 20 ? 5 : 1) })" aria-label="More">+</button>
            </div>
            <p class="hint">{{ d.capacity ? d.capacity + ' places, guests included; more go on a waitlist' : 'No limit' }}</p>
            <h3>Can people bring guests?</h3>
            <div class="tiles row">
              <button type="button" [class.on]="d.plus_ones === 'none'" (click)="set({ plus_ones: 'none' })">No</button>
              <button type="button" [class.on]="d.plus_ones === 'limited'" (click)="set({ plus_ones: 'limited', plus_max: 1 })">+1</button>
              <button type="button" [class.on]="d.plus_ones === 'limited' && d.plus_max === 2" (click)="set({ plus_ones: 'limited', plus_max: 2 })">+2</button>
              <button type="button" [class.on]="d.plus_ones === 'unlimited'" (click)="set({ plus_ones: 'unlimited' })">Any</button>
            </div>
          }
          @case ('extras') {
            <h2>Anything else?</h2>
            <div class="tiles grid2">
              @for (m of optional; track m) { <button type="button" [class.on]="has(m)" (click)="flip(m)"><b>{{ moduleLabel[m] }}</b></button> }
            </div>
            @if (has('bring')) {
              <h3>Bring list</h3>
              <div class="chips">@for (s of d.bring; track $index) { <span class="chip">{{ s.name }} ×{{ s.count }} <button type="button" (click)="drop('bring', $index)">✕</button></span> }</div>
              <input class="big" placeholder="Add an item, then Enter (e.g. Salad x3)" (keydown.enter)="addItem($event)" />
            }
            @if (has('questions')) {
              <h3>A yes/no question for guests</h3>
              <input class="big" placeholder="e.g. Can you bring a chair?" [value]="d.questions[0]?.prompt ?? ''" (input)="question(val($event))" />
            }
            @if (has('cost')) { <input class="big" placeholder="Cost (e.g. £5 each)" [value]="d.cost" (input)="set({ cost: val($event) })" /> }
            @if (has('diet')) { <input class="big" placeholder="Diet question (e.g. Any allergies?)" [value]="d.diet_prompt" (input)="set({ diet_prompt: val($event) })" /> }
            @if (has('link')) { <input class="big" type="url" placeholder="Video link" [value]="d.link" (input)="set({ link: val($event) })" /> }
          }
          @case ('review') {
            <h2>Looks good?</h2>
            <article class="card preview" [style.--c]="tint(group())">
              <div class="hero"><span class="emoji">{{ info[d.kind].icon }}</span><span class="tag">{{ groupName() }}</span></div>
              <div class="info">
                <h2>{{ d.title || 'Untitled' }}</h2>
                <p class="when">{{ polling() ? d.when.length + ' times to vote on' : when(d.start, d.end) }}{{ d.repeat ? ' · repeats' : '' }}</p>
                <p class="where">📍 {{ d.place || (d.where_kind === 'tbd' ? 'Place TBD' : '') }}</p>
                <p class="who">{{ d.capacity ? d.capacity + ' places' : 'No limit' }}</p>
              </div>
            </article>
            <label class="switch-row"><span>Save as a draft (only hosts see it)</span><input type="checkbox" role="switch" [checked]="d.draft" (change)="set({ draft: !d.draft })" /></label>
          }
        }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <footer>
        @if (i() > 0) { <button type="button" class="ghost" (click)="i.set(i() - 1)">Back</button> }
        @if (step() !== 'group') { <button type="button" class="go" [disabled]="busy() || !ready()" (click)="next()">{{ step() === 'review' ? (editId() ? 'Save' : 'Publish') : 'Next' }}</button> }
      </footer>
    </div>
  `,
})
export class Wizard implements OnInit {
  /** ?group=slug to start in a group; ?edit=id to change an event. */
  readonly groupSlug = input('', { alias: 'group' });
  readonly editId = input('', { alias: 'edit' });
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  readonly groups = signal<GroupView[]>([]);
  readonly group = signal(0);
  readonly draft = signal<EventDraft>(blankDraft('generic'));
  readonly i = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly day = signal(new Date());
  readonly hour = signal(19);
  readonly length = signal(3);
  rev = 0;
  readonly kinds = Object.keys(KIND_INFO) as EventKind[];
  readonly info = KIND_INFO;
  readonly moduleLabel = MODULE_LABEL;
  readonly optional: Module[] = ['bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];
  readonly hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
  readonly lengths = [{ v: 1, l: '1 h' }, { v: 2, l: '2 h' }, { v: 3, l: '3 h' }, { v: 5, l: '5 h' }, { v: 0, l: 'open end' }];
  readonly repeats = [{ v: '' as const, l: 'Once' }, { v: 'weekly' as const, l: 'Weekly' }, { v: 'monthly-nth' as const, l: 'Monthly' }];
  readonly wheres = [{ v: 'place' as const, l: '📍 A place' }, { v: 'tbd' as const, l: '🤷 Decide later' }];
  readonly days = Array.from({ length: 21 }, (_, n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  readonly when = when;
  readonly initials = initials;
  readonly Math = Math;

  readonly polling = computed(() => this.draft().modules.includes('when'));
  readonly steps = computed<Step[]>(() =>
    this.editId() ? ['title', 'when', 'where', 'size', 'extras', 'review'] : ['group', 'kind', 'title', 'when', 'where', 'size', 'extras', 'review'],
  );
  readonly step = computed(() => this.steps()[this.i()]);
  readonly groupName = computed(() => this.groups().find((g) => g.id === this.group())?.name ?? '');
  readonly ready = computed(() => {
    const d = this.draft();
    if (this.step() === 'title') return !!d.title.trim();
    if (this.step() === 'when') return this.polling() ? d.when.length >= 2 : !!d.start;
    return true;
  });

  async ngOnInit(): Promise<void> {
    if (this.editId()) {
      const v = await this.api.get<EventView>(`/api/v1/events/${this.editId()}`, 'EventView');
      this.rev = v.event.rev;
      this.group.set(v.event.group);
      this.draft.set(draftFrom(v));
      if (v.event.start) {
        const s = new Date(v.event.start * 1000);
        this.day.set(new Date(s.getFullYear(), s.getMonth(), s.getDate()));
        this.hour.set(s.getHours());
        this.length.set(v.event.end ? Math.round((v.event.end - v.event.start) / 3600) : 0);
      }
    } else {
      this.apply();
    }
    const groups = hostable((await loadOverview(this.api)).mine);
    this.groups.set(groups);
    const g = groups.find((x) => x.slug === this.groupSlug());
    if (g && !this.editId()) {
      this.group.set(g.id);
      this.i.set(1);
    }
  }

  set(change: Partial<EventDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  kind(k: EventKind): void {
    this.draft.update((d) => withKind(d, k));
    void this.next();
  }

  has(m: Module): boolean {
    return this.draft().modules.includes(m);
  }

  flip(m: Module): void {
    this.set({ modules: this.has(m) ? this.draft().modules.filter((x) => x !== m) : [...this.draft().modules, m] });
  }

  pickDay(d: Date): void {
    this.day.set(d);
    this.apply();
  }

  pickHour(h: number): void {
    this.hour.set(h);
    this.apply();
  }

  private chosen(): [number, number] {
    const d = new Date(this.day());
    d.setHours(this.hour(), 0, 0, 0);
    const start = Math.floor(d.getTime() / 1000);
    return [start, this.length() ? start + this.length() * 3600 : 0];
  }

  chosenLabel(): string {
    return when(...this.chosen());
  }

  /** The picked day + hour + length become the event's time (not a poll's). */
  apply(): void {
    if (this.polling()) return;
    const [start, end] = this.chosen();
    this.set({ start, end });
  }

  addOption(): void {
    const [start, end] = this.chosen();
    this.set({ when: [...this.draft().when, { id: 0, start, end: end || start + 2 * 3600 }] });
  }

  drop(list: 'when' | 'bring', i: number): void {
    if (list === 'when') this.set({ when: this.draft().when.filter((_, j) => j !== i) });
    else this.set({ bring: this.draft().bring.filter((_, j) => j !== i) });
  }

  addItem(e: Event): void {
    const el = e.target as HTMLInputElement;
    const m = /^(.*?)\s*(?:x|×)\s*(\d+)$/i.exec(el.value.trim());
    const name = (m ? m[1] : el.value).trim();
    if (name) this.set({ bring: [...this.draft().bring, { id: 0, name, count: m ? Number(m[2]) : 1 }] });
    el.value = '';
  }

  question(prompt: string): void {
    this.set({ questions: prompt ? [{ id: this.draft().questions[0]?.id ?? 0, kind: 'yesno', prompt, choices: [] }] : [] });
  }

  sameDay(d: Date): boolean {
    return d.toDateString() === this.day().toDateString();
  }

  dow(d: Date): string {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  mon(d: Date): string {
    return d.toLocaleDateString(undefined, { month: 'short' });
  }

  hourLabel(h: number): string {
    return new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' });
  }

  async next(): Promise<void> {
    if (this.step() !== 'review') {
      this.i.update((i) => i + 1);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await saveEvent(this.api, this.draft(), this.editId() ? { id: Number(this.editId()), rev: this.rev } : { group: this.group() });
      this.toast.say(this.editId() ? 'Saved' : 'Published 🎉');
      await this.router.navigate(['/m/e', id], { replaceUrl: true });
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    history.back();
  }

  tint(id: number): string {
    return colour(id);
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** A new group, as a short wizard of tiles. */
@Component({
  selector: 'deck-new-group',
  template: `
    <div class="sheet page" role="dialog" aria-label="New group">
      <header><button type="button" class="ghost" (click)="back()">Cancel</button><b>New group</b><span></span></header>
      <div class="step">
        <h2>What's it called?</h2>
        <input class="big huge-text" maxlength="60" [value]="name()" (input)="name.set(val($event))" placeholder="Sunday Dinners" />
        <textarea class="big" rows="2" placeholder="What's it about? (optional)" (input)="about = val($event)"></textarea>
        <h3>Who can find it?</h3>
        <div class="tiles row">@for (o of vis; track o.v) { <button type="button" [class.on]="visibility() === o.v" (click)="visibility.set(o.v)">{{ o.l }}</button> }</div>
        <h3>How do people join?</h3>
        <div class="tiles row">@for (o of joins; track o.v) { <button type="button" [class.on]="join() === o.v" (click)="join.set(o.v)">{{ o.l }}</button> }</div>
        @if (error()) { <p class="error">{{ error() }}</p> }
      </div>
      <footer><button type="button" class="go" [disabled]="!name().trim()" (click)="create()">Create</button></footer>
    </div>
  `,
})
export class NewGroup {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly name = signal('');
  readonly visibility = signal('unlisted');
  readonly join = signal('approval');
  readonly error = signal('');
  about = '';
  readonly vis = [{ v: 'public', l: '🌍 Anyone' }, { v: 'unlisted', l: '🔗 With the link' }, { v: 'private', l: '🔒 Members' }];
  readonly joins = [{ v: 'open', l: 'Anyone joins' }, { v: 'approval', l: 'I approve' }, { v: 'invite', l: 'Invite only' }];

  async create(): Promise<void> {
    try {
      const g = await this.api.send<GroupView>('POST', '/api/v1/groups', { name: this.name(), about: this.about, kind: 'circle', visibility: this.visibility(), join: this.join() }, 'GroupView');
      await this.router.navigate(['/m/groups', g.slug], { replaceUrl: true });
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  back(): void {
    history.back();
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
