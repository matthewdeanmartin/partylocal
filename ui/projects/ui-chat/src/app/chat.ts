import { Injectable, signal } from '@angular/core';
import type { EventPage, GroupPage } from 'party-ng';
import type { EventSummary, GroupView, Me, NoticeView, PersonView, RsvpView } from 'party-core';

/** Something the board shows inside a message, beyond text. */
export type Card =
  | { type: 'event'; page: EventPage }
  | { type: 'events'; events: EventSummary[]; empty: string }
  | { type: 'group'; page: GroupPage }
  | { type: 'groups'; groups: GroupView[] }
  | { type: 'people'; people: PersonView[] }
  | { type: 'rsvps'; rsvps: RsvpView[] }
  | { type: 'notices'; notices: NoticeView[] }
  | { type: 'me'; me: Me };

export interface Chip {
  label: string;
  run: () => void;
  /** A quieter chip (cancel, skip). */
  soft?: boolean;
}

export interface Msg {
  id: number;
  from: 'bot' | 'me';
  text: string;
  card?: Card;
  chips?: Chip[];
  /** The board is typing (a "…" bubble). */
  typing?: boolean;
}

/** What the composer should collect for the question the board just asked. */
export interface Question {
  input: 'text' | 'number' | 'pin' | 'datetime' | 'none';
  placeholder: string;
  /** Options as chips; with `many`, they toggle and a Done chip sends. */
  options?: { label: string; value: string }[];
  many?: boolean;
  picked?: string[];
  optional?: boolean;
  resolve: (value: string | string[]) => void;
  reject: (why: Cancelled) => void;
}

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * The thread and the one open question. Flows are plain async functions:
 * `await chat.ask(...)` waits for the person's reply in the composer.
 */
@Injectable({ providedIn: 'root' })
export class Chat {
  readonly messages = signal<Msg[]>([]);
  readonly question = signal<Question | null>(null);
  private seq = 0;

  say(text: string, extra: Partial<Msg> = {}): Msg {
    const m: Msg = { id: ++this.seq, from: 'bot', text, ...extra };
    // Old chips go quiet once something newer is said.
    this.messages.update((list) => [...list.map((x) => (x.chips ? { ...x, chips: undefined } : x)), m]);
    return m;
  }

  echo(text: string): void {
    this.messages.update((list) => [...list.map((x) => (x.chips ? { ...x, chips: undefined } : x)), { id: ++this.seq, from: 'me', text }]);
  }

  /** Shows "…" until `work` finishes. */
  async typing<T>(work: Promise<T>): Promise<T> {
    const id = ++this.seq;
    this.messages.update((list) => [...list, { id, from: 'bot', text: '', typing: true }]);
    try {
      return await work;
    } finally {
      this.messages.update((list) => list.filter((m) => m.id !== id));
    }
  }

  /** Asks and waits for a typed answer (or a chip). Rejects with Cancelled. */
  ask(prompt: string, q: Partial<Omit<Question, 'resolve' | 'reject'>> = {}): Promise<string> {
    this.cancelOpen();
    this.say(prompt);
    return new Promise<string>((resolve, reject) => {
      this.question.set({ input: 'text', placeholder: 'Type your answer', ...q, resolve: (v) => resolve(String(v)), reject });
    });
  }

  /** Asks with chips only. */
  choose(prompt: string, options: { label: string; value: string }[], optional = false): Promise<string> {
    return this.ask(prompt, { input: 'none', options, optional, placeholder: '' });
  }

  /** Asks with toggling chips and a Done chip. */
  chooseMany(prompt: string, options: { label: string; value: string }[], picked: string[] = []): Promise<string[]> {
    this.cancelOpen();
    this.say(prompt);
    return new Promise<string[]>((resolve, reject) => {
      this.question.set({ input: 'none', placeholder: '', options, many: true, picked, resolve: (v) => resolve(v as string[]), reject });
    });
  }

  /** The composer's reply to the open question. */
  reply(value: string | string[], shown: string): void {
    const q = this.question();
    if (!q) return;
    this.question.set(null);
    this.echo(shown);
    q.resolve(value);
  }

  cancelOpen(): void {
    const q = this.question();
    if (!q) return;
    this.question.set(null);
    q.reject(new Cancelled());
  }

  clear(): void {
    this.messages.set([]);
  }
}
