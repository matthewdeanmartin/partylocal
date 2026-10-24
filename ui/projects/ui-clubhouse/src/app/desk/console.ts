import { Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { EventSummary, EventView, GroupView, KIND_INFO, Me, NOTICE_TEXT, NoticeView, PersonView, ROLE_LABEL, STATUS_LABEL, blankAnswer, headline, when } from 'party-core';
import {
  Api, EventPage, GroupPage, answerEvent, blankDraft, draftFrom, hostable, joinGroup, leaveGroup, loadEvent, loadGroup, loadNotices,
  loadOverview, loadPeople, markRead, problem, relative, saveEvent,
} from 'party-ng';
import { Theme } from '../theme';
import { answerBuffer, eventBuffer, groupBuffer, meBuffer, parseBuffer, readAnswer, readEvent, readMe, stamp } from './console-buffer';

type Tab = 'events' | 'groups' | 'people' | 'notices' | 'me';
type Editor = { kind: 'new-event' | 'edit-event' | 'answer' | 'me' | 'new-group'; file: string; text: string; ctx?: EventView; errors: { line: number; message: string }[]; dirty: boolean };

const TABS: { id: Tab; label: string }[] = [
  { id: 'events', label: 'Events' }, { id: 'groups', label: 'Groups' }, { id: 'people', label: 'People' }, { id: 'notices', label: 'Notifications' }, { id: 'me', label: 'Me' },
];
const HELP = `Text mode: everything with the keyboard, nothing to memorise.
The keys for what you can do are always shown at the bottom.

Moving around (like Mastodon)
  1 - 5      switch list: events, groups, people, notifications, me
  j  k       next / previous (or the arrow keys)
  Enter  r   reply to the selected event (answer it in the editor)
  /          type a command or search

Answering and organizing
  y  m  x    going / maybe / can't go
  n          new event      e   edit the event (hosts)
  J  L       join / leave the group
  p          show past events

The editor works like nano
  Ctrl-O     save (Ctrl-S works too)
  Ctrl-X     close (asks if there are unsaved changes)
  Ctrl-K     cut the line      Ctrl-U   paste it back
  Ctrl-G     this help

Commands you can type after /
  going e12     maybe e12     no e12     going e12 +2
  reply e12     new event     new group  join book club
  open e12      search <words>           help`;

/**
 * Text mode: a two-pane, keyboard-first view for people who like it, with
 * every key shown on screen and a nano-style editor for the forms.
 */
@Component({
  selector: 'ch-console',
  template: `
    <div class="console">
      <header class="status">
        @for (t of tabs; track t.id; let i = $index) {
          <button type="button" [class.on]="tab() === t.id" (click)="go(t.id)"><kbd>{{ i + 1 }}</kbd>{{ t.label }}@if (t.id === 'notices' && unread()) { <b>{{ unread() }}</b> }</button>
        }
        <span class="fill"></span>
        <span class="who">{{ api.me()?.display_name }}</span>
      </header>
      <div class="panes">
        <section class="list" [attr.aria-label]="tab()">
          <div class="title">{{ listTitle() }}@if (filter()) { <span class="dim"> · matching “{{ filter() }}”</span> }</div>
          @for (row of rows(); track row.key; let i = $index) {
            <div class="row" [class.cur]="i === cursor()" (click)="cursor.set(i)" (dblclick)="enter()">
              <span class="ptr">{{ i === cursor() ? '▶' : ' ' }}</span>
              @for (c of row.cols; track $index) { <span [class]="c.cls">{{ c.text }}</span> }
            </div>
          } @empty {
            <div class="row dim">  (nothing here)</div>
          }
        </section>
        <section class="detail">
          @if (editor(); as ed) {
            <div class="nano-title"><span>party nano</span><span>{{ ed.file }}</span><span>{{ ed.dirty ? 'Modified' : '' }}</span></div>
            <div class="editor">
              <pre class="gutter" aria-hidden="true">@for (l of lines(); track $index) {<span [class.bad]="badLine($index + 1)">{{ ($index + 1).toString().padStart(3) }}</span>
}</pre>
              <textarea #box spellcheck="false" [value]="ed.text" (input)="edit($any($event.target).value)" (keydown)="editorKey($event)" aria-label="Editor"></textarea>
            </div>
            @for (e of ed.errors; track $index) { <div class="err">line {{ e.line }}: {{ e.message }}</div> }
          } @else if (showHelp()) {
            <div class="title">help</div><pre class="man">{{ help }}</pre>
          } @else {
            <div class="title">{{ detailTitle() }}</div>
            @if (actions().length) {
              <div class="actions-bar">
                @for (a of actions(); track a.key) { <button type="button" (click)="a.run()"><kbd>{{ a.key }}</kbd> {{ a.label }}</button> }
              </div>
            }
            <pre class="man">{{ detail() }}</pre>
          }
        </section>
      </div>
      <footer class="cmd">
        <form (submit)="runCmd($event)"><span>›</span><input #cmd [value]="cmdText()" (input)="cmdText.set($any($event.target).value)" (keydown.escape)="blurCmd()" placeholder="type a command, e.g. going e12, or words to search (press / to start)" aria-label="Command" autocomplete="off" spellcheck="false" /></form>
        <p class="msg" [class.err]="msgBad()">{{ msg() }}</p>
        <nav class="keys" aria-label="Keys">
          @for (k of keys(); track k[0]) { <span><kbd>{{ k[0] }}</kbd> {{ k[1] }}</span> }
        </nav>
      </footer>
    </div>
  `,
})
export class Console implements OnInit {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly theme = inject(Theme);
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
  readonly cmdText = signal('');
  private clip = '';
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private readonly cmd = viewChild.required<ElementRef<HTMLInputElement>>('cmd');

  readonly unread = computed(() => this.notices().filter((n) => !n.read).length);
  readonly lines = computed(() => (this.editor()?.text ?? '').split('\n'));
  readonly listTitle = computed(() => {
    const t = this.tab();
    if (t === 'events') return `Events${this.groupFilter() ? ' in ' + this.groupFilter()!.name : ''}${this.past() ? ' (past)' : ''}`;
    return TABS.find((x) => x.id === t)!.label;
  });

  /** The keys that do something right now, nano-style, always on screen. */
  readonly keys = computed<[string, string][]>(() => {
    if (this.editor()) return [['^O', 'Save'], ['^X', 'Close'], ['^K', 'Cut line'], ['^U', 'Paste'], ['^G', 'Help']];
    const base: [string, string][] = [['j/k', 'Move'], ['1-5', 'Lists'], ['/', 'Command'], ['?', 'Help']];
    if (this.tab() === 'events' || this.tab() === 'notices') return [['r', 'Reply'], ['y', 'Going'], ['m', 'Maybe'], ['x', "Can't"], ['n', 'New'], ...base];
    if (this.tab() === 'groups') return [['Enter', 'Its events'], ['J', 'Join'], ['L', 'Leave'], ['n', 'New event'], ...base];
    if (this.tab() === 'me') return [['Enter', 'Edit'], ...base];
    return base;
  });

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
            { text: (e.polling ? 'vote on time' : short(e.start)).padEnd(13), cls: 'num' },
            { text: (e.status === 'cancelled' ? '✗ ' : '') + e.title, cls: e.status === 'cancelled' ? 'grow strike' : 'grow' },
            { text: e.group_name.slice(0, 16).padEnd(17), cls: 'dim hide-narrow' },
            { text: (STATUS_LABEL[e.my_status as keyof typeof STATUS_LABEL] ?? 'not answered').padEnd(12), cls: `st-${e.my_status || 'none'}` },
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
        ],
      }));
    }
    if (t === 'people') {
      return this.people().filter((p) => match(p.display_name)).map((p) => ({
        key: `p${p.id}`, id: p.id, cols: [{ text: p.display_name.padEnd(20), cls: '' }, { text: p.household_name || '', cls: 'dim grow' }],
      }));
    }
    if (t === 'notices') {
      return this.notices().filter((n) => match(noticeText(n))).map((n) => ({
        key: `n${n.id}`, id: n.event,
        cols: [{ text: n.read ? ' ' : '●', cls: 'ok' }, { text: relative(n.created).padEnd(14), cls: 'dim' }, { text: noticeText(n), cls: 'grow' }],
      }));
    }
    return ['Edit my profile', 'Change my PIN', 'Sign out'].map((x, i) => ({ key: x, id: i, cols: [{ text: x, cls: 'grow' }] }));
  });

  readonly detailTitle = computed(() => {
    const p = this.page();
    if (this.tab() === 'me') return 'About me';
    if (p && 'view' in p) return `E${p.view.event.id}`;
    if (p && 'group' in p) return p.group.name;
    return '';
  });

  /** Buttons for the selected thing, each with its key. */
  readonly actions = computed(() => {
    const p = this.page();
    const out: { key: string; label: string; run: () => void }[] = [];
    if ((this.tab() === 'events' || this.tab() === 'notices') && p && 'view' in p) {
      const v = p.view;
      if (v.can_answer) {
        out.push({ key: 'r', label: 'Reply…', run: () => this.openAnswer() }, { key: 'y', label: 'Going', run: () => void this.quick('going') },
          { key: 'm', label: 'Maybe', run: () => void this.quick('maybe') }, { key: 'x', label: "Can't", run: () => void this.quick('no') });
      }
      if (v.can_edit) out.push({ key: 'e', label: 'Edit', run: () => this.openEdit() });
      out.push({ key: 'o', label: 'Open page', run: () => void this.router.navigate(['/e', v.event.id]) });
    }
    if (this.tab() === 'groups' && p && 'group' in p) {
      const g = p.group;
      out.push({ key: 'Enter', label: 'Its events', run: () => this.enter() });
      if (!g.my_status && g.join !== 'invite') out.push({ key: 'J', label: g.join === 'open' ? 'Join' : 'Ask to join', run: () => void this.membership('join') });
      if (g.my_status) out.push({ key: 'L', label: 'Leave', run: () => void this.membership('leave') });
      if (g.can_create_events) out.push({ key: 'n', label: 'New event', run: () => this.openNew(g.slug) });
    }
    return out;
  });

  readonly detail = computed(() => {
    const p = this.page();
    if (this.tab() === 'me') {
      const m = this.me();
      return m ? [`NAME\n    ${m.display_name} (${m.role})`, `EMAIL\n    ${m.email || '-'}`, `HOME\n    ${m.household_name || '-'}`, `ABOUT\n    ${m.bio || '-'}`, `FOUND BY\n    ${m.discoverable}`].join('\n\n') : '';
    }
    if (this.tab() === 'people') {
      const person = this.people().find((x) => x.id === this.rows()[this.cursor()]?.id);
      return person ? `NAME\n    ${person.display_name}\n\nHOUSEHOLD\n    ${person.household_name || '-'}\n\nABOUT\n    ${person.bio || '-'}` : '';
    }
    if (p && 'view' in p) return eventMan(p);
    if (p && 'group' in p) return groupMan(p);
    return '';
  });

  constructor() {
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
    await this.load();
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
      if (!this.msg()) this.say(`${o.waiting.length} waiting for your answer · ${o.plans.length} plans · ${this.unread()} unread. Press ? for help.`);
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  private async loadDetail(tab: Tab, id: number): Promise<void> {
    if (!id || this.editor()) return;
    try {
      if (tab === 'events' || tab === 'notices') this.page.set(await loadEvent(this.api, id));
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
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.chat-panel')?.contains(t)) return;
    const k = e.key;
    const n = this.rows().length;
    if (k === 'Escape') {
      this.showHelp.set(false);
      this.filter.set('');
      return;
    }
    if (this.editor()) {
      if (k === 'i' || k === 'Enter') this.box()?.nativeElement.focus();
      else return;
    } else if (/^[1-5]$/.test(k)) this.go(TABS[Number(k) - 1].id);
    else if (k === 'j' || k === 'ArrowDown') this.cursor.set(Math.min(n - 1, this.cursor() + 1));
    else if (k === 'k' || k === 'ArrowUp') this.cursor.set(Math.max(0, this.cursor() - 1));
    else if (k === 'Enter' || k === 'r') this.enter();
    else if (k === 'o' && this.selectedEvent()) void this.router.navigate(['/e', this.selectedEvent()!.event.id]);
    else if (k === 'y') void this.quick('going');
    else if (k === 'm') void this.quick('maybe');
    else if (k === 'x') void this.quick('no');
    else if (k === 'e') this.openEdit();
    else if (k === 'n') this.openNew();
    else if (k === 'J') void this.membership('join');
    else if (k === 'L') void this.membership('leave');
    else if (k === 'p') this.past.set(!this.past());
    else if (k === '?') this.showHelp.set(!this.showHelp());
    else if (k === '/') this.cmd().nativeElement.focus();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  enter(): void {
    const t = this.tab();
    if (t === 'events' || t === 'notices') this.openAnswer();
    else if (t === 'groups') {
      const g = this.selectedGroup();
      if (g) {
        this.go('events');
        this.groupFilter.set(g);
        this.say(`Events in ${g.name}. Esc or "all" shows everything.`);
      }
    } else if (t === 'me') {
      const r = this.cursor();
      if (r === 0) this.openMe();
      else if (r === 1) void this.command('pin');
      else void this.command('signout');
    }
  }

  // ---- the command line -------------------------------------------------------

  blurCmd(): void {
    this.cmd().nativeElement.blur();
  }

  runCmd(e: Event): void {
    e.preventDefault();
    const text = this.cmdText().trim().replace(/^[:/]/, '');
    this.cmdText.set('');
    this.cmd().nativeElement.value = '';
    this.blurCmd();
    if (text) void this.command(text);
  }

  async command(text: string): Promise<void> {
    const [verb, ...rest] = text.toLowerCase().split(/\s+/);
    const arg = rest.join(' ');
    const ref = /e?(\d+)/.exec(arg)?.[1];
    try {
      if (ref && ['going', 'maybe', 'no', 'reply', 'open', 'answer'].includes(verb)) {
        await this.openEvent(Number(ref));
      }
      switch (verb) {
        case 'save':
          return void (await this.save());
        case 'close':
          return this.close();
        case 'going':
        case 'yes':
        case 'maybe':
        case 'no':
          return void (await this.quick(verb === 'yes' ? 'going' : (verb as 'going' | 'maybe' | 'no'), /\+(\d+)/.exec(arg)?.[1]));
        case 'reply':
        case 'answer':
          return this.openAnswer();
        case 'edit':
          return this.openEdit();
        case 'cancel':
          return void (await this.cancelEvent());
        case 'pick':
        case 'lock':
          return void (await this.lock(Number(arg)));
        case 'new':
          if (rest[0] === 'group') return this.openNewGroup();
          return this.openNew(rest[rest[0] === 'event' ? 1 : 0]);
        case 'join':
        case 'leave':
          return void (await this.membership(verb, arg));
        case 'open':
          if (ref) return;
          return this.searchFor(arg);
        case 'all':
          this.groupFilter.set(null);
          return this.go('events');
        case 'past':
          return this.past.set(!this.past());
        case 'read':
          await markRead(this.api);
          await this.load();
          return this.say('All notifications marked read.');
        case 'me':
          return this.openMe();
        case 'pin': {
          const current = prompt('Your current PIN') ?? '';
          const pin = prompt('Your new PIN (4 to 8 digits)') ?? '';
          await this.api.send('PUT', '/api/v1/me/pin', { current, pin }, 'Done');
          return this.say('PIN changed.');
        }
        case 'signout':
        case 'logout':
          await this.api.signOut();
          await this.router.navigateByUrl('/signin');
          return;
        case 'help':
        case '?':
          return this.showHelp.set(true);
        case 'search':
        case 'find':
          return this.searchFor(arg);
        default:
          // Not a command: search the current list.
          return this.searchFor(text);
      }
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  private searchFor(words: string): void {
    this.filter.set(words);
    this.cursor.set(0);
    this.say(this.rows().length ? `${this.rows().length} matching “${words}”. Esc clears.` : `Nothing matches “${words}” here. Try "help".`, !this.rows().length);
  }

  // ---- doing things -----------------------------------------------------------

  async quick(status: 'going' | 'maybe' | 'no', plus?: string): Promise<void> {
    const v = this.selectedEvent();
    if (!v) return this.say('Pick an event first (j/k to move).', true);
    if (!v.can_answer) return this.say(v.locked ? 'Answers for this one are closed.' : `Join ${v.group_name} first (it's in the Groups list).`, true);
    try {
      const after = await answerEvent(this.api, v.event.id, { ...blankAnswer(v.event, v.mine), status, ...(plus ? { plus: Number(plus) } : {}) });
      this.say(`E${v.event.id}: ${STATUS_LABEL[after.mine?.status ?? status]}${after.mine?.plus ? ` +${after.mine.plus}` : ''}. Press r to add details.`);
      await this.refreshAround(v.event.id);
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  openAnswer(): void {
    const v = this.selectedEvent();
    if (!v) return this.say('Pick an event first (j/k to move).', true);
    if (!v.can_answer) return this.say(v.locked ? 'Answers for this one are closed.' : `Join ${v.group_name} first.`, true);
    this.editor.set({ kind: 'answer', file: `answer-E${v.event.id}.txt`, text: answerBuffer(v), ctx: v, errors: [], dirty: false });
    this.say('Change the values after the colons, then ^O to send.');
  }

  openEdit(): void {
    const v = this.selectedEvent();
    if (!v) return this.say('Pick an event first.', true);
    if (!v.can_edit) return this.say('Only the hosts can edit this event.', true);
    this.editor.set({ kind: 'edit-event', file: `E${v.event.id}.txt`, text: eventBuffer(draftFrom(v), `Edit "${v.event.title}"`, false), ctx: v, errors: [], dirty: false });
  }

  openNew(slug = ''): void {
    const mine = hostable(this.groups().filter((g) => g.my_status === 'active' || g.can_manage));
    const g = mine.find((x) => x.slug === slug) ?? (this.selectedGroup() && mine.find((x) => x.id === this.selectedGroup()!.id)) ?? mine[0];
    if (!g) return this.say("You can't create events in any group yet. Type: new group", true);
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(19, 0, 0, 0);
    const text = `group: ${g.slug}`.padEnd(32) + `# ${mine.map((x) => x.slug).join(' ')}\n` + eventBuffer(blankDraft('generic', Math.floor(start.getTime() / 1000)), 'New event', true);
    this.editor.set({ kind: 'new-event', file: 'new-event.txt', text, errors: [], dirty: false });
    this.say('Fill in the title and time, then ^O to save.');
  }

  openNewGroup(): void {
    this.editor.set({ kind: 'new-group', file: 'new-group.txt', text: groupBuffer(), errors: [], dirty: false });
  }

  openMe(): void {
    const m = this.me();
    if (m) this.editor.set({ kind: 'me', file: 'profile.txt', text: meBuffer(m), errors: [], dirty: false });
  }

  edit(text: string): void {
    this.editor.update((ed) => (ed ? { ...ed, text, dirty: true, errors: [] } : ed));
  }

  /** nano's keys: ^O save, ^X close, ^K cut line, ^U paste, ^G help. */
  editorKey(e: KeyboardEvent): void {
    const el = e.target as HTMLTextAreaElement;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (ctrl && (k === 'o' || k === 's')) void this.save();
    else if (ctrl && k === 'x' && el.selectionStart === el.selectionEnd) this.close();
    else if (ctrl && k === 'g') this.showHelp.set(!this.showHelp());
    else if (ctrl && k === 'k' && el.selectionStart === el.selectionEnd) {
      const v = el.value;
      const start = v.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const nl = v.indexOf('\n', el.selectionStart);
      const end = nl < 0 ? v.length : nl + 1;
      this.clip = v.slice(start, end);
      el.setRangeText('', start, end, 'start');
      this.edit(el.value);
    } else if (ctrl && k === 'u' && this.clip) {
      el.setRangeText(this.clip, el.selectionStart, el.selectionEnd, 'end');
      this.edit(el.value);
    } else if (e.key === 'Escape') {
      el.blur();
      return;
    } else if (e.key === 'Tab') {
      el.setRangeText('  ', el.selectionStart, el.selectionEnd, 'end');
      this.edit(el.value);
    } else return;
    e.preventDefault();
  }

  close(): void {
    const ed = this.editor();
    if (ed?.dirty && !confirm('Close without saving your changes?')) return;
    this.editor.set(null);
    this.say('Closed.');
  }

  badLine(n: number): boolean {
    return !!this.editor()?.errors.some((e) => e.line === n);
  }

  async save(): Promise<void> {
    const ed = this.editor();
    if (!ed) return this.say('Nothing to save.', true);
    const fail = (errors: Editor['errors']) => {
      this.editor.set({ ...ed, errors });
      this.say(`${errors.length} thing${errors.length === 1 ? '' : 's'} to fix: see the lines in red.`, true);
    };
    try {
      if (ed.kind === 'answer') {
        const { answer, errors } = readAnswer(ed.text, ed.ctx!);
        if (errors.length) return fail(errors);
        const v = await answerEvent(this.api, ed.ctx!.event.id, answer);
        this.say(`Sent: ${STATUS_LABEL[v.mine?.status ?? 'going']}.`);
        await this.refreshAround(v.event.id);
      } else if (ed.kind === 'new-event' || ed.kind === 'edit-event') {
        const base = ed.ctx ? draftFrom(ed.ctx) : blankDraft('generic');
        const { draft, errors } = readEvent(ed.text, base);
        let group = 0;
        if (ed.kind === 'new-event') {
          const p = parseBuffer(ed.text).values.get('group');
          const g = this.groups().find((x) => x.slug === p?.value);
          if (!g) errors.push({ line: p?.line ?? 1, message: `no group called "${p?.value ?? ''}"` });
          group = g?.id ?? 0;
        }
        if (errors.length) return fail(errors);
        const id = await saveEvent(this.api, draft, ed.ctx ? { id: ed.ctx.event.id, rev: ed.ctx.event.rev } : { group });
        this.say(`Saved E${id}.`);
        await this.load();
        await this.openEvent(id);
      } else if (ed.kind === 'me') {
        const { change, errors } = readMe(ed.text);
        if (errors.length) return fail(errors);
        await this.api.send('PATCH', '/api/v1/me', change, 'Me');
        await this.api.refresh();
        await this.load();
        this.say('Profile saved.');
      } else {
        const { values, errors } = parseBuffer(ed.text);
        if (errors.length) return fail(errors);
        const g = await this.api.send<GroupView>('POST', '/api/v1/groups', Object.fromEntries([...values].map(([k, v]) => [k, v.value])), 'GroupView');
        await this.load();
        this.say(`Created ${g.name}.`);
      }
      this.editor.set(null);
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  async cancelEvent(): Promise<void> {
    const v = this.selectedEvent();
    if (!v?.can_edit) return this.say('Pick an event you host.', true);
    if (!confirm(this.theme.t().spikeConfirm)) return;
    await this.api.send('POST', `/api/v1/events/${v.event.id}/cancel`, undefined, 'EventView');
    this.say(`E${v.event.id} cancelled.`);
    await this.refreshAround(v.event.id);
  }

  async lock(n: number): Promise<void> {
    const v = this.selectedEvent();
    const o = v?.event.when[n - 1];
    if (!v || !o) return this.say('Type "pick N" to choose time N of the selected poll.', true);
    await this.api.send('POST', `/api/v1/events/${v.event.id}/lock`, { option: o.id }, 'EventView');
    this.say(`E${v.event.id} is now ${when(o.start, o.end)}.`);
    await this.refreshAround(v.event.id);
  }

  async membership(what: 'join' | 'leave', name = ''): Promise<void> {
    const g = name ? this.groups().find((x) => x.slug === name || x.name.toLowerCase().includes(name.toLowerCase())) : this.selectedGroup();
    if (!g) return this.say('Pick a group first (press 2).', true);
    try {
      const after = await (what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
      this.say(what === 'leave' ? `You left ${g.name}.` : after.my_status === 'active' ? `You joined ${g.name}.` : `Asked to join ${g.name}.`);
      await this.load();
    } catch (e) {
      this.say(problem(e), true);
    }
  }

  private async refreshAround(id: number): Promise<void> {
    await this.load();
    this.page.set(await loadEvent(this.api, id).catch(() => null));
    void this.api.refreshSummary();
  }

  private async openEvent(id: number): Promise<void> {
    this.past.set(!this.events().some((e) => e.id === id) && this.pastEvents().some((e) => e.id === id));
    this.groupFilter.set(null);
    this.tab.set('events');
    this.filter.set('');
    this.cursor.set(Math.max(0, this.rows().findIndex((r) => r.id === id)));
    this.page.set(await loadEvent(this.api, id).catch(() => null));
  }
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
    `${e.title}\n${KIND_INFO[e.kind]?.label ?? e.kind} in ${v.group_name}${e.status !== 'scheduled' ? ` (${e.status})` : ''}`,
    `WHEN    ${e.start ? `${stamp(e.start)}${e.end ? ' – ' + stamp(e.end).slice(11) : ''}  (${relative(e.start)})` : 'time to be voted on'}${p.series ? `\n        ${p.series.summary}` : ''}`,
    `WHERE   ${e.where_kind === 'tbd' ? 'to be decided' : [e.place, e.address].filter(Boolean).join(', ') || 'a home'}`,
    `HOSTS   ${v.host_names.join(', ')}`,
    `COMING  ${headline(v.heads, e.capacity, v.maybe)}${v.waitlist ? `, ${v.waitlist} waiting` : ''}`,
    `YOU     ${v.mine ? `${STATUS_LABEL[v.mine.status]}${v.mine.plus ? ' +' + v.mine.plus : ''}` : 'not answered yet'}`,
  ];
  if (e.about) out.push(e.about);
  if (e.when.length && !e.start) out.push(`TIMES\n${e.when.map((o, i) => `  ${i + 1}) ${stamp(o.start)}  ${'█'.repeat(v.votes.find((x) => x.id === o.id)?.count ?? 0)} ${v.votes.find((x) => x.id === o.id)?.count ?? 0}`).join('\n')}${v.can_edit ? '\n  (type "pick N" to choose one)' : ''}`);
  if (e.bring.length) out.push(`BRING\n${e.bring.map((s) => `  ${s.name.padEnd(16)} ${v.claimed.find((c) => c.id === s.id)?.count ?? 0}/${s.count}  ${v.claimed.find((c) => c.id === s.id)?.names.join(', ') ?? ''}`).join('\n')}`);
  if (e.shifts.length) out.push(`SHIFTS\n${e.shifts.map((s) => `  ${s.name.padEnd(14)} ${stamp(s.start).slice(11)}-${stamp(s.end).slice(11)}  ${v.taken.find((c) => c.id === s.id)?.count ?? 0}/${s.count}`).join('\n')}`);
  if (e.cost) out.push(`COST    ${e.cost}`);
  out.push(`ANSWERS\n${p.rsvps.map((r) => `  ${(STATUS_LABEL[r.status] ?? r.status).padEnd(16)}${r.display_name}${r.plus ? ' +' + r.plus : ''}${r.note ? `  "${r.note}"` : ''}`).join('\n') || '  (none yet)'}`);
  return out.join('\n\n');
}

function groupMan(p: GroupPage): string {
  const g = p.group;
  return [
    `${g.name}\n${g.kind}, ${g.visibility}, joining: ${g.join}, ${g.members} members${g.my_role ? `\nYou: ${ROLE_LABEL[g.my_role as keyof typeof ROLE_LABEL]?.toLowerCase()}` : g.my_status === 'requested' ? '\nYou asked to join.' : ''}`,
    ...(g.about ? [g.about] : []),
    `EVENTS\n${p.events.map((e) => `  E${e.id}`.padEnd(8) + `${short(e.start) || 'vote'}  ${e.title}`).join('\n') || '  (none)'}`,
    ...(p.members.length ? [`MEMBERS\n${p.members.map((m) => `  ${m.role.padEnd(13)}${m.display_name}${m.status !== 'active' ? ` (${m.status})` : ''}`).join('\n')}`] : []),
  ].join('\n\n');
}
