import { Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import {
  EventSummary, EventView, GroupView, KIND_INFO, Me, NOTICE_TEXT, NoticeView, PersonView, ROLE_LABEL, STATUS_LABEL, blankAnswer, headline, when,
} from 'party-core';
import {
  Api, EventPage, GroupPage, answerEvent, blankDraft, draftFrom, hostable, joinGroup, leaveGroup, loadEvent, loadGroup, loadNotices,
  loadOverview, loadPeople, markRead, problem, relative, saveEvent,
} from 'party-ng';
import { answerBuffer, eventBuffer, groupBuffer, meBuffer, parseBuffer, readAnswer, readEvent, readMe, stamp } from './buffer';
import { Login } from './login';

type Tab = 'events' | 'groups' | 'people' | 'inbox' | 'me';
type Editor = { kind: 'new-event' | 'edit-event' | 'answer' | 'me' | 'new-group'; file: string; text: string; ctx?: EventView; errors: { line: number; message: string }[]; dirty: boolean };
type Hit = { label: string; hint: string; run: () => void };

const TABS: Tab[] = ['events', 'groups', 'people', 'inbox', 'me'];
const HELP = `party terminal: keys
  1-5        switch buffer: events groups people inbox me
  j k ↓ ↑    move          gg G   top / bottom
  enter      events: answer (a) · groups: show its events
  y m n      answer going / maybe / no
  a          answer in an editor (guests, bring list, questions…)
  e          edit the event (hosts)     c   new event     C   new group
  J  L       join / leave the group
  p          past events on/off         r   reload
  /          filter the list            :   command line
  ctrl-k     palette: jump to anything  ?   this help
editor
  ctrl-s or :w   save         :q   drop it        :wq  save and close
  esc            leave the text (then : commands)
commands
  :going [+N]  :maybe  :no  :answer  :edit  :cancel  :lock N
  :new [event|group] [group]  :join [group]  :leave  :open e12
  :read  :me  :signout  :help`;

@Component({
  selector: 'party-root',
  imports: [Login],
  template: `
    @if (!api.ready()) {
      <pre class="boot">party: connecting to the board…</pre>
    } @else if (!api.status()) {
      <pre class="boot err">party: the board is not responding. Is it on, and are you on the home Wi-Fi?</pre>
    } @else if (api.status()!.setup_needed || !api.me()) {
      <term-login (done)="load()" />
    } @else {
      <header class="status">
        @for (t of tabs; track t; let i = $index) {
          <button type="button" [class.on]="tab() === t" (click)="go(t)"><kbd>{{ i + 1 }}</kbd>{{ t }}@if (t === 'inbox' && unread()) { <b>{{ unread() }}</b> }</button>
        }
        <span class="fill"></span>
        <span class="who">{{ api.me()!.display_name.toLowerCase().replace(' ', '.') }}&#64;{{ (api.status()!.instance || 'party').replace(' ', '') }}</span>
        <span class="dim">{{ clock() }}</span>
      </header>
      <div class="panes">
        <section class="list" [attr.aria-label]="tab()">
          <div class="title">{{ listTitle() }}@if (filter()) { <span class="dim"> /{{ filter() }}</span> }</div>
          @for (row of rows(); track row.key; let i = $index) {
            <div class="row" [class.cur]="i === cursor()" (click)="cursor.set(i)" (dblclick)="enter()">
              <span class="ptr">{{ i === cursor() ? '>' : ' ' }}</span>
              @for (c of row.cols; track $index) { <span [class]="c.cls">{{ c.text }}</span> }
            </div>
          } @empty {
            <div class="row dim">  (empty)</div>
          }
        </section>
        <section class="detail">
          @if (editor(); as ed) {
            <div class="title">{{ ed.file }}{{ ed.dirty ? ' [+]' : '' }}</div>
            <div class="editor">
              <pre class="gutter" aria-hidden="true">@for (l of lines(); track $index) {<span [class.bad]="badLine($index + 1)">{{ ($index + 1).toString().padStart(3) }}</span>
}</pre>
              <textarea #box spellcheck="false" [value]="ed.text" (input)="edit($any($event.target).value)" (keydown)="editorKey($event)" aria-label="Editor"></textarea>
            </div>
            @for (e of ed.errors; track $index) { <div class="err">E{{ e.line }}: line {{ e.line }}: {{ e.message }}</div> }
          } @else if (showHelp()) {
            <div class="title">help</div><pre class="man">{{ help }}</pre>
          } @else {
            <div class="title">{{ detailTitle() }}</div>
            <pre class="man">{{ detail() }}</pre>
          }
        </section>
      </div>
      <footer class="cmd">
        @if (cmdOpen()) {
          <form (submit)="runCmd($event)"><span>{{ cmdKind() }}</span><input #cmd [value]="cmdText()" (input)="cmdText.set($any($event.target).value)" (keydown.escape)="closeCmd()" aria-label="Command" autocomplete="off" spellcheck="false" /></form>
        } @else {
          <span class="msg" [class.err]="msgBad()">{{ msg() }}</span>
          <span class="mode">{{ editor() ? '-- INSERT --  ctrl-s :w :q' : '-- NORMAL --  ? help  ctrl-k jump' }}</span>
        }
      </footer>
      @if (palette()) {
        <div class="palette-scrim" (click)="palette.set(false)"></div>
        <div class="palette" role="dialog" aria-label="Jump to">
          <input #pal placeholder="jump to an event, group, person or command…" [value]="palQ()" (input)="palQ.set($any($event.target).value); palI.set(0)" (keydown)="palKey($event)" spellcheck="false" />
          @for (h of hits(); track $index; let i = $index) {
            <div class="hit" [class.cur]="i === palI()" (click)="pick(h)"><span>{{ h.label }}</span><span class="dim">{{ h.hint }}</span></div>
          } @empty { <div class="hit dim">no match</div> }
        </div>
      }
    }
  `,
})
export class App implements OnInit {
  readonly api = inject(Api);
  readonly tabs = TABS;
  readonly help = HELP;
  readonly tab = signal<Tab>('events');
  readonly cursor = signal(0);
  readonly filter = signal('');
  readonly past = signal(false);
  readonly events = signal<EventSummary[]>([]);
  readonly pastEvents = signal<EventSummary[]>([]);
  readonly groups = signal<GroupView[]>([]);
  readonly people = signal<PersonView[]>([]);
  readonly notices = signal<NoticeView[]>([]);
  readonly me = signal<Me | null>(null);
  readonly groupFilter = signal<GroupView | null>(null);
  readonly page = signal<EventPage | GroupPage | null>(null);
  readonly editor = signal<Editor | null>(null);
  readonly showHelp = signal(false);
  readonly msg = signal('');
  readonly msgBad = signal(false);
  readonly cmdOpen = signal(false);
  readonly cmdKind = signal<':' | '/'>(':');
  readonly cmdText = signal('');
  readonly palette = signal(false);
  readonly palQ = signal('');
  readonly palI = signal(0);
  readonly clock = signal(time());
  private lastKey = '';
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private readonly cmd = viewChild<ElementRef<HTMLInputElement>>('cmd');
  private readonly pal = viewChild<ElementRef<HTMLInputElement>>('pal');

  readonly unread = computed(() => this.notices().filter((n) => !n.read).length);
  readonly lines = computed(() => (this.editor()?.text ?? '').split('\n'));
  readonly listTitle = computed(() => {
    const t = this.tab();
    if (t === 'events') return `~/events${this.groupFilter() ? '/' + this.groupFilter()!.slug : ''}${this.past() ? ' (past)' : ''}`;
    return `~/${t}`;
  });

  /** The list's rows as columns, whatever the tab. */
  readonly rows = computed(() => {
    const f = this.filter().toLowerCase();
    const match = (s: string) => !f || s.toLowerCase().includes(f);
    const t = this.tab();
    if (t === 'events') {
      const g = this.groupFilter();
      return (this.past() ? this.pastEvents() : this.events())
        .filter((e) => (!g || e.group === g.id) && match(`${e.title} ${e.group_name}`))
        .map((e) => ({
          key: `e${e.id}`, id: e.id,
          cols: [
            { text: `E${e.id}`.padEnd(5), cls: 'dim' },
            { text: (e.polling ? 'poll        ' : short(e.start)).padEnd(13), cls: 'num' },
            { text: (e.status === 'cancelled' ? '✗ ' : '') + e.title, cls: e.status === 'cancelled' ? 'grow strike' : 'grow' },
            { text: e.group_name.slice(0, 16).padEnd(17), cls: 'dim hide-narrow' },
            { text: `[${(e.my_status || '----').padEnd(8)}]`, cls: `st-${e.my_status || 'none'}` },
          ],
        }));
    }
    if (t === 'groups') {
      return this.groups().filter((g) => match(`${g.name} ${g.about}`)).map((g) => ({
        key: `g${g.id}`, id: g.id,
        cols: [
          { text: (g.my_role ? g.my_role.slice(0, 5) : g.my_status === 'requested' ? 'asked' : '-').padEnd(6), cls: g.my_status ? 'ok' : 'dim' },
          { text: g.name, cls: 'grow' },
          { text: `${g.members}`.padStart(3) + ' members', cls: 'dim' },
          { text: g.visibility.padStart(9), cls: 'dim hide-narrow' },
        ],
      }));
    }
    if (t === 'people') {
      return this.people().filter((p) => match(p.display_name)).map((p) => ({
        key: `p${p.id}`, id: p.id, cols: [{ text: p.display_name.padEnd(20), cls: '' }, { text: p.household_name || '', cls: 'dim grow' }],
      }));
    }
    if (t === 'inbox') {
      return this.notices().filter((n) => match(noticeText(n))).map((n) => ({
        key: `n${n.id}`, id: n.event,
        cols: [{ text: n.read ? ' ' : '●', cls: 'ok' }, { text: relative(n.created).padEnd(14), cls: 'dim' }, { text: noticeText(n), cls: 'grow' }],
      }));
    }
    return ['profile', 'change pin', 'sign out'].map((x, i) => ({ key: x, id: i, cols: [{ text: x, cls: 'grow' }] }));
  });

  readonly detailTitle = computed(() => {
    const p = this.page();
    if (this.tab() === 'me') return 'man me';
    if (p && 'view' in p) return `man E${p.view.event.id}`;
    if (p && 'group' in p) return `man ${p.group.slug}`;
    return '';
  });

  /** The selected thing, as a man page. */
  readonly detail = computed(() => {
    const p = this.page();
    if (this.tab() === 'me') {
      const m = this.me();
      return m ? [`NAME\n    ${m.display_name} (${m.role})`, `EMAIL\n    ${m.email || '-'}`, `HOME\n    ${m.household_name || '-'}`, `ABOUT\n    ${m.bio || '-'}`, `FOUND BY\n    ${m.discoverable}`, `\nenter: edit   :signout`].join('\n\n') : '';
    }
    if (this.tab() === 'people') {
      const person = this.people().find((x) => x.id === this.rows()[this.cursor()]?.id);
      return person ? `NAME\n    ${person.display_name}\n\nHOUSEHOLD\n    ${person.household_name || '-'}\n\nABOUT\n    ${person.bio || '-'}` : '';
    }
    if (p && 'view' in p) return eventMan(p);
    if (p && 'group' in p) return groupMan(p);
    return this.tab() === 'inbox' ? '' : '(nothing selected)';
  });

  /** Palette matches: everything known, plus commands. */
  readonly hits = computed<Hit[]>(() => {
    const q = this.palQ().toLowerCase().trim();
    const all: Hit[] = [
      ...this.events().map((e) => ({ label: `E${e.id} ${e.title}`, hint: `${short(e.start)} · ${e.group_name}`, run: () => this.openEvent(e.id) })),
      ...this.groups().map((g) => ({ label: g.name, hint: `group · ${g.slug}`, run: () => this.openGroup(g.id) })),
      ...this.people().map((p) => ({ label: p.display_name, hint: 'person', run: () => this.openPerson(p.id) })),
      ...[':new event', ':new group', ':read', ':me', ':help', ':signout', ':past'].map((c) => ({ label: c, hint: 'command', run: () => this.command(c.slice(1)) })),
    ];
    const words = q.split(/\s+/).filter(Boolean);
    return all.filter((h) => words.every((w) => `${h.label} ${h.hint}`.toLowerCase().includes(w))).slice(0, 12);
  });

  constructor() {
    setInterval(() => this.clock.set(time()), 30_000);
    // The detail follows the cursor.
    effect(() => {
      const row = this.rows()[this.cursor()];
      const tab = this.tab();
      untracked(() => void this.loadDetail(tab, row?.id ?? 0));
    });
    effect(() => {
      if (this.editor()) setTimeout(() => this.box()?.nativeElement.focus());
    });
  }

  async ngOnInit(): Promise<void> {
    await this.api.refresh().catch(() => undefined);
    if (this.api.me()) await this.load();
  }

  async load(): Promise<void> {
    try {
      const [o, past, people, notices, me] = await Promise.all([
        loadOverview(this.api),
        this.api.get<{ events: EventSummary[] }>('/api/v1/events?past=1', 'EventList'),
        loadPeople(this.api),
        loadNotices(this.api),
        this.api.get<Me>('/api/v1/auth/me', 'Me'),
      ]);
      this.events.set(o.upcoming);
      this.pastEvents.set(past.events);
      this.groups.set([...o.mine, ...o.others]);
      this.people.set(people);
      this.notices.set(notices);
      this.me.set(me);
      if (!this.msg()) this.say(`${o.waiting.length} waiting for an answer · ${o.plans.length} plans · ${this.unread()} unread   (? for help)`);
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  private async loadDetail(tab: Tab, id: number): Promise<void> {
    if (!id || this.editor()) return;
    try {
      if (tab === 'events' || tab === 'inbox') this.page.set(await loadEvent(this.api, id));
      else if (tab === 'groups') {
        const g = this.groups().find((x) => x.id === id);
        if (g) this.page.set(await loadGroup(this.api, g.slug));
      } else this.page.set(null);
    } catch {
      this.page.set(null);
    }
  }

  say(text: string, bad = false): void {
    this.msg.set(text);
    this.msgBad.set(bad);
  }

  go(t: Tab): void {
    this.tab.set(t);
    this.cursor.set(0);
    this.filter.set('');
    this.showHelp.set(false);
    if (t !== 'events') this.groupFilter.set(null);
  }

  private selectedEvent(): EventView | null {
    const p = this.page();
    return p && 'view' in p ? p.view : null;
  }

  private selectedGroup(): GroupView | null {
    if (this.tab() === 'groups') return this.groups().find((g) => g.id === this.rows()[this.cursor()]?.id) ?? null;
    return this.groupFilter();
  }

  // ---- keys -----------------------------------------------------------------

  @HostListener('document:keydown', ['$event'])
  key(e: KeyboardEvent): void {
    if (!this.api.me()) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'p')) {
      e.preventDefault();
      this.openPalette();
      return;
    }
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const two = this.lastKey + k;
    this.lastKey = k;
    const n = this.rows().length;
    if (k === 'Escape') {
      this.showHelp.set(false);
      this.filter.set('');
      if (this.editor() && !this.editor()!.dirty) this.editor.set(null);
      return;
    }
    if (this.editor() && k !== ':' && k !== 'i') return;
    if (/^[1-5]$/.test(k)) this.go(TABS[Number(k) - 1]);
    else if (k === 'j' || k === 'ArrowDown') this.cursor.set(Math.min(n - 1, this.cursor() + 1));
    else if (k === 'k' || k === 'ArrowUp') this.cursor.set(Math.max(0, this.cursor() - 1));
    else if (two === 'gg') this.cursor.set(0);
    else if (k === 'G') this.cursor.set(Math.max(0, n - 1));
    else if (k === 'Enter') this.enter();
    else if (k === 'i' && this.editor()) this.box()?.nativeElement.focus();
    else if (k === 'y') void this.quick('going');
    else if (k === 'm') void this.quick('maybe');
    else if (k === 'n') void this.quick('no');
    else if (k === 'a') this.openAnswer();
    else if (k === 'e') void this.openEdit();
    else if (k === 'c') void this.openNew();
    else if (k === 'C') this.openNewGroup();
    else if (k === 'J') void this.membership('join');
    else if (k === 'L') void this.membership('leave');
    else if (k === 'p') this.past.set(!this.past());
    else if (k === 'r') void this.load().then(() => this.say('reloaded'));
    else if (k === '?') this.showHelp.set(!this.showHelp());
    else if (k === ':' || k === '/') {
      e.preventDefault();
      this.openCmd(k);
    } else return;
    e.preventDefault();
  }

  enter(): void {
    const t = this.tab();
    if (t === 'events' || t === 'inbox') this.openAnswer();
    else if (t === 'groups') {
      const g = this.selectedGroup();
      if (g) {
        this.go('events');
        this.groupFilter.set(g);
        this.say(`events in ${g.name} (esc or :all to show everything)`);
      }
    } else if (t === 'me') {
      const r = this.cursor();
      if (r === 0) this.openMe();
      else if (r === 1) this.command('pin');
      else void this.command('signout');
    }
  }

  // ---- command line ---------------------------------------------------------

  openCmd(kind: ':' | '/'): void {
    this.cmdKind.set(kind);
    this.cmdText.set(kind === '/' ? this.filter() : '');
    this.cmdOpen.set(true);
    setTimeout(() => this.cmd()?.nativeElement.focus());
  }

  closeCmd(): void {
    this.cmdOpen.set(false);
    if (this.editor()) setTimeout(() => this.box()?.nativeElement.focus());
  }

  runCmd(e: Event): void {
    e.preventDefault();
    const text = this.cmdText().trim();
    this.cmdOpen.set(false);
    if (this.cmdKind() === '/') {
      this.filter.set(text);
      this.cursor.set(0);
      return;
    }
    if (text) void this.command(text);
  }

  async command(text: string): Promise<void> {
    const [verb, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    try {
      switch (verb) {
        case 'w':
          return void (await this.save(false));
        case 'wq':
        case 'x':
          return void (await this.save(true));
        case 'q':
        case 'q!':
          this.editor.set(null);
          return this.say('dropped');
        case 'going':
        case 'maybe':
        case 'no':
          return void (await this.quick(verb, /\+(\d+)/.exec(arg)?.[1]));
        case 'answer':
          return this.openAnswer();
        case 'edit':
          return void (await this.openEdit());
        case 'cancel':
          return void (await this.cancelEvent());
        case 'lock':
          return void (await this.lock(Number(arg)));
        case 'new':
          if (rest[0] === 'group') return this.openNewGroup();
          return void (await this.openNew(rest[rest[0] === 'event' ? 1 : 0]));
        case 'join':
        case 'leave':
          return void (await this.membership(verb, arg));
        case 'open':
        case 'o': {
          const m = /^e?(\d+)$/i.exec(arg);
          if (m) return this.openEvent(Number(m[1]));
          const g = this.groups().find((x) => x.slug === arg || x.name.toLowerCase().includes(arg.toLowerCase()));
          return g ? this.openGroup(g.id) : this.say(`E: nothing called "${arg}"`, true);
        }
        case 'all':
          this.groupFilter.set(null);
          return this.go('events');
        case 'past':
          return this.past.set(!this.past());
        case 'read':
          await markRead(this.api);
          await this.load();
          return this.say('all notifications read');
        case 'me':
          return this.openMe();
        case 'pin': {
          const current = prompt('current PIN') ?? '';
          const pin = prompt('new PIN (4-8 digits)') ?? '';
          await this.api.send('PUT', '/api/v1/me/pin', { current, pin }, 'Done');
          return this.say('PIN changed');
        }
        case 'signout':
        case 'logout':
          await this.api.signOut();
          return;
        case 'help':
        case 'h':
          return this.showHelp.set(true);
        default:
          this.say(`E492: not a command: ${verb}   (:help)`, true);
      }
    } catch (e) {
      this.say(`E: ${problem(e)}`, true);
    }
  }

  // ---- doing things ---------------------------------------------------------

  async quick(status: 'going' | 'maybe' | 'no', plus?: string): Promise<void> {
    const v = this.selectedEvent();
    if (!v) return this.say('E: select an event first', true);
    if (!v.can_answer) return this.say(v.locked ? 'E: answers are closed' : `E: join ${v.group_name} first (J on it in 2:groups)`, true);
    try {
      const after = await answerEvent(this.api, v.event.id, { ...blankAnswer(v.event, v.mine), status, ...(plus ? { plus: Number(plus) } : {}) });
      this.say(`E${v.event.id}: ${STATUS_LABEL[after.mine?.status ?? status].toLowerCase()}${after.mine?.plus ? ` +${after.mine.plus}` : ''}`);
      await this.refreshAround(v.event.id);
    } catch (e) {
      this.say(`E: ${problem(e)}`, true);
    }
  }

  openAnswer(): void {
    const v = this.selectedEvent();
    if (!v) return this.say('E: select an event first', true);
    if (!v.can_answer) return this.say(v.locked ? 'E: answers are closed' : `E: join ${v.group_name} first`, true);
    this.editor.set({ kind: 'answer', file: `answer-E${v.event.id}.party`, text: answerBuffer(v), ctx: v, errors: [], dirty: false });
  }

  async openEdit(): Promise<void> {
    const v = this.selectedEvent();
    if (!v) return this.say('E: select an event first', true);
    if (!v.can_edit) return this.say('E: only the hosts can edit this', true);
    this.editor.set({ kind: 'edit-event', file: `E${v.event.id}.party`, text: eventBuffer(draftFrom(v), `Edit "${v.event.title}" (rev ${v.event.rev})`, false), ctx: v, errors: [], dirty: false });
  }

  async openNew(slug = ''): Promise<void> {
    const mine = hostable(this.groups().filter((g) => g.my_status === 'active' || g.can_manage));
    const g = mine.find((x) => x.slug === slug) ?? (this.selectedGroup() && mine.find((x) => x.id === this.selectedGroup()!.id)) ?? mine[0];
    if (!g) return this.say("E: you can't create events in any group (C makes a group)", true);
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(19, 0, 0, 0);
    const text = `group: ${g.slug}`.padEnd(32) + `# ${mine.map((x) => x.slug).join(' ')}\n` + eventBuffer(blankDraft('generic', Math.floor(start.getTime() / 1000)), `New event`, true);
    this.editor.set({ kind: 'new-event', file: 'new-event.party', text, errors: [], dirty: false });
  }

  openNewGroup(): void {
    this.editor.set({ kind: 'new-group', file: 'new-group.party', text: groupBuffer(), errors: [], dirty: false });
  }

  openMe(): void {
    const m = this.me();
    if (m) this.editor.set({ kind: 'me', file: '~/.profile', text: meBuffer(m), errors: [], dirty: false });
  }

  edit(text: string): void {
    this.editor.update((ed) => (ed ? { ...ed, text, dirty: true, errors: [] } : ed));
  }

  editorKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void this.save(false);
    } else if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
      this.say('-- NORMAL --  :w save  :q drop  i edit');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.target as HTMLTextAreaElement;
      el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
      this.edit(el.value);
    }
  }

  badLine(n: number): boolean {
    return !!this.editor()?.errors.some((e) => e.line === n);
  }

  async save(close: boolean): Promise<void> {
    const ed = this.editor();
    if (!ed) return this.say('E32: no file to write', true);
    const fail = (errors: Editor['errors']) => {
      this.editor.set({ ...ed, errors });
      this.say(`E: ${errors.length} problem${errors.length === 1 ? '' : 's'}; see the lines in red`, true);
    };
    try {
      if (ed.kind === 'answer') {
        const { answer, errors } = readAnswer(ed.text, ed.ctx!);
        if (errors.length) return fail(errors);
        const v = await answerEvent(this.api, ed.ctx!.event.id, answer);
        this.say(`"${ed.file}" written: ${STATUS_LABEL[v.mine?.status ?? 'going'].toLowerCase()}`);
        await this.refreshAround(v.event.id);
      } else if (ed.kind === 'new-event' || ed.kind === 'edit-event') {
        const base = ed.ctx ? draftFrom(ed.ctx) : blankDraft('generic');
        const { draft, errors } = readEvent(ed.text, base);
        let group = 0;
        if (ed.kind === 'new-event') {
          const p = parseBuffer(ed.text).values.get('group');
          const g = this.groups().find((x) => x.slug === p?.value);
          if (!g) errors.push({ line: p?.line ?? 1, message: `no group "${p?.value ?? ''}"` });
          group = g?.id ?? 0;
        }
        if (errors.length) return fail(errors);
        const id = await saveEvent(this.api, draft, ed.ctx ? { id: ed.ctx.event.id, rev: ed.ctx.event.rev } : { group });
        this.say(`"${ed.file}" written: E${id}`);
        await this.load();
        this.openEvent(id);
        if (!close) {
          const v = (await loadEvent(this.api, id)).view;
          this.editor.set({ kind: 'edit-event', file: `E${id}.party`, text: eventBuffer(draftFrom(v), `Edit "${v.event.title}" (rev ${v.event.rev})`, false), ctx: v, errors: [], dirty: false });
          return;
        }
      } else if (ed.kind === 'me') {
        const { change, errors } = readMe(ed.text);
        if (errors.length) return fail(errors);
        await this.api.send('PATCH', '/api/v1/me', change, 'Me');
        await this.api.refresh();
        await this.load();
        this.say('"~/.profile" written');
      } else {
        const { values, errors } = parseBuffer(ed.text);
        if (errors.length) return fail(errors);
        const body = Object.fromEntries([...values].map(([k, v]) => [k, v.value]));
        const g = await this.api.send<GroupView>('POST', '/api/v1/groups', body, 'GroupView');
        await this.load();
        this.openGroup(g.id);
        this.say(`created ${g.slug}`);
      }
      this.editor.set(null);
    } catch (e) {
      this.say(`E: ${problem(e)}`, true);
    }
  }

  async cancelEvent(): Promise<void> {
    const v = this.selectedEvent();
    if (!v?.can_edit) return this.say('E: select an event you host', true);
    if (!confirm(`Cancel E${v.event.id} "${v.event.title}"? Everyone who answered is told.`)) return;
    await this.api.send('POST', `/api/v1/events/${v.event.id}/cancel`, undefined, 'EventView');
    this.say(`E${v.event.id} cancelled`);
    await this.refreshAround(v.event.id);
  }

  async lock(n: number): Promise<void> {
    const v = this.selectedEvent();
    const o = v?.event.when[n - 1];
    if (!v || !o) return this.say('E: :lock N picks time N of the selected poll', true);
    await this.api.send('POST', `/api/v1/events/${v.event.id}/lock`, { option: o.id }, 'EventView');
    this.say(`E${v.event.id} locked to ${when(o.start, o.end)}`);
    await this.refreshAround(v.event.id);
  }

  async membership(what: 'join' | 'leave', name = ''): Promise<void> {
    const g = name ? this.groups().find((x) => x.slug === name || x.name.toLowerCase().includes(name.toLowerCase())) : this.selectedGroup();
    if (!g) return this.say('E: select a group (2:groups)', true);
    try {
      const after = await (what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
      this.say(what === 'leave' ? `left ${g.slug}` : after.my_status === 'active' ? `joined ${g.slug}` : `asked to join ${g.slug}`);
      await this.load();
    } catch (e) {
      this.say(`E: ${problem(e)}`, true);
    }
  }

  private async refreshAround(id: number): Promise<void> {
    await this.load();
    this.page.set(await loadEvent(this.api, id).catch(() => null));
    void this.api.refreshSummary();
  }

  openEvent(id: number): void {
    this.past.set(!this.events().some((e) => e.id === id) && this.pastEvents().some((e) => e.id === id));
    this.groupFilter.set(null);
    this.tab.set('events');
    this.filter.set('');
    setTimeout(() => this.cursor.set(Math.max(0, this.rows().findIndex((r) => r.id === id))));
  }

  openGroup(id: number): void {
    this.go('groups');
    setTimeout(() => this.cursor.set(Math.max(0, this.rows().findIndex((r) => r.id === id))));
  }

  openPerson(id: number): void {
    this.go('people');
    setTimeout(() => this.cursor.set(Math.max(0, this.rows().findIndex((r) => r.id === id))));
  }

  // ---- palette --------------------------------------------------------------

  openPalette(): void {
    this.palette.set(true);
    this.palQ.set('');
    this.palI.set(0);
    setTimeout(() => this.pal()?.nativeElement.focus());
  }

  palKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) this.palI.set(Math.min(this.hits().length - 1, this.palI() + 1));
    else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) this.palI.set(Math.max(0, this.palI() - 1));
    else if (e.key === 'Enter' && this.hits()[this.palI()]) this.pick(this.hits()[this.palI()]);
    else if (e.key === 'Escape') this.palette.set(false);
    else return;
    e.preventDefault();
  }

  pick(h: Hit): void {
    this.palette.set(false);
    h.run();
  }
}

function time(): string {
  return new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function short(t: number): string {
  if (!t) return '';
  const d = new Date(t * 1000);
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function noticeText(n: NoticeView): string {
  const verb = NOTICE_TEXT[n.kind] ?? n.kind;
  return verb.endsWith(':') || !n.actor_name ? `${verb} ${n.event_title || n.group_name}` : `${n.actor_name} ${verb} ${n.event_title || n.group_name}`;
}

function eventMan(p: EventPage): string {
  const v = p.view;
  const e = v.event;
  const out = [
    `NAME\n    E${e.id} ${e.title} (${KIND_INFO[e.kind]?.label.toLowerCase() ?? e.kind}, ${e.status})`,
    `GROUP\n    ${v.group_name} (${v.group_slug})`,
    `WHEN\n    ${e.start ? `${stamp(e.start)}${e.end ? ' – ' + stamp(e.end).slice(11) : ''}   (${relative(e.start)})` : 'to be decided: a time poll'}${p.series ? `\n    ${p.series.summary}` : ''}`,
    `WHERE\n    ${e.where_kind === 'tbd' ? 'to be decided' : [e.place, e.address].filter(Boolean).join(', ') || 'a home'}`,
    `HOSTS\n    ${v.host_names.join(', ')}`,
    `COMING\n    ${headline(v.heads, e.capacity, v.maybe)}${v.waitlist ? `, ${v.waitlist} waiting` : ''}${v.mine ? `\n    you: ${v.mine.status}${v.mine.plus ? ' +' + v.mine.plus : ''}` : ''}`,
  ];
  if (e.about) out.push(`DESCRIPTION\n${e.about.split('\n').map((l) => '    ' + l).join('\n')}`);
  if (e.when.length && !e.start) out.push(`TIMES\n${e.when.map((o, i) => `    ${i + 1}) ${stamp(o.start)}  ${'█'.repeat(v.votes.find((x) => x.id === o.id)?.count ?? 0)} ${v.votes.find((x) => x.id === o.id)?.count ?? 0}`).join('\n')}${v.can_edit ? '\n    (:lock N to pick one)' : ''}`);
  if (e.bring.length) out.push(`BRING\n${e.bring.map((s) => `    ${s.name.padEnd(16)} ${v.claimed.find((c) => c.id === s.id)?.count ?? 0}/${s.count}  ${v.claimed.find((c) => c.id === s.id)?.names.join(', ') ?? ''}`).join('\n')}`);
  if (e.shifts.length) out.push(`SHIFTS\n${e.shifts.map((s) => `    ${s.name.padEnd(14)} ${stamp(s.start).slice(11)}-${stamp(s.end).slice(11)}  ${v.taken.find((c) => c.id === s.id)?.count ?? 0}/${s.count}`).join('\n')}`);
  if (e.cost) out.push(`COST\n    ${e.cost}`);
  out.push(`ANSWERS\n${p.rsvps.map((r) => `    ${r.status.padEnd(9)}${r.display_name}${r.plus ? ' +' + r.plus : ''}${r.note ? `  "${r.note}"` : ''}`).join('\n') || '    (none yet)'}`);
  out.push(`\n${v.can_answer ? 'y going  m maybe  n no  a answer…' : v.locked ? '(answers closed)' : '(join the group to answer)'}${v.can_edit ? '   e edit  :cancel' : ''}`);
  return out.join('\n\n');
}

function groupMan(p: GroupPage): string {
  const g = p.group;
  return [
    `NAME\n    ${g.name} (${g.slug})`,
    `SYNOPSIS\n    ${g.kind}, ${g.visibility}, join: ${g.join}, ${g.members} members${g.my_role ? `\n    you: ${ROLE_LABEL[g.my_role as keyof typeof ROLE_LABEL]?.toLowerCase()}` : g.my_status === 'requested' ? '\n    you: asked to join' : ''}`,
    ...(g.about ? [`DESCRIPTION\n    ${g.about}`] : []),
    `EVENTS\n${p.events.map((e) => `    E${e.id}`.padEnd(9) + `${short(e.start) || 'poll'}  ${e.title}`).join('\n') || '    (none)'}`,
    ...(p.members.length ? [`MEMBERS\n${p.members.map((m) => `    ${m.role.padEnd(13)}${m.display_name}${m.status !== 'active' ? ` (${m.status})` : ''}`).join('\n')}`] : []),
    `\nenter: its events   ${g.my_status ? 'L leave' : 'J join'}${g.can_create_events ? '   c new event' : ''}`,
  ].join('\n\n');
}
