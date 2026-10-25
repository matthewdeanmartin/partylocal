// Turns a page into the demo: fetch() calls to /api/v1 are answered by the
// board in this browser, the state lives in localStorage (shared by every
// UI on the same origin), and a small toolbar switches people or resets.
import { Board, DemoState } from './board';
import { route } from './routes';
import { SCHEMA } from './schema';
import { DEMO_PIN, PERSONAS, seed } from './seed';

const KEY = 'party-demo:v1';
const WEEK = 7 * 86_400;

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as DemoState;
      if (s.v === 1) return freshen(s);
    }
  } catch {
    // Private window or corrupt state: start over.
  }
  return seed();
}

function save(s: DemoState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // No storage: the demo still works until the page reloads.
  }
}

/**
 * Keeps an old demo alive: every whole week since the data was made moves
 * every date forward a week, so "next Friday" stays next Friday.
 */
export function freshen(s: DemoState, now = Math.floor(Date.now() / 1000)): DemoState {
  const weeks = Math.floor((now - s.anchored) / WEEK);
  if (weeks < 1) return s;
  const d = weeks * WEEK;
  const move = (t: number) => (t ? t + d : 0);
  const yearly = new Set(s.series.filter(s => s.rule === 'yearly').map(s => s.id));
  for (const e of s.events) {
    if (yearly.has(e.series)) continue;
    e.start = move(e.start);
    e.end = move(e.end);
    e.rsvp_by = move(e.rsvp_by);
    for (const o of e.when) Object.assign(o, { start: move(o.start), end: move(o.end) });
    for (const x of e.shifts) Object.assign(x, { start: move(x.start), end: move(x.end) });
  }
  for (const n of s.notices) n.created = move(n.created);
  for (const r of s.rsvps) r.updated = move(r.updated);
  s.anchored += d;
  return s;
}

let state: DemoState;
let board: Board;

/** The demo's state right now (for the toolbar and tests). */
export function demoState(): DemoState {
  return state;
}

async function answer(url: URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  // A little latency, so loading states are visible as on the board.
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 80));
  if (url.pathname === '/api/v1/schema') return json(200, SCHEMA);
  let body: Record<string, unknown> = {};
  if (typeof init?.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body);
    } catch {
      return json(400, { error: 'bad_json', message: 'That request body is not JSON' });
    }
  }
  const before = state.session;
  const reply = route(board, method, url, body);
  if (method !== 'GET') save(state);
  if (state.session !== before) toolbar.render();
  return json(reply.status, reply.body);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Wire-Format': 'json' } });
}

/** Installs the demo board. Call before the app bootstraps. */
export function installDemo(): void {
  state = load();
  save(state);
  board = new Board(state);
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, location.href);
    const ours = url.origin === location.origin && (url.pathname.startsWith('/api/v1/') || url.pathname.startsWith('/cal/'));
    return ours ? answer(url, input instanceof Request ? { method: input.method, ...init } : init) : real(input, init);
  };
  // Another tab (maybe another UI) changed the data: pick it up.
  addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    state = JSON.parse(e.newValue) as DemoState;
    board.state = state;
    toolbar.render();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => toolbar.mount());
  else toolbar.mount();
}

/** The UIs on this origin, for "same data, another UI" links. */
export const UIS: { path: string; name: string; blurb: string }[] = [
  { path: 'clubhouse', name: 'Club House', blurb: 'forms, themes, and every feature' },
  { path: 'classic', name: 'Classic', blurb: 'the current local app' },
  { path: 'chat', name: 'Chat', blurb: 'a conversation with the board' },
  { path: 'calendar', name: 'Calendar', blurb: 'the month is the menu' },
  { path: 'deck', name: 'Deck', blurb: 'swipe cards, phone first' },
  { path: 'terminal', name: 'Terminal', blurb: 'keyboard and command palette' },
  { path: 'gazette', name: 'Gazette', blurb: 'a newspaper you fill in' },
];

/** The toolbar, in a shadow root so no UI's styles reach it (or it theirs). */
const toolbar = {
  host: null as HTMLElement | null,
  open: false,

  mount(): void {
    this.host = document.createElement('party-demo-bar');
    this.host.attachShadow({ mode: 'open' });
    document.body.appendChild(this.host);
    this.render();
  },

  base(): string {
    const path = new URL(document.baseURI).pathname;
    const m = /^(.*\/)([a-z]+)\/$/.exec(path);
    return m && UIS.some((u) => u.path === m[2]) ? m[1] : '';
  },

  render(): void {
    const root = this.host?.shadowRoot;
    if (!root) return;
    const who = state.people.find((p) => p.id === state.session);
    const base = this.base();
    const people = PERSONAS.filter((p) => state.people.some((x) => x.display_name === p.name));
    root.innerHTML = `
      <style>
        :host { all: initial; position: fixed; z-index: 2147483000; right: 0; top: 38%; font: 12px/1.35 system-ui, sans-serif; }
        .pill { writing-mode: vertical-rl; transform: rotate(180deg); background: #1d1b2f; color: #fff; border: 0; border-radius: 0 8px 8px 0; padding: 10px 5px; cursor: pointer; box-shadow: 0 2px 10px #0005; font: inherit; opacity: .85; }
        .pill:hover, .pill[aria-expanded='true'] { opacity: 1; }
        .pill b { color: #ffd166; letter-spacing: .08em; }
        .panel { position: absolute; right: 30px; top: 0; width: 270px; background: #fff; color: #1d1b2f; border-radius: 10px; box-shadow: 0 8px 30px #0006; padding: 12px; }
        h2 { font-size: 13px; margin: 0 0 6px; }
        p { margin: 0 0 8px; color: #555; }
        button.who { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 4px 6px; border-radius: 6px; cursor: pointer; font: inherit; color: inherit; }
        button.who:hover, button.who.on { background: #f1eefc; }
        button.who small { color: #777; }
        .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
        .row button { flex: 1; font: inherit; padding: 5px; border-radius: 6px; border: 1px solid #ccc; background: #f7f7f7; cursor: pointer; }
        nav { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        nav a { color: #4b3cc4; text-decoration: none; padding: 2px 6px; border: 1px solid #ddd; border-radius: 6px; }
        @media (prefers-color-scheme: dark) { .panel { background: #23212f; color: #eee; } p, button.who small { color: #aaa; } button.who:hover, button.who.on { background: #34304a; } .row button { background: #2d2b3a; color: #eee; border-color: #444; } nav a { color: #b9b0ff; border-color: #444; } }
      </style>
      <button class="pill" type="button" aria-expanded="${this.open}"><b>DEMO</b> · ${who ? esc(who.display_name) : 'signed out'}</button>
      ${this.open ? `
        <div class="panel" role="dialog" aria-label="Demo controls">
          <h2>party demo</h2>
          <p>No board: everything is stored in this browser. Every PIN is ${DEMO_PIN}.</p>
          ${people.map((p) => {
            const x = state.people.find((y) => y.display_name === p.name)!;
            return `<button class="who ${x.id === state.session ? 'on' : ''}" data-person="${x.id}">${esc(p.name)} <small>${esc(p.blurb)}</small></button>`;
          }).join('')}
          <div class="row">
            <button data-act="out">Sign out</button>
            <button data-act="reset">Reset data</button>
            <button data-act="empty">Empty board</button>
          </div>
          ${base ? `<nav aria-label="Other UIs">${UIS.map((u) => `<a href="${base}${u.path}/" title="${esc(u.blurb)}">${u.name}</a>`).join('')}</nav>` : ''}
        </div>` : ''}`;
    root.querySelector('.pill')?.addEventListener('click', () => {
      this.open = !this.open;
      this.render();
    });
    root.querySelectorAll<HTMLButtonElement>('[data-person]').forEach((el) =>
      el.addEventListener('click', () => this.switchTo(Number(el.dataset['person']))),
    );
    root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((el) => el.addEventListener('click', () => this.act(el.dataset['act'] ?? '')));
  },

  switchTo(person: number): void {
    state.session = person;
    save(state);
    location.reload();
  },

  act(what: string): void {
    if (what === 'out') state.session = 0;
    if (what === 'reset') state = seed();
    if (what === 'empty') {
      if (!confirm('Start from an empty board? The first account you make becomes admin (as on a fresh board).')) return;
      state = seed();
      Object.assign(state, { people: [], households: [], groups: [], events: [], rsvps: [], series: [], notices: [], invites: [], session: 0 });
    }
    save(state);
    location.assign(new URL('.', document.baseURI).href);
  },
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
