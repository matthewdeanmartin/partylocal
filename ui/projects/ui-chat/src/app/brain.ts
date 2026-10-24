import { inject, Injectable } from '@angular/core';
import {
  EventKind, EventSummary, EventView, GroupView, KIND_INFO, Me, RsvpInput, STATUS_LABEL, blankAnswer, guestLimit, when,
} from 'party-core';
import {
  Api, EventDraft, answerEvent, blankDraft, hostable, joinGroup, leaveGroup, loadEvent, loadGroup, loadNotices, loadOverview,
  loadPeople, markRead, parseWhen, problem, saveEvent, suggestTimes,
} from 'party-ng';
import { Cancelled, Chat, Chip } from './chat';

const KINDS = Object.keys(KIND_INFO) as EventKind[];

/**
 * The board's side of the conversation: reads what was typed (or tapped),
 * answers with cards, and runs the multi-question flows (sign in, answer
 * an event, host one).
 */
@Injectable({ providedIn: 'root' })
export class Brain {
  private readonly api = inject(Api);
  private readonly chat = inject(Chat);
  /** Events and groups seen lately, for "the potluck" or "game club". */
  private known: { events: EventSummary[]; groups: GroupView[] } = { events: [], groups: [] };

  async start(): Promise<void> {
    this.chat.clear();
    await this.chat.typing(this.api.refresh().catch(() => undefined));
    const status = this.api.status();
    if (!status) {
      this.chat.say("I can't reach the board. Is it on, and are you on the home Wi-Fi?", { chips: [{ label: 'Try again', run: () => void this.start() }] });
      return;
    }
    if (status.setup_needed) return this.run(() => this.setup());
    if (!this.api.me()) return this.run(() => this.welcome());
    await this.greet();
  }

  /** Runs a flow; a cancelled question ends it quietly, an error is said. */
  async run(flow: () => Promise<unknown>): Promise<void> {
    try {
      await flow();
    } catch (e) {
      if (e instanceof Cancelled) return;
      this.chat.say(`Hmm: ${problem(e)}`, { chips: this.basics() });
    }
  }

  basics(): Chip[] {
    return [
      { label: "What's on?", run: () => this.hear("what's on") },
      { label: 'My plans', run: () => this.hear('my plans') },
      { label: 'Groups', run: () => this.hear('groups') },
      { label: 'Host something', run: () => this.hear('new event') },
      { label: 'Help', run: () => this.hear('help'), soft: true },
    ];
  }

  private async greet(): Promise<void> {
    const me = this.api.me()!;
    const o = await this.chat.typing(loadOverview(this.api));
    this.known = { events: o.upcoming, groups: [...o.mine, ...o.others] };
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const unread = this.api.summary()?.unread ?? 0;
    const bits = [
      o.waiting.length ? `${o.waiting.length} ${o.waiting.length === 1 ? 'event is' : 'events are'} waiting for your answer` : '',
      o.plans.length ? `you have ${o.plans.length} ${o.plans.length === 1 ? 'plan' : 'plans'} coming up` : '',
      unread ? `${unread} new ${unread === 1 ? 'notification' : 'notifications'}` : '',
    ].filter(Boolean);
    this.chat.say(`${hello}, ${me.display_name.split(' ')[0]}! ${bits.length ? cap(list(bits)) + '.' : 'All quiet for now.'}`);
    if (o.waiting.length) {
      this.chat.say('These need an answer:', {
        card: { type: 'events', events: o.waiting, empty: '' },
        chips: [
          ...o.waiting.slice(0, 3).map((e) => ({ label: `Answer “${short(e.title)}”${e.start ? `, ${day(e.start)}` : ''}`, run: () => this.hear(`e${e.id}`) })),
          ...(unread ? [{ label: 'Notifications', run: () => this.hear('notifications') }] : []),
          ...this.basics().slice(1, 3),
        ],
      });
    } else {
      this.chat.say('What would you like to do?', { chips: this.basics() });
    }
  }

  /** Something the person typed (or a chip that stands for typing it). */
  hear(raw: string): void {
    const text = raw.trim();
    if (!text) return;
    const open = this.chat.question();
    if (open) {
      this.answerQuestion(text);
      return;
    }
    this.chat.echo(text);
    void this.run(() => this.command(text));
  }

  /** Typed text for the open question: an option's label, or the value itself. */
  private answerQuestion(text: string): void {
    const q = this.chat.question()!;
    if (/^(cancel|stop|never ?mind|quit)$/i.test(text)) {
      this.chat.echo(text);
      this.chat.cancelOpen();
      this.chat.say('OK, dropped it.', { chips: this.basics() });
      return;
    }
    if (q.options && q.input === 'none') {
      const t = text.toLowerCase();
      const hit = q.options.find((o) => o.label.toLowerCase() === t || o.value.toLowerCase() === t)
        ?? q.options.find((o) => o.label.toLowerCase().includes(t));
      if (!hit) {
        this.chat.echo(text);
        this.chat.say(`Pick one of: ${q.options.map((o) => o.label).join(', ')} (or say “cancel”).`);
        return;
      }
      this.chat.reply(q.many ? [hit.value] : hit.value, hit.label);
      return;
    }
    this.chat.reply(text, q.input === 'pin' ? '••••' : text);
  }

  private async command(text: string): Promise<void> {
    const t = text.toLowerCase().replace(/[?!.]+$/, '').trim();
    const ref = /\be(\d+)\b/.exec(t)?.[1];
    let m: RegExpExecArray | null;
    if (/^(help|\?|what can you do|commands)$/.test(t)) return this.help();
    if (/^(hi|hello|hey|yo|morning|evening)\b/.test(t)) return this.greet();
    if ((m = /^(going|yes|maybe|no|can'?t come|not going)\s+(?:to\s+)?e?(\d+)(?:\s*\+\s*(\d+))?$/.exec(t))) {
      const status = m[1] === 'going' || m[1] === 'yes' ? 'going' : m[1] === 'maybe' ? 'maybe' : 'no';
      return this.quickAnswer(Number(m[2]), status, m[3] ? Number(m[3]) : undefined);
    }
    if ((m = /^who(?:'s| is)? (?:coming|going)(?: to)?\s*(.*)$/.exec(t))) {
      const id = (m[1] && this.findEvent(m[1])?.id) || (ref ? Number(ref) : 0);
      if (id) return this.whoIsComing(id);
      this.chat.say('Which event? Say e.g. “who is coming to e3”.');
      return;
    }
    if (ref && /^(e\d+|event \d+|open e\d+|show e\d+)$/.test(t)) return this.showEvent(Number(ref));
    if (/^(what'?s on|events|upcoming|calendar|what'?s happening)/.test(t)) return this.upcoming();
    if (/^(my plans|plans|mine|my events|what am i doing)/.test(t)) return this.plans();
    if (/^(new event|host|host something|plan something|make an event|create event)/.test(t)) return this.hostFlow();
    if (/^(new group|start a group|create group)/.test(t)) return this.groupFlow();
    if (/^(groups|clubs|my groups)$/.test(t)) return this.groups();
    if ((m = /^(join|leave)\s+(.+)$/.exec(t))) return this.membership(m[1] as 'join' | 'leave', m[2]);
    if (/^(notifications|inbox|news|what'?s new)$/.test(t)) return this.notifications();
    if ((m = /^(?:people|who is|find|search)\s*(.*)$/.exec(t))) return this.people(m[1]);
    if (/^(me|profile|my profile|settings)$/.test(t)) return this.profile();
    if (/^(change (my )?pin|pin)$/.test(t)) return this.changePin();
    if (/^(sign ?out|log ?out|bye)$/.test(t)) return this.signOut();
    if ((m = /^group\s+(.+)$/.exec(t))) return this.showGroupByName(m[1]);
    // Anything else: an event or a group by name?
    const e = this.findEvent(t);
    if (e) return this.showEvent(e.id);
    const g = this.findGroup(t);
    if (g) return this.showGroup(g.slug);
    this.chat.say(`I didn't catch “${text}”. Try one of these, or “help”.`, { chips: this.basics() });
  }

  private help(): void {
    this.chat.say(
      [
        'Things you can say:',
        '• “what’s on”, “my plans”, “e12” (an event), “who is coming to e12”',
        '• “going e12”, “going e12 +2”, “maybe e12”, “no e12”',
        '• “groups”, “game club”, “join book club”, “leave walkers”',
        '• “new event”, “new group”',
        '• “people”, “who is priya”, “notifications”, “me”, “change pin”, “sign out”',
        'Mid-question, “cancel” drops it.',
      ].join('\n'),
      { chips: this.basics() },
    );
  }

  // ---- events ---------------------------------------------------------------

  private findEvent(t: string): EventSummary | undefined {
    const words = t.replace(/^(the|a|an)\s+/, '').split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return undefined;
    return this.known.events.find((e) => words.every((w) => e.title.toLowerCase().includes(w)));
  }

  private async upcoming(): Promise<void> {
    const o = await this.chat.typing(loadOverview(this.api));
    this.known.events = o.upcoming;
    this.chat.say(o.upcoming.length ? "Here's what's coming up:" : 'Nothing is planned yet.', {
      card: { type: 'events', events: o.upcoming.slice(0, 12), empty: '' },
      chips: [{ label: 'My plans', run: () => this.hear('my plans') }, { label: 'Host something', run: () => this.hear('new event') }],
    });
  }

  private async plans(): Promise<void> {
    const o = await this.chat.typing(loadOverview(this.api));
    this.chat.say(o.plans.length ? 'Your plans:' : "You're not going to anything yet.", {
      card: { type: 'events', events: o.plans, empty: '' },
      chips: o.waiting.length ? [{ label: `${o.waiting.length} waiting for an answer`, run: () => this.hear("what's on") }] : this.basics(),
    });
  }

  async showEvent(id: number): Promise<void> {
    const page = await this.chat.typing(loadEvent(this.api, id));
    const v = page.view;
    const chips: Chip[] = [];
    if (v.can_answer) {
      chips.push(
        { label: '✅ Going', run: () => this.answerFlowChip(v, 'going') },
        { label: '🤔 Maybe', run: () => this.answerFlowChip(v, 'maybe') },
        { label: "❌ Can't", run: () => this.answerFlowChip(v, 'no') },
      );
    }
    chips.push({ label: "Who's coming?", run: () => this.hear(`who is coming to e${id}`), soft: true });
    if (v.can_edit && v.event.status !== 'cancelled') {
      if (v.event.modules.includes('when') && !v.event.start) chips.push({ label: 'Pick the time', run: () => void this.run(() => this.lockFlow(v)) });
      chips.push({ label: 'Change it', run: () => void this.run(() => this.editFlow(v)) });
    }
    if (!v.can_answer && !v.mine && !v.locked) {
      chips.push({ label: `Open ${v.group_name}`, run: () => void this.run(() => this.showGroup(v.group_slug)) });
    }
    this.chat.say(v.mine ? `You said ${STATUS_LABEL[v.mine.status].toLowerCase()} to this one.` : '', { card: { type: 'event', page }, chips });
  }

  private answerFlowChip(v: EventView, status: 'going' | 'maybe' | 'no'): void {
    this.chat.echo(status === 'going' ? 'Going' : status === 'maybe' ? 'Maybe' : "Can't come");
    void this.run(() => this.answerFlow(v, status));
  }

  private async whoIsComing(id: number): Promise<void> {
    const page = await this.chat.typing(loadEvent(this.api, id));
    const going = page.rsvps.filter((r) => r.status !== 'no');
    this.chat.say(going.length ? `${page.view.event.title}: ${page.view.heads} going, ${page.view.maybe} maybe.` : 'Nobody has answered yet.', {
      card: { type: 'rsvps', rsvps: page.rsvps },
      chips: page.view.can_answer && !page.view.mine ? [{ label: 'Answer it', run: () => this.hear(`e${id}`) }] : undefined,
    });
  }

  private async quickAnswer(id: number, status: 'going' | 'maybe' | 'no', plus?: number): Promise<void> {
    const v = (await this.chat.typing(loadEvent(this.api, id))).view;
    if (!v.can_answer) {
      this.chat.say(v.locked ? 'Answers for that one are closed.' : `You'd need to join ${v.group_name} first.`);
      return;
    }
    const input = { ...blankAnswer(v.event, v.mine), status, ...(plus !== undefined ? { plus } : {}) };
    const after = await this.chat.typing(answerEvent(this.api, id, input));
    this.confirmAnswer(after);
  }

  /** Asks only what the event's modules need, then sends the answer. */
  async answerFlow(v: EventView, status: 'going' | 'maybe' | 'no'): Promise<void> {
    const e = v.event;
    const a: RsvpInput = { ...blankAnswer(e, v.mine), status };
    if (status !== 'no') {
      const max = guestLimit(e);
      if (max > 0) {
        const opts = Array.from({ length: Math.min(max, 4) + 1 }, (_, n) => ({ label: n ? `+${n}` : 'Just me', value: String(n) }));
        a.plus = Number(await this.chat.choose('Bringing anyone?', opts));
        if (a.plus) {
          a.names = await this.chat.ask('Their names? (or “skip”)', { placeholder: 'e.g. my sister Rosa', optional: true }).then(skip);
          if (e.modules.includes('diet') || e.kind === 'party' || e.kind === 'potluck') {
            a.kids = Number(await this.chat.choose('Any of them kids?', Array.from({ length: a.plus + 1 }, (_, n) => ({ label: n ? String(n) : 'No', value: String(n) }))));
          }
        }
      }
      if (e.modules.includes('when') && e.when.length) {
        const opts = e.when.map((o) => ({ label: when(o.start, o.end), value: String(o.id) }));
        a.when = (await this.chat.chooseMany('Which times work for you? Tap all that do, then Done.', opts, (a.when ?? []).map(String))).map(Number);
      }
      if (e.modules.includes('bring') && e.bring.length) {
        const open = e.bring.filter((s) => {
          const taken = v.claimed.find((c) => c.id === s.id)?.count ?? 0;
          return taken < s.count || v.mine?.bring.includes(s.id);
        });
        if (open.length) {
          const opts = open.map((s) => ({ label: `${s.name} (${s.count - (v.claimed.find((c) => c.id === s.id)?.count ?? 0)} left)`, value: String(s.id) }));
          a.bring = (await this.chat.chooseMany('Can you bring something? Tap what you will, then Done.', opts, (a.bring ?? []).map(String))).map(Number);
        }
      }
      if (e.modules.includes('shifts') && e.shifts.length) {
        const opts = e.shifts.map((s) => ({ label: `${s.name}, ${when(s.start, s.end)}`, value: String(s.id) }));
        a.shifts = (await this.chat.chooseMany('Which shifts can you take?', opts, (a.shifts ?? []).map(String))).map(Number);
      }
      if (e.modules.includes('rides')) {
        a.ride = await this.chat.choose('How are you getting there?', [
          { label: 'Need a lift', value: 'need' }, { label: 'Can give lifts', value: 'offer' }, { label: 'Making my own way', value: 'own' },
        ]);
        if (a.ride === 'offer' || a.ride === 'need') {
          a.seats = Number(await this.chat.choose(a.ride === 'offer' ? 'How many spare seats?' : 'Seats for how many?', [1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) }))));
        }
      }
      if (e.modules.includes('diet')) {
        a.diet = await this.chat.ask(e.diet_prompt || 'Any allergies or diet the hosts should know? (or “none”)', { optional: true, placeholder: 'e.g. vegetarian' }).then(skip);
      }
      for (const q of e.modules.includes('questions') ? e.questions : []) {
        const value = q.kind === 'text'
          ? await this.chat.ask(q.prompt, { optional: true }).then(skip)
          : await this.chat.choose(q.prompt, (q.kind === 'yesno' ? ['yes', 'no'] : q.choices).map((c) => ({ label: c, value: c })));
        a.answers = [...(a.answers ?? []).filter((x) => x.question !== q.id), { question: q.id, value }];
      }
    }
    const after = await this.chat.typing(answerEvent(this.api, e.id, a));
    this.confirmAnswer(after);
  }

  private confirmAnswer(v: EventView): void {
    const s = v.mine?.status;
    const line = s === 'going' ? `You're going to ${v.event.title}. 🎉` : s === 'waitlist' ? `It's full, so you're on the waitlist for ${v.event.title}. I'll tell you if a place opens.` : s === 'maybe' ? `Noted: maybe for ${v.event.title}.` : `Got it, you can't make ${v.event.title}.`;
    void this.api.refreshSummary();
    this.chat.say(line, { chips: [{ label: 'See the event', run: () => this.hear(`e${v.event.id}`) }, ...this.basics().slice(0, 2)] });
  }

  /** "When?" as chips plus anything typed ("fri 7pm"). */
  private async askWhen(prompt: string, optional = false): Promise<number> {
    for (;;) {
      const opts = suggestTimes().map((s) => ({ label: s.label, value: String(s.at) }));
      const raw = await this.chat.ask(prompt, { input: 'datetime', options: opts, optional, placeholder: 'e.g. sat 2pm, nov 7 19:30' });
      if (optional && /^(skip|none|no)$/i.test(raw)) return 0;
      const at = /^\d{9,}$/.test(raw) ? Number(raw) : parseWhen(raw);
      if (at) return at;
      this.chat.say(`I couldn't read “${raw}” as a time. Try “fri 7pm” or “2026-11-07 19:00”.`);
    }
  }

  async hostFlow(groupSlug = ''): Promise<void> {
    const groups = hostable((await this.chat.typing(loadOverview(this.api))).mine);
    if (!groups.length) {
      this.chat.say("You can't host in any group yet: organizers create events. Start your own group?", {
        chips: [{ label: 'Start a group', run: () => this.hear('new group') }, ...this.basics().slice(0, 1)],
      });
      return;
    }
    let group = groups.find((g) => g.slug === groupSlug) ?? (groups.length === 1 ? groups[0] : undefined);
    if (!group) {
      const picked = await this.chat.choose('Which group is it for?', groups.map((g) => ({ label: g.name, value: String(g.id) })));
      group = groups.find((g) => g.id === Number(picked))!;
    }
    const kind = (await this.chat.choose('What kind of thing?', KINDS.map((k) => ({ label: `${KIND_INFO[k].icon} ${KIND_INFO[k].label}`, value: k })))) as EventKind;
    const d: EventDraft = blankDraft(kind);
    d.title = await this.chat.ask('What shall we call it?', { placeholder: kind === 'poll' ? 'e.g. When suits for the AGM?' : 'e.g. Game night' });
    if (kind === 'poll') {
      d.when = [];
      while (d.when.length < 6) {
        const at = await this.askWhen(d.when.length < 2 ? `Time option ${d.when.length + 1}?` : 'Another option? (or “skip” to stop)', d.when.length >= 2);
        if (!at) break;
        d.when.push({ id: 0, start: at, end: at + 2 * 3600 });
      }
    } else {
      d.start = await this.askWhen('When does it start?');
      const len = await this.chat.choose('How long?', [
        { label: '1 hour', value: '3600' }, { label: '2 hours', value: '7200' }, { label: '3 hours', value: '10800' },
        { label: 'All afternoon', value: '18000' }, { label: 'No set end', value: '0' },
      ]);
      d.end = Number(len) ? d.start + Number(len) : 0;
      d.repeat = (await this.chat.choose('Does it repeat?', [
        { label: 'Just once', value: '' }, { label: 'Every week', value: 'weekly' }, { label: 'Monthly', value: 'monthly-nth' },
      ])) as EventDraft['repeat'];
    }
    const where = await this.chat.ask('Where? (a place, or “tbd”)', { placeholder: 'e.g. The back room at Hops & Co', options: [{ label: 'To be decided', value: 'tbd' }] });
    if (!/^(tbd|to be decided|skip)$/i.test(where)) {
      d.where_kind = 'place';
      d.place = where;
    }
    const cap = await this.chat.ask('How many places? (a number, or “no limit”)', { input: 'number', options: [{ label: 'No limit', value: '0' }, { label: '10', value: '10' }, { label: '20', value: '20' }], placeholder: '0 = no limit' });
    d.capacity = Number(cap) || 0;
    if (d.modules.includes('bring')) {
      const items = await this.chat.ask('What should people bring? Comma-separated, “x2” for more than one (or “skip”).', { placeholder: 'Salad x3, Dessert x2, Chairs', optional: true }).then(skip);
      d.bring = items.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
        const m = /^(.*?)\s*(?:x|×)\s*(\d+)$/i.exec(s);
        return { id: 0, name: (m ? m[1] : s).slice(0, 40), count: m ? Math.min(99, Number(m[2])) : 1 };
      });
      if (!d.bring.length) d.modules = d.modules.filter((m) => m !== 'bring');
    }
    if (d.modules.includes('shifts')) {
      const names = await this.chat.ask('Shifts? Comma-separated names, each runs the whole time (or “skip”).', { optional: true, placeholder: 'Setup, Cooking, Cleanup' }).then(skip);
      d.shifts = names.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ id: 0, name: name.slice(0, 40), start: d.start, end: d.end, count: 2 }));
      if (!d.shifts.length) d.modules = d.modules.filter((m) => m !== 'shifts');
    }
    if (d.modules.includes('questions')) {
      const q = await this.chat.ask('A yes/no question for people answering? (or “skip”)', { optional: true, placeholder: 'e.g. Have you read the book?' }).then(skip);
      if (q) d.questions = [{ id: 0, kind: 'yesno', prompt: q, choices: [] }];
      else d.modules = d.modules.filter((m) => m !== 'questions');
    }
    d.about = await this.chat.ask('Anything else to say about it? (or “skip”)', { optional: true }).then(skip);
    const summary = `${KIND_INFO[kind].icon} ${d.title}\n${kind === 'poll' ? `${d.when.length} time options` : when(d.start, d.end)}${d.repeat ? ' (repeats)' : ''}\n${d.place || 'Place to be decided'} · ${d.capacity ? `${d.capacity} places` : 'no limit'}\nin ${group.name}`;
    const go = await this.chat.choose(`Here it is:\n${summary}\nPost it?`, [
      { label: 'Post it', value: 'post' }, { label: 'Save as draft', value: 'draft' }, { label: 'Throw it away', value: 'no' },
    ]);
    if (go === 'no') {
      this.chat.say('Binned.', { chips: this.basics() });
      return;
    }
    d.draft = go === 'draft';
    const id = await this.chat.typing(saveEvent(this.api, d, { group: group.id }));
    this.chat.say(d.draft ? 'Saved as a draft: only hosts see it.' : `Posted to ${group.name}.`);
    await this.showEvent(id);
  }

  private async editFlow(v: EventView): Promise<void> {
    const what = await this.chat.choose('What needs changing?', [
      { label: 'Title', value: 'title' }, { label: 'Time', value: 'time' }, { label: 'Place', value: 'place' }, { label: 'Places', value: 'capacity' },
      { label: 'Cancel the event', value: 'cancel' },
    ]);
    const e = v.event;
    let body: Record<string, unknown> = {};
    if (what === 'cancel') {
      const sure = await this.chat.choose(`Cancel ${e.title}? Everyone who answered is told.`, [{ label: 'Yes, cancel it', value: 'y' }, { label: 'No, keep it', value: 'n' }]);
      if (sure !== 'y') return;
      await this.chat.typing(this.api.send('POST', `/api/v1/events/${e.id}/cancel`, undefined, 'EventView'));
      this.chat.say('Cancelled. People have been told.');
      return;
    }
    if (what === 'title') body = { title: await this.chat.ask('New title?', { placeholder: e.title }) };
    if (what === 'place') body = { where_kind: 'place', place: await this.chat.ask('Where now?', { placeholder: e.place }) };
    if (what === 'capacity') body = { capacity: Number(await this.chat.ask('How many places? (0 = no limit)', { input: 'number' })) || 0 };
    if (what === 'time') {
      const start = await this.askWhen('New start time?');
      body = { start, end: e.end > e.start ? start + (e.end - e.start) : 0 };
    }
    await this.chat.typing(this.api.send('PATCH', `/api/v1/events/${e.id}`, { ...body, rev: e.rev }, 'EventView'));
    this.chat.say('Changed. Anyone affected will hear about it.');
    await this.showEvent(e.id);
  }

  private async lockFlow(v: EventView): Promise<void> {
    const opts = v.event.when.map((o) => ({ label: `${when(o.start, o.end)} (${v.votes.find((x) => x.id === o.id)?.count ?? 0} votes)`, value: String(o.id) }));
    const option = await this.chat.choose('Which time wins?', opts);
    await this.chat.typing(this.api.send('POST', `/api/v1/events/${v.event.id}/lock`, { option: Number(option) }, 'EventView'));
    this.chat.say("Locked in. Everyone who said that time works is now going.");
    await this.showEvent(v.event.id);
  }

  // ---- groups ---------------------------------------------------------------

  private findGroup(t: string): GroupView | undefined {
    const words = t.replace(/^(the|a)\s+/, '').split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) return undefined;
    return this.known.groups.find((g) => words.every((w) => g.name.toLowerCase().includes(w) || g.slug.includes(w)));
  }

  private async groups(): Promise<void> {
    const o = await this.chat.typing(loadOverview(this.api));
    this.known.groups = [...o.mine, ...o.others];
    this.chat.say(o.mine.length ? 'Your groups:' : "You're not in any groups yet.", { card: { type: 'groups', groups: o.mine } });
    if (o.others.length) this.chat.say('And some you could join:', { card: { type: 'groups', groups: o.others }, chips: [{ label: 'Start a group', run: () => this.hear('new group') }] });
  }

  private async showGroupByName(name: string): Promise<void> {
    if (!this.known.groups.length) this.known.groups = [...(await loadOverview(this.api)).mine];
    const g = this.findGroup(name);
    if (g) return this.showGroup(g.slug);
    this.chat.say(`I don't know a group called “${name}”.`, { chips: [{ label: 'Show groups', run: () => this.hear('groups') }] });
  }

  async showGroup(slug: string): Promise<void> {
    const page = await this.chat.typing(loadGroup(this.api, slug));
    const g = page.group;
    const chips: Chip[] = [];
    if (!g.my_status && g.join !== 'invite') chips.push({ label: g.join === 'open' ? 'Join' : 'Ask to join', run: () => this.hear(`join ${g.slug}`) });
    if (g.my_status) chips.push({ label: g.my_status === 'requested' ? 'Withdraw request' : 'Leave', run: () => this.hear(`leave ${g.slug}`), soft: true });
    if (g.can_create_events) chips.push({ label: 'Host something here', run: () => void this.run(() => this.hostFlow(g.slug)) });
    for (const e of page.events.slice(0, 3)) chips.push({ label: short(e.title), run: () => this.hear(`e${e.id}`) });
    this.chat.say('', { card: { type: 'group', page }, chips });
  }

  private async membership(what: 'join' | 'leave', name: string): Promise<void> {
    if (!this.known.groups.length) {
      const o = await loadOverview(this.api);
      this.known.groups = [...o.mine, ...o.others];
    }
    const g = this.known.groups.find((x) => x.slug === name) ?? this.findGroup(name);
    if (!g) {
      this.chat.say(`Which group is “${name}”?`, { chips: [{ label: 'Show groups', run: () => this.hear('groups') }] });
      return;
    }
    const after = await this.chat.typing(what === 'join' ? joinGroup(this.api, g.id) : leaveGroup(this.api, g.id));
    this.known.groups = this.known.groups.map((x) => (x.id === g.id ? after : x));
    const line = what === 'leave' ? `You've left ${g.name}.` : after.my_status === 'active' ? `Welcome to ${g.name}! 🎉` : `Asked to join ${g.name}; an organizer will let you in.`;
    this.chat.say(line, { chips: [{ label: `Open ${g.name}`, run: () => void this.run(() => this.showGroup(g.slug)) }, ...this.basics().slice(0, 1)] });
  }

  private async groupFlow(): Promise<void> {
    const name = await this.chat.ask('What is the group called?', { placeholder: 'e.g. Sunday Dinners' });
    const about = await this.chat.ask('One line about it? (or “skip”)', { optional: true }).then(skip);
    const kind = await this.chat.choose('Is it…', [
      { label: 'A club (regular meetups)', value: 'club' }, { label: 'A circle (family, friends)', value: 'circle' }, { label: 'A one-off', value: 'one-off' },
    ]);
    const visibility = await this.chat.choose('Who can find it?', [
      { label: 'Anyone (public)', value: 'public' }, { label: 'People with the link', value: 'unlisted' }, { label: 'Only members', value: 'private' },
    ]);
    const join = await this.chat.choose('How do people join?', [
      { label: 'Anyone can join', value: 'open' }, { label: 'They ask, I approve', value: 'approval' }, { label: 'By invitation', value: 'invite' },
    ]);
    const g = await this.chat.typing(this.api.send<GroupView>('POST', '/api/v1/groups', { name, about, kind, visibility, join }, 'GroupView'));
    this.chat.say(`${g.name} exists, and you're its organizer.`);
    await this.showGroup(g.slug);
  }

  // ---- the rest -------------------------------------------------------------

  private async notifications(): Promise<void> {
    const notices = await this.chat.typing(loadNotices(this.api));
    this.chat.say(notices.length ? 'Lately:' : 'No notifications.', {
      card: { type: 'notices', notices },
      chips: notices.some((n) => !n.read) ? [{ label: 'Mark all read', run: () => void this.run(async () => { await markRead(this.api); this.chat.say('All read.'); }) }] : this.basics(),
    });
  }

  private async people(q: string): Promise<void> {
    const people = await this.chat.typing(loadPeople(this.api, q.replace(/^(is|for)\s+/, '')));
    this.chat.say(people.length ? (q ? `Matching “${q}”:` : 'People you can find here:') : `Nobody matching “${q}”.`, { card: { type: 'people', people } });
  }

  private async profile(): Promise<void> {
    const me = await this.chat.typing(this.api.get<Me>('/api/v1/auth/me', 'Me'));
    this.chat.say("That's you:", {
      card: { type: 'me', me },
      chips: [
        { label: 'Change my name', run: () => void this.run(() => this.editMe('display_name', 'What should people call you?')) },
        { label: 'Change my bio', run: () => void this.run(() => this.editMe('bio', 'A line about you (280 characters at most)?')) },
        { label: 'Who can find me', run: () => void this.run(() => this.discoverable()) },
        { label: 'Change PIN', run: () => this.hear('change pin') },
        { label: 'Sign out', run: () => this.hear('sign out'), soft: true },
      ],
    });
  }

  private async editMe(field: 'display_name' | 'bio', prompt: string): Promise<void> {
    const value = await this.chat.ask(prompt);
    await this.chat.typing(this.api.send('PATCH', '/api/v1/me', { [field]: value }, 'Me'));
    await this.api.refresh();
    this.chat.say('Saved.', { chips: [{ label: 'My profile', run: () => this.hear('me') }] });
  }

  private async discoverable(): Promise<void> {
    const d = await this.chat.choose('Who can find you in People?', [
      { label: 'Everyone here', value: 'public' }, { label: 'People in my groups', value: 'members' }, { label: 'Nobody', value: 'nobody' },
    ]);
    await this.chat.typing(this.api.send('PATCH', '/api/v1/me', { discoverable: d }, 'Me'));
    this.chat.say('Saved.');
  }

  private async changePin(): Promise<void> {
    const current = await this.chat.ask('Your current PIN?', { input: 'pin', placeholder: 'current PIN' });
    const pin = await this.chat.ask('And the new one (4 to 8 digits)?', { input: 'pin', placeholder: 'new PIN' });
    await this.chat.typing(this.api.send('PUT', '/api/v1/me/pin', { current, pin }, 'Done'));
    this.chat.say('PIN changed.');
  }

  private async signOut(): Promise<void> {
    await this.chat.typing(this.api.signOut());
    this.chat.say('Signed out. Bye! 👋');
    await this.run(() => this.welcome());
  }

  private async welcome(): Promise<void> {
    const status = this.api.status();
    const how = await this.chat.choose(`Hi! I'm ${status?.instance ?? 'party'}, the house's party board. Have we met?`, [
      { label: 'Sign in', value: 'in' }, ...(status?.signup_open ? [{ label: "I'm new here", value: 'up' }] : []),
    ]);
    if (how === 'up') {
      const name = await this.chat.ask("Welcome! What's your name? It's also how you'll sign in.", { placeholder: 'e.g. Sam' });
      const email = await this.chat.ask('An email for reminders? (or “skip”)', { optional: true, placeholder: 'you@example.com' }).then(skip);
      const pin = await this.chat.ask('Pick a PIN, 4 to 8 digits.', { input: 'pin', placeholder: 'PIN' });
      await this.chat.typing(this.api.signUp(name, email, pin));
    } else {
      const login = await this.chat.ask('Your name or email?', { placeholder: 'name or email' });
      const pin = await this.chat.ask('And your PIN?', { input: 'pin', placeholder: 'PIN' });
      await this.chat.typing(this.api.signIn(login, pin));
    }
    await this.api.refresh();
    await this.greet();
  }

  private async setup(): Promise<void> {
    this.chat.say("Hello! This board is brand new. Whoever sets it up becomes its admin; let's do that.");
    const code = this.api.status()?.setup_code_required ? await this.chat.ask('First, the setup code from the board\'s serial console:') : '';
    const name = await this.chat.ask("What's your name?");
    const email = await this.chat.ask('Email (optional, “skip”)?', { optional: true }).then(skip);
    const pin = await this.chat.ask('Choose a PIN, 4 to 8 digits.', { input: 'pin' });
    await this.chat.typing(this.api.setup(name, email, pin, code));
    this.chat.say(`All set, ${name}. You're the admin.`);
    await this.greet();
  }
}

function skip(v: string): string {
  return /^(skip|none|no|nothing|-)$/i.test(v.trim()) ? '' : v.trim();
}

function short(t: string): string {
  return t.length > 24 ? `${t.slice(0, 22)}…` : t;
}

function day(t: number): string {
  return new Date(t * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function list(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
