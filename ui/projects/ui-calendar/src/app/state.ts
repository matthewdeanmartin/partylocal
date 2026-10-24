import { computed, inject, Injectable, signal } from '@angular/core';
import { EventList, EventSummary, GroupList, GroupView } from 'party-core';
import { Api, problem } from 'party-ng';

/**
 * Where the calendar is, kept in the query string so links and the back
 * button work: ?m=2026-11&v=month&e=12 (an event open in the drawer),
 * &new=1730919600 (a new event at that time), &g=slug, &p=inbox|me|people|group.
 */
@Injectable({ providedIn: 'root' })
export class Nav {
  readonly params = signal(new URLSearchParams(location.search));

  constructor() {
    addEventListener('popstate', () => this.params.set(new URLSearchParams(location.search)));
  }

  get(key: string): string {
    return this.params().get(key) ?? '';
  }

  /** Changes some params (null removes); `replace` doesn't add history. */
  set(change: Record<string, string | number | null>, replace = false): void {
    const next = new URLSearchParams(this.params());
    for (const [k, v] of Object.entries(change)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    const url = `${location.pathname}${next.size ? `?${next}` : ''}`;
    if (replace) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
    this.params.set(next);
  }

  /** Opens a drawer (closing any other). */
  open(kind: 'e' | 'new' | 'g' | 'p' | 'edit', value: string | number): void {
    this.set({ e: null, new: null, g: null, p: null, edit: null, [kind]: value });
  }

  close(): void {
    this.set({ e: null, new: null, g: null, p: null, edit: null });
  }
}

/** Everything the grid draws: events (upcoming and past) and groups. */
@Injectable({ providedIn: 'root' })
export class Cal {
  private readonly api = inject(Api);
  readonly events = signal<EventSummary[]>([]);
  readonly groups = signal<GroupView[]>([]);
  readonly error = signal('');
  readonly toast = signal('');
  /** Groups whose layer is switched off (kept in this browser). */
  readonly hidden = signal<number[]>(read());
  readonly shown = computed(() => {
    const off = new Set(this.hidden());
    return this.events().filter((e) => !off.has(e.group));
  });
  readonly mine = computed(() => this.groups().filter((g) => g.my_status));
  readonly others = computed(() => this.groups().filter((g) => !g.my_status && g.status === 'active'));
  private toastTimer = 0;

  async load(): Promise<void> {
    try {
      // Follow the board's pages: a calendar wants everything.
      const all = async (query: string) => {
        const out: EventSummary[] = [];
        for (let after = 0, n = 0; n < 20; n++) {
          const page = await this.api.get<EventList>(`/api/v1/events?${query}&after=${after}`, 'EventList');
          out.push(...page.events);
          if (!page.next) break;
          after = page.next;
        }
        return out;
      };
      const [up, past, groups] = await Promise.all([all('past=0'), all('past=1'), this.api.get<GroupList>('/api/v1/groups', 'GroupList')]);
      this.events.set([...past, ...up]);
      this.groups.set(groups.groups);
      this.error.set('');
    } catch (e) {
      this.error.set(problem(e));
    }
  }

  toggle(group: number): void {
    this.hidden.update((h) => (h.includes(group) ? h.filter((x) => x !== group) : [...h, group]));
    try {
      localStorage.setItem('party-calendar:hidden', JSON.stringify(this.hidden()));
    } catch {
      // Not remembered; fine.
    }
  }

  say(text: string): void {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500) as unknown as number;
  }
}

function read(): number[] {
  try {
    return JSON.parse(localStorage.getItem('party-calendar:hidden') ?? '[]');
  } catch {
    return [];
  }
}

/** Midnight (local) of the day containing `t` (Unix seconds or Date). */
export function dayStart(t: number | Date): Date {
  const d = typeof t === 'number' ? new Date(t * 1000) : new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function secs(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

export function hhmm(t: number): string {
  return new Date(t * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
