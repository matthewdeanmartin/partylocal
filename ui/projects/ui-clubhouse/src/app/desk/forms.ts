import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EventKind, EventView, fromLocalInput, GroupView, KIND_INFO, Me, Module, MODULE_LABEL, toLocalInput } from 'party-core';
import { Api, blankDraft, draftFrom, EventDraft, hostable, loadHouseholds, loadOverview, problem, saveEvent, withKind } from 'party-ng';
import { Theme } from '../theme';
import { View } from '../view';

/**
 * A new or edited event, as one paragraph with blanks: filling it in is
 * the form, and the paragraph is also the preview. ?start= prefills the
 * time (from the calendar), ?group= the group, ?edit= an event to change.
 */
@Component({
  selector: 'ch-new-event',
  template: `
    @let L = theme.t();
    @let P = L.press;
    <h1 class="section-head">{{ editId() ? P.editTitle : P.title }}</h1>
    <p class="standfirst">{{ editId() ? P.editLede : P.lede }}</p>
    @if (!editId() && !groups().length && loaded()) { <p class="stop">{{ P.noGroups }}</p> }
    @let d = draft();
    <form class="slip press" (submit)="send($event)">
      <p class="madlib">
        @if (!editId()) {
          {{ P.lead }} <select class="blank" [value]="group()" (change)="group.set(+val($event))" aria-label="Group">@for (g of groups(); track g.id) { <option [value]="g.id" [selected]="g.id === group()">{{ g.name }}</option> }</select>
          {{ P.announces }}
          <select class="blank" [value]="d.kind" (change)="kind($any(val($event)))" aria-label="Kind">@for (k of kinds; track k) { <option [value]="k" [selected]="d.kind === k">{{ P.kinds[k] }}</option> }</select>
          {{ P.called }}
        } @else { {{ P.calledEdit }} }
        “<input class="blank wide title" required maxlength="80" [value]="d.title" (input)="set({ title: val($event) })" [placeholder]="P.titleHint" aria-label="Title" />”,
        @if (polling()) {
          {{ P.pollLead }}
          @for (o of d.when; track $index; let last = $last) {
            <input class="blank" type="datetime-local" [value]="local(o.start)" (change)="option($index, val($event))" aria-label="Possible time" />@if (d.when.length > 2) { <button type="button" class="tiny" (click)="drop($index)" aria-label="Remove">✕</button> }{{ last ? '' : P.or }}
          }
          <button type="button" class="tiny" (click)="addOption()" [disabled]="d.when.length >= 6">{{ P.anotherTime }}</button>,
        } @else {
          {{ P.on }} <input class="blank" type="datetime-local" required [value]="local(d.start)" (change)="start(val($event))" aria-label="Starts" />
          {{ P.until }} <input class="blank" type="time" [value]="hm(d.end)" (change)="end(val($event))" aria-label="Ends" />@if (!editId()) {,
            <select class="blank" [value]="d.repeat" (change)="set({ repeat: $any(val($event)) })" aria-label="Repeats"><option value="">{{ P.repeat.once }}</option><option value="weekly">{{ P.repeat.weekly }}</option><option value="monthly-nth">{{ P.repeat.nth }}</option><option value="monthly-date">{{ P.repeat.date }}</option></select>
          },
        }
        <select class="blank" [value]="d.where_kind" (change)="set({ where_kind: $any(val($event)) })" aria-label="Where"><option value="place">{{ P.where.place }}</option><option value="home">{{ P.where.home }}</option><option value="tbd">{{ P.where.tbd }}</option></select>
        @if (d.where_kind === 'place') { <input class="blank wide" [value]="d.place" (input)="set({ place: val($event) })" [placeholder]="P.placeHint" aria-label="Place" /> }
        @if (d.where_kind === 'home') { <select class="blank" [value]="d.home" (change)="set({ home: +val($event) })" aria-label="Household"><option value="0">{{ P.whichHome }}</option>@for (h of homes(); track h.id) { <option [value]="h.id" [selected]="h.id === d.home">{{ h.name }}</option> }</select> }
        @if (d.where_kind !== 'tbd') { (<input class="blank" [value]="d.address" (input)="set({ address: val($event) })" [placeholder]="P.addressHint" aria-label="Address" />) }.
        {{ P.places }}
        <select class="blank" [value]="d.capacity ? 'limited' : 'unlimited'" (change)="set({ capacity: val($event) === 'limited' ? d.capacity || 12 : 0 })" aria-label="Capacity"><option value="unlimited">{{ P.placesUnlimited }}</option><option value="limited">{{ P.placesLimited }}</option></select>
        @if (d.capacity) { <input class="blank short" type="number" min="1" max="2000" [value]="d.capacity" (input)="set({ capacity: +val($event) })" aria-label="Places" /> {{ P.persons }} }.
        {{ P.eachMay }}
        <select class="blank" [value]="guests()" (change)="setGuests(val($event))" aria-label="Guests"><option value="none">{{ P.guests.none }}</option><option value="1">{{ P.guests.one }}</option><option value="2">{{ P.guests.two }}</option><option value="3">{{ P.guests.three }}</option><option value="unlimited">{{ P.guests.any }}</option></select>.
        @if (has('bring')) { {{ P.bringLead }} <input class="blank wide" [value]="bringText()" (change)="setBring(val($event))" [placeholder]="P.bringHint" aria-label="Bring list" />. }
        @if (has('cost')) { {{ P.costLead }} <input class="blank" [value]="d.cost" (input)="set({ cost: val($event) })" [placeholder]="P.costHint" aria-label="Cost" />. }
        @if (has('diet')) { {{ P.dietLead }} “<input class="blank wide" [value]="d.diet_prompt" (input)="set({ diet_prompt: val($event) })" [placeholder]="P.dietHint" aria-label="Diet question" />” }
        @if (has('questions')) { {{ P.askLead }} “<input class="blank wide" [value]="d.questions[0]?.prompt ?? ''" (input)="question(val($event))" [placeholder]="P.askHint" aria-label="Question" />” }
        @if (has('link')) { {{ P.linkLead }} <input class="blank wide" type="url" [value]="d.link" (input)="set({ link: val($event) })" placeholder="https://…" aria-label="Link" />. }
      </p>
      <p class="madlib small">{{ P.particulars }}</p>
      <textarea class="blank-area" rows="4" [value]="d.about" (input)="set({ about: val($event) })" [placeholder]="P.particularsHint" aria-label="About"></textarea>
      <fieldset class="extras">
        <legend>{{ P.alsoPrint }}</legend>
        @for (m of optional; track m) { <label class="inline-check"><input type="checkbox" [checked]="has(m)" (change)="flip(m)" />{{ moduleLabel[m].toLowerCase() }}</label> }
      </fieldset>
      <label class="inline-check"><input type="checkbox" [checked]="d.draft" (change)="set({ draft: !d.draft })" [disabled]="!!editId() && !wasDraft" /> {{ P.hold }}</label>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit" [disabled]="busy() || (!editId() && !groups().length)">{{ editId() ? P.sendEdit : P.send }}</button>
    </form>
  `,
})
export class NewEvent implements OnInit {
  readonly groupSlug = input('', { alias: 'group' });
  readonly editId = input('', { alias: 'edit' });
  readonly startAt = input('', { alias: 'start' });
  readonly theme = inject(Theme);
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
      } else if (Number(this.startAt())) {
        this.draft.set(blankDraft('party', Number(this.startAt())));
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

/** Starting a group, as a sentence. */
@Component({
  selector: 'ch-new-group',
  template: `
    @let F = theme.t().found;
    <h1 class="section-head">{{ F.title }}</h1>
    <form class="slip" (submit)="send($event)">
      <p class="madlib">
        {{ F.lead }} <input class="blank wide title" required maxlength="60" [value]="name()" (input)="name.set(val($event))" [placeholder]="F.nameHint" aria-label="Name" />,
        <select class="blank" (change)="kind = val($event)" aria-label="Kind"><option value="club">{{ F.kinds.club }}</option><option value="circle" selected>{{ F.kinds.circle }}</option><option value="one-off">{{ F.kinds.oneoff }}</option></select>,
        {{ F.purpose }} <input class="blank wide" (input)="about = val($event)" [placeholder]="F.purposeHint" aria-label="About" />.
        {{ F.knownTo }}
        <select class="blank" (change)="visibility = val($event)" aria-label="Visibility"><option value="public">{{ F.vis.public }}</option><option value="unlisted" selected>{{ F.vis.unlisted }}</option><option value="private">{{ F.vis.private }}</option></select>,
        {{ F.joining }}
        <select class="blank" (change)="join = val($event)" aria-label="Joining"><option value="open">{{ F.joins.open }}</option><option value="approval" selected>{{ F.joins.approval }}</option><option value="invite">{{ F.joins.invite }}</option></select>.
      </p>
      <p class="sign">{{ F.signed }} <i>{{ api.me()?.display_name }}</i></p>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit">{{ F.send }}</button>
    </form>
  `,
})
export class NewGroup {
  readonly api = inject(Api);
  readonly theme = inject(Theme);
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
      await this.router.navigate(['/groups', g.slug]);
    } catch (err) {
      this.error.set(problem(err));
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}

/** Your profile, PIN, the look (theme) and the phone view. */
@Component({
  selector: 'ch-profile',
  template: `
    @let P = theme.t().profile;
    <h1 class="section-head">{{ P.title }}</h1>
    @if (me(); as m) {
      <form class="slip" (submit)="save($event)">
        <p class="madlib">
          {{ P.nameLead }} <input class="blank" [value]="m.display_name" (input)="change['display_name'] = val($event)" aria-label="Name" />.
          {{ P.emailLead }} <input class="blank wide" type="email" [value]="m.email" (input)="change['email'] = val($event)" [placeholder]="P.emailHint" aria-label="Email" />,
          {{ P.notifyLead }} <select class="blank" [value]="m.email_notify ? 'yes' : 'no'" (change)="change['email_notify'] = val($event) === 'yes'" aria-label="Email notifications"><option value="yes">{{ P.notify.yes }}</option><option value="no">{{ P.notify.no }}</option></select> {{ P.notifyTail }}
          {{ P.listedLead }}
          <select class="blank" [value]="m.discoverable" (change)="change['discoverable'] = val($event)" aria-label="Who can find me"><option value="public">{{ P.listed.public }}</option><option value="members">{{ P.listed.members }}</option><option value="nobody">{{ P.listed.nobody }}</option></select>.
          {{ P.bioLead }} <input class="blank wide" maxlength="280" [value]="m.bio" (input)="change['bio'] = val($event)" [placeholder]="P.bioHint" aria-label="About me" />.
        </p>
        @if (P.signOff) { <p class="sign">{{ P.signOff }} <i>{{ m.display_name }}</i>{{ m.household_name ? ', ' + m.household_name : '' }}</p> }
        <button type="submit">{{ P.send }}</button>
      </form>
      <form class="slip" (submit)="pin($event)">
        <p class="madlib">{{ P.pinLead }} <input class="blank short" type="password" inputmode="numeric" autocomplete="current-password" (input)="pinNow = val($event)" aria-label="Current PIN" />
          {{ P.pinTail }} <input class="blank short" type="password" inputmode="numeric" autocomplete="new-password" (input)="pinNew = val($event)" aria-label="New PIN" />.</p>
        <button type="submit">{{ P.pinSend }}</button>
      </form>
      @if (msg()) { <p [class.stop]="bad()" [class.received]="!bad()">{{ msg() }}</p> }
      <section class="slip settings">
        <p class="madlib small">{{ P.look }}
          @for (t of theme.all; track t.name) { <label class="inline-check"><input type="radio" name="theme" [checked]="theme.name() === t.name" (change)="theme.set(t.name)" />{{ t.label }}</label> }</p>
        <p class="madlib small">{{ P.view }} <button type="button" class="tiny" (click)="view.toPhone()">{{ P.phone }}</button></p>
        <p class="madlib small">{{ P.leaving }} <button type="button" class="tiny" (click)="signOut()">{{ P.signOut }}</button></p>
      </section>
    }
  `,
})
export class Profile implements OnInit {
  readonly theme = inject(Theme);
  readonly view = inject(View);
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
      return this.theme.t().profile.saved;
    });
  }

  async pin(e: Event): Promise<void> {
    e.preventDefault();
    await this.run(async () => {
      await this.api.send('PUT', '/api/v1/me/pin', { current: this.pinNow, pin: this.pinNew }, 'Done');
      return this.theme.t().profile.pinSaved;
    });
  }

  async signOut(): Promise<void> {
    await this.api.signOut();
    await this.router.navigateByUrl('/signin');
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

/** Sign in, sign up or set up the board, as a sentence. */
@Component({
  selector: 'ch-signin',
  imports: [RouterLink],
  template: `
    @let S = theme.t().signin;
    <h1 class="section-head">{{ setup() ? S.setupTitle : S.title }}</h1>
    <p class="standfirst">{{ setup() ? S.setupLede : S.lede }}</p>
    <form class="slip" (submit)="go($event)">
      <p class="madlib">
        @if (setup()) {
          {{ S.setupLead }} <input class="blank" required (input)="name = val($event)" placeholder="name" autocomplete="name" aria-label="Name" />,
          {{ S.setupReach }} <input class="blank wide" type="email" (input)="email = val($event)" placeholder="(optional)" aria-label="Email" />.
          {{ S.setupPin }} <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="new-password" aria-label="PIN" />.
          @if (api.status()?.setup_code_required) { {{ S.setupCode }} <input class="blank" required (input)="code = val($event)" aria-label="Setup code" />. }
        } @else if (up()) {
          {{ S.newLead }} <input class="blank" required (input)="name = val($event)" placeholder="name" autocomplete="name" aria-label="Name" />,
          {{ S.newReach }} <input class="blank wide" type="email" (input)="email = val($event)" placeholder="(optional)" aria-label="Email" />,
          {{ S.newPin }} <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="new-password" aria-label="PIN" />.
        } @else {
          {{ S.iAm }} <input class="blank" required (input)="name = val($event)" placeholder="name or email" autocomplete="username" aria-label="Name or email" />,
          {{ S.pinIs }} <input class="blank short" type="password" inputmode="numeric" required (input)="pin = val($event)" autocomplete="current-password" aria-label="PIN" />.
        }
      </p>
      @if (error()) { <p class="stop">{{ error() }}</p> }
      <button type="submit">{{ setup() ? S.goSetup : up() ? S.goNew : S.go }}</button>
      @if (!setup() && api.status()?.signup_open) { <button type="button" class="quiet" (click)="up.set(!up())">{{ up() ? S.toOld : S.toNew }}</button> }
    </form>
    @if (!setup() && (api.status()?.providers?.length || api.status()?.mail)) { <p class="small"><a routerLink="/signin/more">{{ theme.t().moreSignIn }}</a></p> }
  `,
})
export class SignIn {
  readonly api = inject(Api);
  readonly theme = inject(Theme);
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
