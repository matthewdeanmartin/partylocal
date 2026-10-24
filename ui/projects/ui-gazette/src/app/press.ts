import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EventKind, EventView, fromLocalInput, GroupView, KIND_INFO, Me, Module, MODULE_LABEL, toLocalInput } from 'party-core';
import { Api, blankDraft, draftFrom, EventDraft, hostable, loadHouseholds, loadOverview, problem, saveEvent, withKind } from 'party-ng';

const ARTICLE: Record<EventKind, string> = {
  generic: 'a get-together', party: 'a party', dinner: 'a dinner', potluck: 'a potluck', outing: 'an outing', meeting: 'a meeting', workday: 'a working bee', poll: 'a gathering',
};

/**
 * The press desk: an announcement written as one paragraph with blanks.
 * Filling it in is the form; the paragraph is also the preview.
 */
@Component({
  selector: 'gz-press',
  template: `
    <h1 class="section-head">{{ editId() ? 'Corrections desk' : 'The press desk' }}</h1>
    <p class="standfirst">{{ editId() ? 'Amend the announcement below and send it back to press. Readers who replied are told of changes.' : 'Fill in the blanks; what you see is what will be printed.' }}</p>
    @if (!editId() && !groups().length && loaded()) { <p class="stop">You may not announce gatherings for any society yet. Found one first, from the Society Pages.</p> }
    @let d = draft();
    <form class="slip press" (submit)="send($event)">
      <p class="madlib">
        @if (!editId()) {
          The <select class="blank" [value]="group()" (change)="group.set(+val($event))" aria-label="Society">@for (g of groups(); track g.id) { <option [value]="g.id" [selected]="g.id === group()">{{ g.name }}</option> }</select>
          announces
          <select class="blank" [value]="d.kind" (change)="kind($any(val($event)))" aria-label="Kind">@for (k of kinds; track k) { <option [value]="k" [selected]="d.kind === k">{{ article[k] }}</option> }</select>
          to be called
        } @else { The gathering called }
        “<input class="blank wide title" required maxlength="80" [value]="d.title" (input)="set({ title: val($event) })" placeholder="a fine title" aria-label="Title" />”,
        @if (polling()) {
          to be held at one of the following times, as the readers decide:
          @for (o of d.when; track $index; let last = $last) {
            <input class="blank" type="datetime-local" [value]="local(o.start)" (change)="option($index, val($event))" aria-label="Possible time" />@if (d.when.length > 2) { <button type="button" class="tiny" (click)="drop($index)" aria-label="Remove">✕</button> }{{ last ? '' : ' or ' }}
          }
          <button type="button" class="tiny" (click)="addOption()" [disabled]="d.when.length >= 6">+ another time</button>,
        } @else {
          on <input class="blank" type="datetime-local" required [value]="local(d.start)" (change)="start(val($event))" aria-label="Starts" />
          until <input class="blank" type="time" [value]="hm(d.end)" (change)="end(val($event))" aria-label="Ends" />@if (!editId()) {,
            <select class="blank" [value]="d.repeat" (change)="set({ repeat: $any(val($event)) })" aria-label="Repeats"><option value="">once only</option><option value="weekly">and every week thereafter</option><option value="monthly-nth">and on the same weekday each month</option><option value="monthly-date">and on the same date each month</option></select>
          },
        }
        <select class="blank" [value]="d.where_kind" (change)="set({ where_kind: $any(val($event)) })" aria-label="Where"><option value="place">at</option><option value="home">at the home of</option><option value="tbd">at a place to be announced</option></select>
        @if (d.where_kind === 'place') { <input class="blank wide" [value]="d.place" (input)="set({ place: val($event) })" placeholder="the place" aria-label="Place" /> }
        @if (d.where_kind === 'home') { <select class="blank" [value]="d.home" (change)="set({ home: +val($event) })" aria-label="Household"><option value="0">(which household?)</option>@for (h of homes(); track h.id) { <option [value]="h.id" [selected]="h.id === d.home">{{ h.name }}</option> }</select> }
        @if (d.where_kind !== 'tbd') { (<input class="blank" [value]="d.address" (input)="set({ address: val($event) })" placeholder="address, for residents' eyes only" aria-label="Address" />) }.
        Places are
        <select class="blank" [value]="d.capacity ? 'limited' : 'unlimited'" (change)="set({ capacity: val($event) === 'limited' ? d.capacity || 12 : 0 })" aria-label="Capacity"><option value="unlimited">unlimited</option><option value="limited">limited to</option></select>
        @if (d.capacity) { <input class="blank short" type="number" min="1" max="2000" [value]="d.capacity" (input)="set({ capacity: +val($event) })" aria-label="Places" /> persons, guests included }.
        Each may bring
        <select class="blank" [value]="guests()" (change)="setGuests(val($event))" aria-label="Guests"><option value="none">no guests</option><option value="1">one guest</option><option value="2">up to two guests</option><option value="3">up to three guests</option><option value="unlimited">as many guests as they like</option></select>.
        @if (has('bring')) {
          Attendees are asked to bring <input class="blank wide" [value]="bringText()" (change)="setBring(val($event))" placeholder="e.g. salad x3, dessert x2, chairs" aria-label="Bring list" />.
        }
        @if (has('cost')) { Admission: <input class="blank" [value]="d.cost" (input)="set({ cost: val($event) })" placeholder="free" aria-label="Cost" />. }
        @if (has('diet')) { Guests will be asked: “<input class="blank wide" [value]="d.diet_prompt" (input)="set({ diet_prompt: val($event) })" placeholder="Any allergies?" aria-label="Diet question" />” }
        @if (has('questions')) { They will also be asked, yes or no: “<input class="blank wide" [value]="d.questions[0]?.prompt ?? ''" (input)="question(val($event))" placeholder="Can you bring a chair?" aria-label="Question" />” }
        @if (has('link')) { Those attending from afar may follow at <input class="blank wide" type="url" [value]="d.link" (input)="set({ link: val($event) })" placeholder="https://…" aria-label="Link" />. }
      </p>
      <p class="madlib small">Further particulars:</p>
      <textarea class="blank-area" rows="4" [value]="d.about" (input)="set({ about: val($event) })" placeholder="What readers should know…" aria-label="About"></textarea>
      <fieldset class="extras">
        <legend>Also print</legend>
        @for (m of optional; track m) { <label class="inline-check"><input type="checkbox" [checked]="has(m)" (change)="flip(m)" />{{ moduleLabel[m].toLowerCase() }}</label> }
      </fieldset>
      <label class="inline-check"><input type="checkbox" [checked]="d.draft" (change)="set({ draft: !d.draft })" [disabled]="!!editId() && !wasDraft" /> Hold the presses (save as a proof only the hosts can see)</label>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit" [disabled]="busy() || (!editId() && !groups().length)">{{ editId() ? 'Print the correction' : 'Send to press' }}</button>
    </form>
  `,
})
export class Press implements OnInit {
  readonly groupSlug = input('', { alias: 'group' });
  readonly editId = input('', { alias: 'edit' });
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly groups = signal<GroupView[]>([]);
  readonly homes = signal<{ id: number; name: string }[]>([]);
  readonly group = signal(0);
  readonly draft = signal<EventDraft>(blankDraft('party', nextSaturday()));
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  rev = 0;
  wasDraft = false;
  readonly kinds = Object.keys(KIND_INFO) as EventKind[];
  readonly article = ARTICLE;
  readonly moduleLabel = MODULE_LABEL;
  readonly optional: Module[] = ['bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];
  readonly polling = computed(() => this.draft().modules.includes('when'));
  readonly guests = computed(() => {
    const d = this.draft();
    return d.plus_ones === 'limited' ? String(Math.min(3, d.plus_max)) : d.plus_ones;
  });
  readonly bringText = computed(() => this.draft().bring.map((s) => (s.count > 1 ? `${s.name} x${s.count}` : s.name)).join(', '));

  async ngOnInit(): Promise<void> {
    void loadHouseholds(this.api).then((h) => this.homes.set(h));
    try {
      if (this.editId()) {
        const v = await this.api.get<EventView>(`/api/v1/events/${this.editId()}`, 'EventView');
        this.rev = v.event.rev;
        this.wasDraft = v.event.status === 'draft';
        this.draft.set(draftFrom(v));
      }
      const groups = hostable((await loadOverview(this.api)).mine);
      this.groups.set(groups);
      this.group.set((groups.find((g) => g.slug === this.groupSlug()) ?? groups[0])?.id ?? 0);
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.loaded.set(true);
    }
  }

  set(change: Partial<EventDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }

  kind(k: EventKind): void {
    this.draft.update((d) => {
      const next = withKind(d, k);
      return k === 'poll' && next.when.length < 2 ? { ...next, when: [{ id: 0, start: d.start, end: d.start + 7200 }, { id: 0, start: d.start + 86_400, end: d.start + 86_400 + 7200 }] } : next;
    });
  }

  has(m: Module): boolean {
    return this.draft().modules.includes(m);
  }

  flip(m: Module): void {
    if (m === 'when' && !this.has('when')) return this.kind('poll');
    this.set({ modules: this.has(m) ? this.draft().modules.filter((x) => x !== m) : [...this.draft().modules, m] });
  }

  local(t: number): string {
    return toLocalInput(t);
  }

  hm(t: number): string {
    return t ? toLocalInput(t).slice(11) : '';
  }

  start(v: string): void {
    const s = fromLocalInput(v);
    const d = this.draft();
    this.set({ start: s, end: d.end > d.start ? s + (d.end - d.start) : s + 3 * 3600 });
  }

  end(v: string): void {
    const d = this.draft();
    if (!v) return this.set({ end: 0 });
    const [h, m] = v.split(':').map(Number);
    const e = new Date(d.start * 1000);
    e.setHours(h, m, 0, 0);
    let t = Math.floor(e.getTime() / 1000);
    if (t <= d.start) t += 86_400;
    this.set({ end: t });
  }

  option(i: number, v: string): void {
    const s = fromLocalInput(v);
    this.set({ when: this.draft().when.map((o, j) => (j === i ? { ...o, start: s, end: s + 7200 } : o)) });
  }

  addOption(): void {
    const last = this.draft().when.at(-1)?.start ?? nextSaturday();
    this.set({ when: [...this.draft().when, { id: 0, start: last + 86_400, end: last + 86_400 + 7200 }] });
  }

  drop(i: number): void {
    this.set({ when: this.draft().when.filter((_, j) => j !== i) });
  }

  setGuests(v: string): void {
    if (v === 'none' || v === 'unlimited') this.set({ plus_ones: v });
    else this.set({ plus_ones: 'limited', plus_max: Number(v) });
  }

  setBring(v: string): void {
    const old = this.draft().bring;
    this.set({
      bring: v.split(',').map((s) => s.trim()).filter(Boolean).map((s, i) => {
        const m = /^(.*?)\s*x\s*(\d+)$/i.exec(s);
        return { id: old[i]?.id ?? 0, name: (m ? m[1] : s).replace(/^(an?|some)\s+/i, ''), count: m ? Number(m[2]) : 1 };
      }),
    });
  }

  question(prompt: string): void {
    this.set({ questions: prompt ? [{ id: this.draft().questions[0]?.id ?? 0, kind: 'yesno', prompt, choices: [] }] : [] });
  }

  async send(e: Event): Promise<void> {
    e.preventDefault();
    this.busy.set(true);
    this.error.set('');
    try {
      const id = await saveEvent(this.api, this.draft(), this.editId() ? { id: Number(this.editId()), rev: this.rev } : { group: this.group() });
      await this.router.navigate(['/e', id]);
    } catch (err) {
      this.error.set(problem(err));
    } finally {
      this.busy.set(false);
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** Founding a society: its charter, as a sentence. */
@Component({
  selector: 'gz-found',
  template: `
    <h1 class="section-head">Founding a society</h1>
    <form class="slip" (submit)="send($event)">
      <p class="madlib">
        We hereby found <input class="blank wide title" required maxlength="60" [value]="name()" (input)="name.set(val($event))" placeholder="the society's name" aria-label="Name" />,
        <select class="blank" (change)="kind = val($event)" aria-label="Kind"><option value="club">a club that meets regularly</option><option value="circle" selected>a circle of family or friends</option><option value="one-off">a committee for a single occasion</option></select>,
        for <input class="blank wide" (input)="about = val($event)" placeholder="its purpose" aria-label="About" />.
        Its existence shall be known to
        <select class="blank" (change)="visibility = val($event)" aria-label="Visibility"><option value="public">all readers</option><option value="unlisted" selected>those given the link</option><option value="private">its members alone</option></select>,
        and new members
        <select class="blank" (change)="join = val($event)" aria-label="Joining"><option value="open">may simply join</option><option value="approval" selected>may apply, to be approved by the organizers</option><option value="invite">are admitted by invitation only</option></select>.
      </p>
      <p class="sign">Signed, <i>{{ api.me()?.display_name }}</i>, founding organizer</p>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit">Register the society</button>
    </form>
  `,
})
export class Found {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly name = signal('');
  readonly error = signal('');
  kind = 'circle';
  about = '';
  visibility = 'unlisted';
  join = 'approval';

  async send(e: Event): Promise<void> {
    e.preventDefault();
    try {
      const g = await this.api.send<GroupView>('POST', '/api/v1/groups', { name: this.name(), about: this.about, kind: this.kind, visibility: this.visibility, join: this.join }, 'GroupView');
      await this.router.navigate(['/societies', g.slug]);
    } catch (err) {
      this.error.set(problem(err));
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** Letters to the editor: your profile, PIN and subscription. */
@Component({
  selector: 'gz-letters',
  template: `
    <h1 class="section-head">Letters to the Editor</h1>
    @if (me(); as m) {
      <form class="slip" (submit)="save($event)">
        <p class="madlib">
          Dear Editor, kindly print my name as <input class="blank" [value]="m.display_name" (input)="change['display_name'] = val($event)" aria-label="Name" />.
          Readers may write to me at <input class="blank wide" type="email" [value]="m.email" (input)="change['email'] = val($event)" placeholder="(no address)" aria-label="Email" />,
          and I <select class="blank" [value]="m.email_notify ? 'yes' : 'no'" (change)="change['email_notify'] = val($event) === 'yes'" aria-label="Email notifications"><option value="yes">should</option><option value="no">should not</option></select> like news of invitations sent there.
          I wish to be listed in Who's Who for
          <select class="blank" [value]="m.discoverable" (change)="change['discoverable'] = val($event)" aria-label="Who can find me"><option value="public">every reader</option><option value="members">fellow members of my societies</option><option value="nobody">no one at all</option></select>.
          A word about myself: <input class="blank wide" maxlength="280" [value]="m.bio" (input)="change['bio'] = val($event)" placeholder="(nothing to add)" aria-label="About me" />.
        </p>
        <p class="sign">Yours, <i>{{ m.display_name }}</i>{{ m.household_name ? ', ' + m.household_name : '' }}</p>
        <button type="submit">Send the letter</button>
      </form>
      <form class="slip" (submit)="pin($event)">
        <p class="madlib">Dear Editor, my present PIN is <input class="blank short" type="password" inputmode="numeric" autocomplete="current-password" (input)="pinNow = val($event)" aria-label="Current PIN" />
          and I should like it changed to <input class="blank short" type="password" inputmode="numeric" autocomplete="new-password" (input)="pinNew = val($event)" aria-label="New PIN" />.</p>
        <button type="submit">Change my PIN</button>
      </form>
      @if (msg()) { <p [class.stop]="bad()" [class.received]="!bad()">{{ msg() }}</p> }
      <p class="small">Leaving? <button type="button" class="tiny" (click)="signOut()">Suspend delivery (sign out)</button></p>
    }
  `,
})
export class Letters implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly me = signal<Me | null>(null);
  readonly msg = signal('');
  readonly bad = signal(false);
  change: Record<string, unknown> = {};
  pinNow = '';
  pinNew = '';

  async ngOnInit(): Promise<void> {
    this.me.set(await this.api.get<Me>('/api/v1/auth/me', 'Me'));
  }

  async save(e: Event): Promise<void> {
    e.preventDefault();
    await this.run(async () => {
      await this.api.send('PATCH', '/api/v1/me', this.change, 'Me');
      this.change = {};
      await this.api.refresh();
      await this.ngOnInit();
      return 'Your letter has been received and the corrections made.';
    });
  }

  async pin(e: Event): Promise<void> {
    e.preventDefault();
    await this.run(async () => {
      await this.api.send('PUT', '/api/v1/me/pin', { current: this.pinNow, pin: this.pinNew }, 'Done');
      return 'Your PIN has been changed.';
    });
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    await this.router.navigateByUrl('/subscribe');
  }

  private async run(work: () => Promise<string>): Promise<void> {
    try {
      this.msg.set(await work());
      this.bad.set(false);
    } catch (e) {
      this.msg.set(problem(e));
      this.bad.set(true);
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** The subscriber's desk: sign in, sign up or set up, as a sentence. */
@Component({
  selector: 'gz-subscribe',
  template: `
    <h1 class="section-head">{{ setup() ? 'A new paper' : "The subscriber's desk" }}</h1>
    <p class="standfirst">{{ setup() ? 'This board has no readers yet. Whoever registers first becomes its editor (admin).' : 'Residents and friends read free. Please identify yourself.' }}</p>
    <form class="slip" (submit)="go($event)">
      <p class="madlib">
        @if (setup()) {
          I, <input class="blank" required (input)="name = val($event)" placeholder="your name" autocomplete="name" aria-label="Name" />, take up the editorship.
          Correspondence may reach me at <input class="blank wide" type="email" (input)="email = val($event)" placeholder="(optional email)" aria-label="Email" />.
          My PIN shall be <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="new-password" aria-label="PIN" />.
          @if (api.status()?.setup_code_required) { The setup code is <input class="blank" required (input)="code = val($event)" aria-label="Setup code" />. }
        } @else if (up()) {
          I am new here. Please enrol me as <input class="blank" required (input)="name = val($event)" placeholder="your name" autocomplete="name" aria-label="Name" />,
          to be reached at <input class="blank wide" type="email" (input)="email = val($event)" placeholder="(optional email)" aria-label="Email" />,
          with the PIN <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="new-password" aria-label="PIN" />.
        } @else {
          I am <input class="blank" required (input)="name = val($event)" placeholder="name or email" autocomplete="username" aria-label="Name or email" />,
          and my PIN is <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="current-password" aria-label="PIN" />.
        }
      </p>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit">{{ setup() ? 'Begin publication' : up() ? 'Enrol me' : 'Deliver my paper' }}</button>
      @if (!setup() && api.status()?.signup_open) { <button type="button" class="quiet" (click)="up.set(!up())">{{ up() ? 'I am already a reader' : 'I am new here' }}</button> }
    </form>
  `,
})
export class Subscribe {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly up = signal(false);
  readonly error = signal('');
  readonly setup = computed(() => !!this.api.status()?.setup_needed);
  name = '';
  email = '';
  pin = '';
  code = '';

  async go(e: Event): Promise<void> {
    e.preventDefault();
    this.error.set('');
    try {
      if (this.setup()) await this.api.setup(this.name, this.email, this.pin, this.code);
      else if (this.up()) await this.api.signUp(this.name, this.email, this.pin);
      else await this.api.signIn(this.name, this.pin);
      await this.api.refresh();
      await this.router.navigateByUrl('/');
    } catch (err) {
      this.error.set(problem(err));
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

function nextSaturday(): number {
  const d = new Date();
  d.setDate(d.getDate() + (((6 - d.getDay() + 7) % 7) || 7));
  d.setHours(19, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}
