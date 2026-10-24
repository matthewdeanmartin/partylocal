import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { blankAnswer, colour, count, EventView, GroupView, headline, initials, KIND_INFO, RsvpInput, when } from 'party-core';
import { Api, answerEvent, joinGroup, loadOverview, problem, relative } from 'party-ng';
import { Steps, stepsFor } from './steps';
import { Toast } from './toast';

type Card = { kind: 'event'; view: EventView } | { kind: 'group'; group: GroupView };
const SKIPPED = 'party-deck:skipped';

/**
 * The deck: everything waiting on you as a stack of cards. Swipe right to
 * go (or join), left to pass, up for maybe. Buttons do the same.
 */
@Component({
  selector: 'deck-home',
  imports: [Steps, RouterLink],
  template: `
    <header class="head">
      <div><small>{{ greeting() }}</small><h1>For you</h1></div>
      <a routerLink="/inbox" class="bell" aria-label="Notifications">🔔@if (api.summary()?.unread) { <b>{{ api.summary()!.unread }}</b> }</a>
    </header>
    <div class="stack" [class.empty]="!cards().length">
      @if (!loaded()) {
        <div class="card placeholder"></div>
      } @else if (!cards().length) {
        <div class="done">
          <span>🎉</span>
          <h2>All caught up</h2>
          <p>Nothing is waiting on you.</p>
          <a routerLink="/plans" class="pill">See your plans</a>
          <button type="button" class="pill ghost" (click)="reshuffle()">Show skipped cards</button>
        </div>
      }
      @for (c of cards().slice(0, 3).reverse(); track key(c); let top = $last) {
        <article class="card" [class.top]="top" [class.fly]="top && flying()" [style.--c]="tint(c)"
          [style.transform]="top ? transform() : 'translateY(' + (cards().slice(0, 3).length - 1 - $index) * 10 + 'px) scale(' + (1 - (cards().slice(0, 3).length - 1 - $index) * .04) + ')'"
          (pointerdown)="top && down($event)" (pointermove)="top && move($event)" (pointerup)="top && up()" (pointercancel)="top && reset()">
          @if (top) {
            <span class="stamp yes" [style.opacity]="stamp('right')">{{ c.kind === 'group' ? 'JOIN' : 'GOING' }}</span>
            <span class="stamp no" [style.opacity]="stamp('left')">{{ c.kind === 'group' ? 'SKIP' : 'NOPE' }}</span>
            @if (c.kind === 'event') { <span class="stamp maybe" [style.opacity]="stamp('up')">MAYBE</span> }
          }
          @if (c.kind === 'event') {
            @let v = c.view;
            <div class="hero"><span class="emoji">{{ icon(v.event.kind) }}</span><span class="tag">{{ v.group_name }}</span></div>
            <div class="info">
              <h2>{{ v.event.title }}</h2>
              <p class="when">{{ v.event.start ? when(v.event.start, v.event.end) : 'Time to be decided: vote on times' }}</p>
              @if (v.event.start) { <p class="rel">{{ rel(v.event.start) }}</p> }
              <p class="where">📍 {{ v.event.place || (v.event.where_kind === 'tbd' ? 'Place TBD' : "Someone's home") }}</p>
              <p class="who">{{ headline(v.heads, v.event.capacity, v.maybe) }} · hosted by {{ v.host_names.join(', ') }}</p>
              @if (v.event.about) { <p class="about">{{ v.event.about }}</p> }
              @if (v.event.invitees.includes(api.me()?.id ?? 0)) { <p class="invited">✉️ You're invited</p> }
            </div>
          } @else {
            @let g = c.group;
            <div class="hero"><span class="emoji initials">{{ initials(g.name) }}</span><span class="tag">a group you could join</span></div>
            <div class="info">
              <h2>{{ g.name }}</h2>
              <p class="who">{{ count(g.members, 'member') }} · {{ g.join === 'open' ? 'anyone can join' : 'organizers approve' }}</p>
              @if (g.about) { <p class="about">{{ g.about }}</p> }
            </div>
          }
        </article>
      }
    </div>
    @if (cards().length) {
      <div class="actions">
        <button type="button" class="no" (click)="decide('left')" aria-label="Pass">✕</button>
        @if (cards()[0].kind === 'event') { <button type="button" class="maybe" (click)="decide('up')" aria-label="Maybe">?</button> }
        <button type="button" class="yes" (click)="decide('right')" [attr.aria-label]="cards()[0].kind === 'group' ? 'Join' : 'Going'">✓</button>
      </div>
      <p class="hint">{{ cards().length }} to go · swipe, or use the buttons
        @if (cards()[0].kind === 'event') { · <a [routerLink]="['/e', $any(cards()[0]).view.event.id]">details</a> }</p>
    }
    @if (asking(); as q) {
      <deck-steps [view]="q.view" [status]="q.status" (done)="answered($event)" (cancel)="asking.set(null)" />
    }
  `,
})
export class Deck implements OnInit {
  readonly api = inject(Api);
  private readonly toast = inject(Toast);
  readonly cards = signal<Card[]>([]);
  readonly loaded = signal(false);
  readonly asking = signal<{ view: EventView; status: RsvpInput['status'] } | null>(null);
  readonly dx = signal(0);
  readonly dy = signal(0);
  readonly flying = signal(false);
  private start: [number, number] | null = null;
  readonly when = when;
  readonly headline = headline;
  readonly initials = initials;
  readonly count = count;

  readonly transform = computed(() => `translate(${this.dx()}px, ${this.dy()}px) rotate(${this.dx() / 18}deg)`);
  readonly greeting = computed(() => {
    const h = new Date().getHours();
    return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${this.api.me()?.display_name.split(' ')[0] ?? ''}`;
  });

  async ngOnInit(): Promise<void> {
    try {
      const o = await loadOverview(this.api);
      const skipped = new Set<string>(JSON.parse(sessionStorage.getItem(SKIPPED) ?? '[]'));
      const views = await Promise.all(o.waiting.map((e) => this.api.get<EventView>(`/api/v1/events/${e.id}`, 'EventView').catch(() => null)));
      const cards: Card[] = [
        ...views.filter((v): v is EventView => !!v && v.can_answer).map((view) => ({ kind: 'event' as const, view })),
        ...o.others.filter((g) => g.join !== 'invite').map((group) => ({ kind: 'group' as const, group })),
      ];
      this.cards.set(cards.filter((c) => !skipped.has(this.key(c))));
    } catch (e) {
      this.toast.say(problem(e));
    } finally {
      this.loaded.set(true);
    }
  }

  key(c: Card): string {
    return c.kind === 'event' ? `e${c.view.event.id}` : `g${c.group.id}`;
  }

  reshuffle(): void {
    sessionStorage.removeItem(SKIPPED);
    this.loaded.set(false);
    void this.ngOnInit();
  }

  down(e: PointerEvent): void {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.start = [e.clientX, e.clientY];
  }

  move(e: PointerEvent): void {
    if (!this.start) return;
    this.dx.set(e.clientX - this.start[0]);
    this.dy.set(Math.min(0, e.clientY - this.start[1]));
  }

  up(): void {
    if (!this.start) return;
    this.start = null;
    const [dx, dy] = [this.dx(), this.dy()];
    if (dx > 110) void this.decide('right');
    else if (dx < -110) void this.decide('left');
    else if (dy < -110 && this.cards()[0]?.kind === 'event') void this.decide('up');
    else this.reset();
  }

  reset(): void {
    this.start = null;
    this.dx.set(0);
    this.dy.set(0);
  }

  stamp(dir: 'left' | 'right' | 'up'): number {
    const v = dir === 'right' ? this.dx() : dir === 'left' ? -this.dx() : -this.dy();
    return Math.max(0, Math.min(1, v / 110));
  }

  /** Flies the top card off and does what the direction means. */
  async decide(dir: 'left' | 'right' | 'up'): Promise<void> {
    const card = this.cards()[0];
    if (!card) return;
    this.flying.set(true);
    this.dx.set(dir === 'right' ? 600 : dir === 'left' ? -600 : 0);
    this.dy.set(dir === 'up' ? -700 : this.dy());
    await new Promise((r) => setTimeout(r, 220));
    this.flying.set(false);
    this.reset();
    this.cards.update((c) => c.slice(1));
    if (card.kind === 'group') {
      if (dir === 'right') {
        try {
          const g = await joinGroup(this.api, card.group.id);
          this.toast.say(g.my_status === 'active' ? `Joined ${g.name} 🎉` : `Asked to join ${g.name}`);
        } catch (e) {
          this.toast.say(problem(e));
        }
      } else this.skip(card);
      return;
    }
    const status = dir === 'right' ? 'going' : dir === 'up' ? 'maybe' : 'no';
    if (stepsFor(card.view, status).length) {
      this.asking.set({ view: card.view, status });
      return;
    }
    try {
      this.answered(await answerEvent(this.api, card.view.event.id, { ...blankAnswer(card.view.event, card.view.mine), status }));
    } catch (e) {
      this.toast.say(problem(e));
      this.cards.update((c) => [card, ...c]);
    }
  }

  answered(v: EventView): void {
    this.asking.set(null);
    const s = v.mine?.status;
    this.toast.say(s === 'going' ? `You're going to ${v.event.title} ✓` : s === 'waitlist' ? 'Full: you are on the waitlist ⏳' : s === 'maybe' ? 'Marked maybe' : `Passed on ${v.event.title}`);
    void this.api.refreshSummary();
  }

  private skip(card: Card): void {
    const skipped = new Set<string>(JSON.parse(sessionStorage.getItem(SKIPPED) ?? '[]'));
    skipped.add(this.key(card));
    sessionStorage.setItem(SKIPPED, JSON.stringify([...skipped]));
  }

  tint(c: Card): string {
    return colour(c.kind === 'event' ? c.view.event.group : c.group.id);
  }

  icon(kind: string): string {
    return KIND_INFO[kind as keyof typeof KIND_INFO]?.icon ?? '📅';
  }

  rel(t: number): string {
    return relative(t);
  }
}
