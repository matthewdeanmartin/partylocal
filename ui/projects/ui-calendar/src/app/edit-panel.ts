import { Component, computed, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { colour, EventKind, EventView, KIND_INFO, Module, MODULE_LABEL } from 'party-core';
import { Api, blankDraft, draftFrom, EventDraft, hostable, loadHouseholds, problem, saveEvent, withKind } from 'party-ng';
import { Cal, dayStart, hhmm, Nav, sameDay, secs } from './state';

const FIRST = 7;
const LAST = 24;
const ROW = 22;

/**
 * New or edited event, in the drawer. Time is picked on a timeline of the
 * day (drag across hours), next to that day's other events; a time poll's
 * options and a workday's shifts are drawn the same way.
 */
@Component({
  selector: 'cal-edit',
  template: `
    <header class="band" [style.--c]="tint(group())">
      <button type="button" class="x" (click)="back()" aria-label="Close">✕</button>
      <span class="kind">{{ id() ? 'Editing' : 'New' }}</span>
      <h2>{{ d().title || (id() ? 'Event' : 'Something on ' + dayLabel()) }}</h2>
    </header>
    <form class="body edit" (submit)="save($event)">
      @if (!id()) {
        <label class="line"><span>Group</span>
          <select [value]="group()" (change)="group.set(+val($event))">
            @for (g of groups(); track g.id) { <option [value]="g.id" [selected]="g.id === group()">{{ g.name }}</option> }
          </select></label>
        @if (!groups().length) { <p class="error">You can't create events in any group yet. Start a group first.</p> }
        <div class="kinds" role="radiogroup" aria-label="Kind">
          @for (k of kinds; track k) {
            <button type="button" role="radio" [attr.aria-checked]="d().kind === k" [class.on]="d().kind === k" (click)="kind(k)">{{ info[k].icon }}<small>{{ info[k].label }}</small></button>
          }
        </div>
      }
      <label class="line"><span>Title</span><input required maxlength="80" [value]="d().title" (input)="set({ title: val($event) })" placeholder="Game night" /></label>

      <div class="when-pick">
        <div class="line"><span>Day</span><input type="date" [value]="dateValue()" (change)="pickDate(val($event))" />
          <span class="sel">{{ selLabel() }}</span></div>
        <div #tl class="timeline" (pointerleave)="dragging = false" role="listbox" aria-label="Pick a time: drag across the hours">
          @for (r of rows; track r) {
            <div class="row" [class.hour]="r % 2 === 0" [class.in]="inSel(r)" (pointerdown)="down(r, $event)" (pointerenter)="over(r)" (pointerup)="dragging = false"
              role="option" [attr.aria-selected]="inSel(r)" tabindex="-1">
              @if (r % 2 === 0) { <span>{{ rowLabel(r) }}</span> }
            </div>
          }
          @for (b of busyBlocks(); track b.id) {
            <div class="busy" [style.top.px]="b.top" [style.height.px]="b.height" [style.--c]="tint(b.group)" [title]="b.title">{{ b.title }}</div>
          }
          @for (o of optionBlocks(); track $index) {
            <div class="option" [style.top.px]="o.top" [style.height.px]="o.height">{{ o.label }}</div>
          }
        </div>
        @if (polling()) {
          <div class="line top"><span>Options</span><div class="chips">
            @for (o of d().when; track $index) { <span class="chip on">{{ optionLabel(o.start, o.end) }} <button type="button" (click)="dropOption($index)" aria-label="Remove">✕</button></span> }
            <button type="button" class="chip add" (click)="addOption()" [disabled]="d().when.length >= 6">+ Add the selected time</button>
          </div></div>
        }
      </div>

      <div class="line"><span>Where</span>
        <div class="seg">
          @for (w of wheres; track w.v) { <button type="button" [class.on]="d().where_kind === w.v" (click)="set({ where_kind: w.v })">{{ w.l }}</button> }
        </div></div>
      @if (d().where_kind === 'place') { <label class="line"><span>Place</span><input [value]="d().place" (input)="set({ place: val($event) })" maxlength="120" /></label> }
      @if (d().where_kind === 'home') {
        <label class="line"><span>Whose</span><select [value]="d().home" (change)="set({ home: +val($event) })"><option value="0">Pick a household</option>@for (h of homes(); track h.id) { <option [value]="h.id" [selected]="h.id === d().home">{{ h.name }}</option> }</select></label>
      }
      @if (d().where_kind !== 'tbd') { <label class="line"><span>Address</span><input [value]="d().address" (input)="set({ address: val($event) })" maxlength="200" /></label> }
      <label class="line"><span>Places</span><input type="number" min="0" max="2000" [value]="d().capacity" (input)="set({ capacity: +val($event) })" /><small>0 = no limit</small></label>
      <label class="line"><span>Guests each</span>
        <select [value]="d().plus_ones" (change)="set({ plus_ones: $any(val($event)) })"><option value="none">none</option><option value="limited">up to {{ d().plus_max }}</option><option value="unlimited">any</option></select></label>
      @if (!id() && !polling()) {
        <label class="line"><span>Repeats</span>
          <select [value]="d().repeat" (change)="set({ repeat: $any(val($event)) })"><option value="">never</option><option value="weekly">weekly</option><option value="monthly-nth">monthly (same weekday)</option><option value="monthly-date">monthly (same date)</option></select></label>
      }
      <label class="line top"><span>About</span><textarea rows="3" [value]="d().about" (input)="set({ about: val($event) })"></textarea></label>

      <details [open]="extrasOpen()">
        <summary>Extras: {{ extrasSummary() }}</summary>
        <div class="chips">
          @for (m of optional; track m) { <button type="button" class="chip" [class.on]="has(m)" (click)="flip(m)">{{ moduleLabel[m] }}</button> }
        </div>
        @if (has('bring')) {
          <div class="line top"><span>Bring list</span><div class="stack">
            @for (s of d().bring; track $index) {
              <div class="pair"><input [value]="s.name" (input)="s.name = val($event)" placeholder="item" /><input type="number" min="1" max="99" [value]="s.count" (input)="s.count = +val($event)" /><button type="button" (click)="set({ bring: without(d().bring, $index) })">✕</button></div>
            }
            <button type="button" class="chip add" (click)="set({ bring: [...d().bring, { id: 0, name: '', count: 1 }] })">+ item</button>
          </div></div>
        }
        @if (has('shifts')) {
          <div class="line top"><span>Shifts</span><div class="stack">
            @for (s of d().shifts; track $index) {
              <div class="pair"><input [value]="s.name" (input)="s.name = val($event)" /><small>{{ optionLabel(s.start, s.end) }}</small><input type="number" min="1" max="99" [value]="s.count" (input)="s.count = +val($event)" /><button type="button" (click)="set({ shifts: without(d().shifts, $index) })">✕</button></div>
            }
            <button type="button" class="chip add" (click)="addShift()">+ the selected time as a shift</button>
          </div></div>
        }
        @if (has('questions')) {
          <div class="line top"><span>Questions</span><div class="stack">
            @for (q of d().questions; track $index) {
              <div class="pair"><input [value]="q.prompt" (input)="q.prompt = val($event)" /><select [value]="q.kind" (change)="q.kind = $any(val($event))"><option value="yesno">yes/no</option><option value="text">text</option><option value="choice">choice</option></select>
                @if (q.kind === 'choice') { <input [value]="q.choices.join(', ')" (input)="q.choices = split(val($event))" placeholder="a, b, c" /> }
                <button type="button" (click)="set({ questions: without(d().questions, $index) })">✕</button></div>
            }
            @if (d().questions.length < 4) { <button type="button" class="chip add" (click)="set({ questions: [...d().questions, { id: 0, kind: 'yesno', prompt: '', choices: [] }] })">+ question</button> }
          </div></div>
        }
        @if (has('diet')) { <label class="line"><span>Diet question</span><input [value]="d().diet_prompt" (input)="set({ diet_prompt: val($event) })" placeholder="Any allergies?" /></label> }
        @if (has('cost')) { <label class="line"><span>Cost</span><input [value]="d().cost" (input)="set({ cost: val($event) })" /></label> }
        @if (has('rides')) { <label class="line"><span>Rides note</span><input [value]="d().rides_note" (input)="set({ rides_note: val($event) })" /></label> }
        @if (has('link')) { <label class="line"><span>Link</span><input type="url" [value]="d().link" (input)="set({ link: val($event) })" /></label> }
      </details>
      <label class="line check"><input type="checkbox" [checked]="d().draft" (change)="set({ draft: !d().draft })" [disabled]="!!id() && !wasDraft" /> Keep as a draft (only hosts see it)</label>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="actions"><button type="button" (click)="back()">Cancel</button><button type="submit" class="primary" [disabled]="busy() || (!id() && !groups().length)">{{ id() ? 'Save changes' : 'Add to calendar' }}</button></div>
    </form>
  `,
})
export class EditPanel {
  /** Event id to edit, or 0 for new. */
  readonly id = input(0);
  /** For a new one: the time clicked (Unix seconds). */
  readonly start = input(0);
  /** For a new one from a group's drawer: its slug. */
  readonly groupSlug = input('');
  readonly nav = inject(Nav);
  private readonly api = inject(Api);
  private readonly cal = inject(Cal);
  readonly d = signal<EventDraft>(blankDraft('generic'));
  readonly group = signal(0);
  readonly homes = signal<{ id: number; name: string }[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly day = signal(dayStart(new Date()));
  /** The selection on the timeline, in half-hour rows from FIRST. */
  readonly sel = signal<[number, number]>([24, 30]);
  readonly groups = computed(() => hostable(this.cal.mine()));
  readonly kinds = Object.keys(KIND_INFO) as EventKind[];
  readonly info = KIND_INFO;
  readonly moduleLabel = MODULE_LABEL;
  readonly optional: Module[] = ['bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];
  readonly wheres = [{ v: 'place' as const, l: 'A place' }, { v: 'home' as const, l: 'A home' }, { v: 'tbd' as const, l: 'TBD' }];
  readonly rows = Array.from({ length: (LAST - FIRST) * 2 }, (_, i) => i);
  private readonly tl = viewChild<ElementRef<HTMLElement>>('tl');
  rev = 0;
  wasDraft = false;
  dragging = false;
  private anchorRow = 0;

  readonly polling = computed(() => this.d().modules.includes('when'));
  readonly extrasOpen = computed(() => this.d().modules.length > 1);
  readonly extrasSummary = computed(() => this.d().modules.filter((m) => m !== 'headcount').map((m) => MODULE_LABEL[m]).join(', ') || 'none');
  readonly dateValue = computed(() => {
    const x = this.day();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  });
  readonly dayLabel = computed(() => this.day().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }));
  readonly busyBlocks = computed(() =>
    this.cal.events()
      .filter((e) => e.start && e.id !== this.id() && sameDay(new Date(e.start * 1000), this.day()))
      .map((e) => ({ ...this.block(e.start, e.end || e.start + 3 * 3600), id: e.id, title: e.title, group: e.group })),
  );
  readonly optionBlocks = computed(() =>
    this.d().when.filter((o) => sameDay(new Date(o.start * 1000), this.day())).map((o) => ({ ...this.block(o.start, o.end), label: 'option' })),
  );

  constructor() {
    void loadHouseholds(this.api).then((h) => this.homes.set(h));
    effect(() => {
      const [id, start, slug] = [this.id(), this.start(), this.groupSlug()];
      untracked(() => void this.init(id, start, slug));
    });
    effect(() => {
      const first = this.groups()[0];
      if (first && !untracked(this.group)) this.group.set(first.id);
    });
    // The selection is the event's time (unless it's a poll, whose options are added).
    effect(() => {
      const [a, b] = this.sel();
      if (this.polling()) return;
      const start = this.rowTime(a);
      const end = this.rowTime(b);
      this.d.update((d) => (d.start === start && d.end === end ? d : { ...d, start, end }));
    });
  }

  private async init(id: number, start: number, slug: string): Promise<void> {
    this.error.set('');
    if (!id) {
      const at = start || secs(new Date(new Date().setHours(19, 0, 0, 0)));
      this.d.set(blankDraft('generic', at));
      this.focusTime(at, at + 3 * 3600);
      const g = this.groups().find((x) => x.slug === slug) ?? this.groups()[0];
      this.group.set(g?.id ?? 0);
      return;
    }
    try {
      const v = await this.api.get<EventView>(`/api/v1/events/${id}`, 'EventView');
      this.rev = v.event.rev;
      this.wasDraft = v.event.status === 'draft';
      this.group.set(v.event.group);
      this.d.set(draftFrom(v));
      if (v.event.start) this.focusTime(v.event.start, v.event.end || v.event.start + 3 * 3600);
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  private focusTime(start: number, end: number): void {
    this.day.set(dayStart(start));
    const row = (t: number) => Math.round((new Date(t * 1000).getHours() + new Date(t * 1000).getMinutes() / 60 - FIRST) * 2);
    const a = Math.max(0, Math.min(this.rows.length - 1, row(start)));
    this.sel.set([a, Math.max(a + 1, Math.min(this.rows.length, row(end)))]);
    // Bring the selection into view on the timeline.
    setTimeout(() => this.tl()?.nativeElement.scrollTo({ top: Math.max(0, a * ROW - 2 * ROW) }));
  }

  private rowTime(r: number): number {
    const x = new Date(this.day());
    x.setHours(FIRST, r * 30, 0, 0);
    return secs(x);
  }

  private block(start: number, end: number): { top: number; height: number } {
    const h = (t: number) => new Date(t * 1000).getHours() + new Date(t * 1000).getMinutes() / 60;
    const top = Math.max(0, (h(start) - FIRST) * 2 * ROW);
    return { top, height: Math.max(ROW, (h(end) - h(start) || 3) * 2 * ROW - 2) };
  }

  down(r: number, ev: PointerEvent): void {
    ev.preventDefault();
    this.dragging = true;
    this.anchorRow = r;
    this.sel.set([r, r + (this.polling() ? 4 : 6)]);
  }

  over(r: number): void {
    if (!this.dragging) return;
    this.sel.set(r >= this.anchorRow ? [this.anchorRow, r + 1] : [r, this.anchorRow + 1]);
  }

  inSel(r: number): boolean {
    const [a, b] = this.sel();
    return r >= a && r < b;
  }

  selLabel(): string {
    const [a, b] = this.sel();
    return `${hhmm(this.rowTime(a))} – ${hhmm(this.rowTime(b))}`;
  }

  rowLabel(r: number): string {
    return hhmm(this.rowTime(r));
  }

  optionLabel(start: number, end: number): string {
    const day = new Date(start * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    return `${day} ${hhmm(start)}${end ? '–' + hhmm(end) : ''}`;
  }

  pickDate(v: string): void {
    if (!v) return;
    const [y, m, dd] = v.split('-').map(Number);
    this.day.set(new Date(y, m - 1, dd));
    this.sel.update((s) => [...s] as [number, number]);
  }

  addOption(): void {
    const [a, b] = this.sel();
    this.set({ when: [...this.d().when, { id: 0, start: this.rowTime(a), end: this.rowTime(b) }] });
  }

  dropOption(i: number): void {
    this.set({ when: this.without(this.d().when, i) });
  }

  addShift(): void {
    const [a, b] = this.sel();
    this.set({ shifts: [...this.d().shifts, { id: 0, name: `Shift ${this.d().shifts.length + 1}`, start: this.rowTime(a), end: this.rowTime(b), count: 2 }] });
  }

  kind(k: EventKind): void {
    this.d.update((d) => withKind(d, k));
  }

  has(m: Module): boolean {
    return this.d().modules.includes(m);
  }

  flip(m: Module): void {
    this.set({ modules: this.has(m) ? this.d().modules.filter((x) => x !== m) : [...this.d().modules, m] });
  }

  set(change: Partial<EventDraft>): void {
    this.d.update((d) => ({ ...d, ...change }));
  }

  without<T>(list: T[], i: number): T[] {
    return list.filter((_, j) => j !== i);
  }

  split(raw: string): string[] {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  tint(id: number): string {
    return colour(id);
  }

  back(): void {
    if (this.id()) this.nav.open('e', this.id());
    else this.nav.close();
  }

  async save(ev: Event): Promise<void> {
    ev.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      const target = this.id() ? { id: this.id(), rev: this.rev } : { group: this.group() };
      const id = await saveEvent(this.api, this.d(), target);
      await this.cal.load();
      this.cal.say(this.id() ? 'Saved.' : 'Added to the calendar.');
      if (id) this.nav.open('e', id);
      else this.nav.close();
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.busy.set(false);
    }
  }
}
