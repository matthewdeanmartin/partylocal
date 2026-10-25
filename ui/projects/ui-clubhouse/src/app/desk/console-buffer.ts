// Forms as text: a buffer of `key: value  # comment` lines that the person
// edits and saves with ^O. Pure functions; unit-tested in console-buffer.test.ts.
import { blankAnswer, EventKind, EventView, guestLimit, KIND_INFO, Me, Module, RsvpInput } from 'party-core';
import { editBringList, keepItemIds, EventDraft, parseWhen } from 'party-ng';

export interface Parsed {
  values: Map<string, { value: string; line: number }>;
  errors: { line: number; message: string }[];
}

/** Reads `key: value` lines; `#` starts a comment; `key: |` takes the indented lines below. */
export function parseBuffer(text: string): Parsed {
  const values = new Map<string, { value: string; line: number }>();
  const errors: Parsed['errors'] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const m = /^([a-z_][a-z0-9_]*)\s*:\s?(.*)$/i.exec(raw);
    if (!m) {
      errors.push({ line: i + 1, message: `expected "key: value", got "${raw.trim().slice(0, 30)}"` });
      continue;
    }
    const key = m[1].toLowerCase();
    let value = m[2].replace(/\s+#.*$/, '').trim();
    if (value === '|') {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].replace(/^ {2}/, ''));
      value = block.join('\n').trim();
    }
    if (values.has(key)) errors.push({ line: i + 1, message: `"${key}" appears twice` });
    values.set(key, { value, line: i + 1 });
  }
  return { values, errors };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-07 19:00" */
export function stamp(t: number): string {
  if (!t) return '';
  const d = new Date(t * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-11-07 19:00-21:00" */
function span(start: number, end: number): string {
  return end ? `${stamp(start)}-${stamp(end).slice(11)}` : stamp(start);
}

function readSpan(raw: string, line: number, errors: Parsed['errors']): { start: number; end: number } | null {
  const m = /^(.*?\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(raw.trim());
  const start = parseWhen(m ? m[1] : raw);
  if (!start) {
    errors.push({ line, message: `can't read "${raw}" as a time (try 2026-11-07 19:00-21:00)` });
    return null;
  }
  let end = 0;
  if (m) {
    const [h, min] = m[2].split(':').map(Number);
    const d = new Date(start * 1000);
    d.setHours(h, min, 0, 0);
    end = Math.floor(d.getTime() / 1000);
    if (end <= start) end += 86_400;
  }
  return { start, end };
}

const KINDS = Object.keys(KIND_INFO) as EventKind[];

export function eventBuffer(d: EventDraft, heading: string, creating: boolean): string {
  const extras = d.modules.filter((m) => m !== 'headcount');
  const lines = [
    `# ${heading}`,
    '# ^O saves, ^X closes. Lines starting with # are notes.',
    ...(creating ? [`kind: ${d.kind}`.padEnd(32) + `# ${KINDS.join(' ')}`] : []),
    `title: ${d.title}`,
    ...(d.modules.includes('when') && !d.poll_locked ? [] : [`start: ${stamp(d.start)}`, `end: ${stamp(d.end)}`.padEnd(32) + '# blank = no set end']),
    `where: ${d.where_kind}`.padEnd(32) + '# place | home | tbd',
    `place: ${d.place}`,
    `address: ${d.address}`,
    `capacity: ${d.capacity}`.padEnd(32) + '# 0 = no limit',
    `guests: ${d.plus_ones === 'limited' ? `limited ${d.plus_max}` : d.plus_ones}`.padEnd(32) + '# none | limited N | unlimited',
    ...(creating && !d.modules.includes('when') ? [`repeat: ${d.repeat || 'once'}`.padEnd(32) + '# once | weekly | monthly-nth | monthly-date | yearly (Feb 29 → Feb 28)'] : []),
    `draft: ${d.draft ? 'yes' : 'no'}`,
    `extras: ${extras.join(', ')}`.padEnd(32) + '# bring diet rides when shifts questions cost link',
    `bring: ${d.bring.map((s) => `${s.name} x${s.count}`).join(', ')}`,
    `diet_prompt: ${d.diet_prompt}`,
    `questions: ${d.questions.map((q) => (q.kind === 'choice' ? `choice ${q.prompt}: ${q.choices.join(', ')}` : `${q.kind} ${q.prompt}`)).join(' | ')}`,
    `when: ${d.when.map((o) => span(o.start, o.end)).join(' | ')}`.padEnd(32) + '# poll options',
    `shifts: ${d.shifts.map((s) => `${s.name} ${span(s.start, s.end)} x${s.count}`).join(' | ')}`,
    `cost: ${d.cost}`,
    `rides_note: ${d.rides_note}`,
    `link: ${d.link}`,
    'about: |',
    ...(d.about ? d.about.split('\n').map((l) => `  ${l}`) : ['  ']),
  ];
  return lines.join('\n');
}

/** The draft the buffer describes, or errors with line numbers. */
export function readEvent(text: string, base: EventDraft): { draft: EventDraft; errors: Parsed['errors'] } {
  const { values, errors } = parseBuffer(text);
  const d: EventDraft = structuredClone(base);
  // A displayed timestamp or short list can be less precise than stored data.
  // Parse only changed fields so title-only edits preserve every other value.
  const original = parseBuffer(eventBuffer(base, '', true)).values;
  const get = (k: string) => {
    const entry = values.get(k);
    return entry && entry.value !== original.get(k)?.value ? entry : undefined;
  };
  const line = (k: string) => get(k)?.line ?? 0;
  const v = (k: string) => get(k)?.value ?? '';
  if (get('kind')) {
    if (!KINDS.includes(v('kind') as EventKind)) errors.push({ line: line('kind'), message: `kind must be one of ${KINDS.join(', ')}` });
    else d.kind = v('kind') as EventKind;
  }
  if (get('title')) d.title = v('title');
  if (get('extras')) {
    const mods = v('extras').split(/[\s,]+/).filter(Boolean) as Module[];
    const known: Module[] = ['bring', 'diet', 'rides', 'when', 'shifts', 'questions', 'cost', 'link'];
    const bad = mods.filter((m) => !known.includes(m));
    if (bad.length) errors.push({ line: line('extras'), message: `unknown extras: ${bad.join(', ')}` });
    d.modules = ['headcount', ...mods.filter((m) => known.includes(m))];
  }
  for (const k of ['start', 'end'] as const) {
    if (!get(k)) continue;
    if (!v(k)) d[k] = 0;
    else {
      const t = parseWhen(v(k));
      if (!t) errors.push({ line: line(k), message: `can't read "${v(k)}" as a time (try 2026-11-07 19:00)` });
      d[k] = t;
    }
  }
  if (get('where')) {
    if (!['place', 'home', 'tbd'].includes(v('where'))) errors.push({ line: line('where'), message: 'where must be place, home or tbd' });
    else d.where_kind = v('where') as EventDraft['where_kind'];
  }
  if (get('place')) d.place = v('place');
  if (get('address')) d.address = v('address');
  if (get('capacity')) {
    const n = Number(v('capacity') || 0);
    if (!Number.isInteger(n) || n < 0) errors.push({ line: line('capacity'), message: 'capacity is a whole number (0 = no limit)' });
    else d.capacity = n;
  }
  if (get('guests')) {
    const m = /^(none|unlimited|limited\s+(\d))$/.exec(v('guests'));
    if (!m) errors.push({ line: line('guests'), message: 'guests: none, unlimited, or limited N (1-9)' });
    else {
      d.plus_ones = m[1].startsWith('limited') ? 'limited' : (m[1] as EventDraft['plus_ones']);
      if (m[2]) d.plus_max = Number(m[2]);
    }
  }
  if (get('repeat')) {
    const r = v('repeat') === 'once' ? '' : v('repeat');
    if (!['', 'weekly', 'monthly-nth', 'monthly-date', 'yearly'].includes(r)) errors.push({ line: line('repeat'), message: 'repeat: once, weekly, monthly-nth, monthly-date or yearly' });
    else d.repeat = r as EventDraft['repeat'];
  }
  if (get('draft')) d.draft = /^(yes|y|true|1)$/i.test(v('draft'));
  if (get('bring')) d.bring = editBringList(base.bring, v('bring'));
  if (get('diet_prompt')) d.diet_prompt = v('diet_prompt');
  if (get('questions')) {
    d.questions = v('questions').split('|').map((s) => s.trim()).filter(Boolean).map((s, i) => {
      const m = /^(yesno|text|choice)\s+(.*)$/.exec(s);
      if (!m) {
        errors.push({ line: line('questions'), message: `question "${s}": start with yesno, text or choice` });
        return { id: 0, kind: 'text' as const, prompt: s, choices: [] };
      }
      if (m[1] === 'choice') {
        const [prompt, choices] = m[2].split(/:(.*)/s);
        return { id: 0, kind: 'choice' as const, prompt: prompt.trim(), choices: (choices ?? '').split(',').map((c) => c.trim()).filter(Boolean) };
      }
      return { id: 0, kind: m[1] as 'yesno' | 'text', prompt: m[2].trim(), choices: [] };
    });
  }
  if (get('when')) {
    d.when = v('when').split('|').map((s) => s.trim()).filter(Boolean)
      .map((s, i) => ({ id: 0, ...(readSpan(s, line('when'), errors) ?? { start: 0, end: 0 }) }));
  }
  if (get('shifts')) {
    d.shifts = v('shifts').split('|').map((s) => s.trim()).filter(Boolean).map((s, i) => {
      const m = /^(.*?)\s+(\d{4}-\d{2}-\d{2}.*?)(?:\s+x(\d+))?$/.exec(s);
      if (!m) {
        errors.push({ line: line('shifts'), message: `shift "${s}": name 2026-11-07 09:00-11:00 x2` });
        return { id: 0, name: s, start: 0, end: 0, count: 1 };
      }
      const t = readSpan(m[2], line('shifts'), errors) ?? { start: 0, end: 0 };
      return { id: 0, name: m[1], ...t, count: Number(m[3] ?? 1) };
    });
  }
  if (get('questions')) d.questions = keepItemIds(base.questions, d.questions,
    (a, b) => a.kind === b.kind && a.prompt === b.prompt && JSON.stringify(a.choices) === JSON.stringify(b.choices));
  if (get('when')) d.when = keepItemIds(base.when, d.when, (a, b) => a.start === b.start && a.end === b.end);
  if (get('shifts')) d.shifts = keepItemIds(base.shifts, d.shifts,
    (a, b) => a.name === b.name && a.start === b.start && a.end === b.end);
  for (const k of ['cost', 'rides_note', 'link', 'about'] as const) if (get(k)) d[k] = v(k);
  return { draft: d, errors };
}

export function answerBuffer(v: EventView): string {
  const e = v.event;
  const a = blankAnswer(e, v.mine);
  const left = (id: number, count: number) => count - (v.claimed.find((c) => c.id === id)?.count ?? 0);
  const has = (m: Module) => e.modules.includes(m);
  const lines = [
    `# Your answer to "${e.title}" (E${e.id})`,
    '# ^O sends it, ^X closes.',
    `status: ${a.status}`.padEnd(32) + '# going | maybe | no',
  ];
  if (guestLimit(e) > 0) lines.push(`guests: ${a.plus}`.padEnd(32) + `# up to ${guestLimit(e)}`, `kids: ${a.kids}`, `names: ${a.names}`);
  if (has('when')) lines.push(`times: ${e.when.filter((o) => a.when?.includes(o.id)).map((o) => span(o.start, o.end)).join(' | ')}`, ...e.when.map((o, i) => `#   ${i + 1}) ${span(o.start, o.end)}`), '#   (list the times that work, or their numbers: 1, 3)');
  if (has('bring') && e.bring.length) lines.push(`bring: ${e.bring.filter((s) => a.bring?.includes(s.id)).map((s) => s.name).join(', ')}`, `#   still needed: ${e.bring.map((s) => `${s.name} (${left(s.id, s.count)})`).join(', ')}`, `bring_other: ${a.bring_other}`);
  if (has('shifts') && e.shifts.length) lines.push(`shifts: ${e.shifts.filter((s) => a.shifts?.includes(s.id)).map((s) => s.name).join(', ')}`, `#   ${e.shifts.map((s) => `${s.name} ${span(s.start, s.end)}`).join(' · ')}`);
  if (has('rides')) lines.push(`ride: ${a.ride || '-'}`.padEnd(32) + '# need | offer | own | -', `seats: ${a.seats}`);
  if (has('diet')) lines.push(`diet: ${a.diet}`.padEnd(32) + (e.diet_prompt ? `# ${e.diet_prompt}` : ''));
  if (has('questions')) e.questions.forEach((q) => lines.push(`q${q.id}: ${a.answers?.find((x) => x.question === q.id)?.value ?? ''}`.padEnd(32) + `# ${q.prompt}${q.kind === 'choice' ? ` (${q.choices.join(' / ')})` : q.kind === 'yesno' ? ' (yes / no)' : ''}`));
  lines.push(`note: ${a.note}`);
  return lines.join('\n');
}

export function readAnswer(text: string, v: EventView): { answer: RsvpInput; errors: Parsed['errors'] } {
  const { values, errors } = parseBuffer(text);
  const e = v.event;
  const a: RsvpInput = blankAnswer(e, v.mine);
  const get = (k: string) => values.get(k);
  const val = (k: string) => get(k)?.value ?? '';
  const names = (raw: string, items: { id: number; name: string }[], k: string) =>
    raw.split(',').map((s) => s.trim()).filter(Boolean).flatMap((s) => {
      const hit = items.find((x) => x.name.toLowerCase() === s.toLowerCase()) ?? items.find((x) => x.name.toLowerCase().startsWith(s.toLowerCase()));
      if (!hit) errors.push({ line: get(k)!.line, message: `no ${k} item called "${s}"` });
      return hit ? [hit.id] : [];
    });
  if (get('status')) {
    if (!['going', 'maybe', 'no'].includes(val('status'))) errors.push({ line: get('status')!.line, message: 'status: going, maybe or no' });
    else a.status = val('status') as RsvpInput['status'];
  }
  if (get('guests')) {
    a.plus = Number(val('guests')) || 0;
    if (a.plus > guestLimit(e) && a.plus > (v.mine?.plus ?? 0)) errors.push({ line: get('guests')!.line, message: `at most ${guestLimit(e)} guests here` });
  }
  if (get('kids')) a.kids = Number(val('kids')) || 0;
  if (get('names')) a.names = val('names');
  if (get('times')) {
    a.when = val('times').split(/[|,]/).map((s) => s.trim()).filter(Boolean).flatMap((s) => {
      if (/^\d$/.test(s)) return e.when[Number(s) - 1] ? [e.when[Number(s) - 1].id] : [];
      const t = parseWhen(s.split('-').slice(0, 3).join('-'));
      const hit = e.when.find((o) => Math.abs(o.start - t) < 60);
      if (!hit) errors.push({ line: get('times')!.line, message: `"${s}" isn't one of the times` });
      return hit ? [hit.id] : [];
    });
  }
  if (get('bring')) a.bring = names(val('bring'), e.bring, 'bring');
  if (get('bring_other')) a.bring_other = val('bring_other');
  if (get('shifts')) a.shifts = names(val('shifts'), e.shifts, 'shifts');
  if (get('ride')) a.ride = val('ride') === '-' ? '' : val('ride');
  if (get('seats')) a.seats = Number(val('seats')) || 0;
  if (get('diet')) a.diet = val('diet');
  if (get('note')) a.note = val('note');
  a.answers = e.questions.filter((q) => get(`q${q.id}`)).map((q) => ({ question: q.id, value: val(`q${q.id}`) }));
  return { answer: a, errors };
}

export function meBuffer(m: Me): string {
  return [
    `# ${m.display_name} (${m.role})   ^O saves`,
    `display_name: ${m.display_name}`,
    `email: ${m.email}`,
    `discoverable: ${m.discoverable}`.padEnd(32) + '# public | members | nobody',
    `email_notify: ${m.email_notify ? 'yes' : 'no'}`,
    'bio: |',
    ...(m.bio ? m.bio.split('\n').map((l) => `  ${l}`) : ['  ']),
  ].join('\n');
}

export function readMe(text: string): { change: Record<string, unknown>; errors: Parsed['errors'] } {
  const { values, errors } = parseBuffer(text);
  const change: Record<string, unknown> = {};
  for (const k of ['display_name', 'email', 'discoverable', 'bio']) if (values.has(k)) change[k] = values.get(k)!.value;
  if (values.has('email_notify')) change['email_notify'] = /^(yes|y|true|1)$/i.test(values.get('email_notify')!.value);
  return { change, errors };
}

export function groupBuffer(): string {
  return [
    '# New group   ^O creates it',
    'name: ',
    'kind: circle'.padEnd(32) + '# club | circle | one-off',
    'visibility: unlisted'.padEnd(32) + '# public | unlisted | private',
    'join: approval'.padEnd(32) + '# open | approval | invite',
    'about: |',
    '  ',
  ].join('\n');
}
