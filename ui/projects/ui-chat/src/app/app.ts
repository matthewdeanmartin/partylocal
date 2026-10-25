import { afterRenderEffect, Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { colour, count, headline, initials, KIND_INFO, NOTICE_TEXT, ROLE_LABEL, STATUS_LABEL, when } from 'party-core';
import { Api, relative } from 'party-ng';
import { Brain } from './brain';
import { Chat } from './chat';

/**
 * One screen: a conversation with the board. No menus; everything is a
 * message, a card inside one, or a chip to tap instead of typing.
 */
@Component({
  selector: 'party-chat',
  template: `
    <header>
      <span class="bot" aria-hidden="true">🎉</span>
      <div>
        <strong>{{ api.status()?.instance ?? 'party' }}</strong>
        <small>{{ api.me() ? 'online · talking to ' + api.me()!.display_name : 'the house party board' }}</small>
      </div>
      @if (api.summary()?.unread; as n) {
        <button type="button" class="unread" (click)="brain.hear('notifications')" [attr.aria-label]="n + ' unread notifications'">🔔 {{ n }}</button>
      }
    </header>
    <main #thread aria-live="polite">
      @for (m of chat.messages(); track m.id) {
        <div class="msg" [class.me]="m.from === 'me'">
          @if (m.typing) {
            <p class="bubble typing" aria-label="typing"><i></i><i></i><i></i></p>
          } @else {
            @if (m.text) { <p class="bubble">{{ m.text }}</p> }
            @if (m.card; as c) {
              @switch (c.type) {
                @case ('event') {
                  @if (c.page.view; as v) {
                    <article class="card event" [class.off]="v.event.status === 'cancelled'">
                      <header [style.background]="tint(v.event.group)">
                        <span class="kind">{{ icon(v.event.kind) }}</span>
                        <div><h3>{{ v.event.title }}</h3><small>{{ v.group_name }} · E{{ v.event.id }}</small></div>
                      </header>
                      <dl>
                        <dt>When</dt><dd>{{ v.event.start ? when(v.event.start, v.event.end) : 'To be decided (time poll)' }} @if (v.event.start) { <small>· {{ rel(v.event.start) }}</small> }</dd>
                        <dt>Where</dt><dd>{{ where(v) }}</dd>
                        <dt>Hosts</dt><dd>{{ v.host_names.join(', ') }}</dd>
                        <dt>Coming</dt><dd>{{ headline(v.heads, v.event.capacity, v.maybe) }}@if (v.waitlist) { · {{ v.waitlist }} waiting }</dd>
                        @if (v.event.cost) { <dt>Cost</dt><dd>{{ v.event.cost }}</dd> }
                      </dl>
                      @if (v.event.about) { <p class="about">{{ v.event.about }}</p> }
                      @if (v.event.bring.length) {
                        <p class="tags">@for (s of v.event.bring; track s.id) { <span [class.full]="claimed(v, s.id) >= s.count">{{ s.name }} {{ claimed(v, s.id) }}/{{ s.count }}</span> }</p>
                      }
                      @if (v.event.when.length && !v.event.start) {
                        <p class="tags">@for (o of v.event.when; track o.id) { <span>{{ when(o.start, o.end) }}: {{ vote(v, o.id) }} 👍</span> }</p>
                      }
                      @if (v.mine) { <p class="mine">You: <b>{{ status(v.mine.status) }}</b>@if (v.mine.plus) { +{{ v.mine.plus }} }</p> }
                      @if (v.event.status === 'cancelled') { <p class="mine">Cancelled</p> }
                    </article>
                  }
                }
                @case ('events') {
                  <ul class="card list">
                    @for (e of c.events; track e.id) {
                      <li><button type="button" (click)="brain.hear('e' + e.id)">
                        <span class="kind">{{ icon(e.kind) }}</span>
                        <span class="grow"><b>{{ e.title }}</b><small>{{ e.polling ? 'Time to be decided' : when(e.start, e.end) }} · {{ e.group_name }}</small></span>
                        @if (e.my_status) { <span class="pill" [attr.data-s]="e.my_status">{{ status(e.my_status) }}</span> }
                        <code>E{{ e.id }}</code>
                      </button></li>
                    } @empty { <li class="none">{{ c.empty || 'Nothing here.' }}</li> }
                  </ul>
                }
                @case ('group') {
                  @if (c.page.group; as g) {
                    <article class="card group">
                      <header [style.background]="tint(g.id)"><span class="avatar">{{ initials(g.name) }}</span><div><h3>{{ g.name }}</h3><small>{{ count(g.members, 'member') }} · {{ g.visibility }} · {{ g.join === 'open' ? 'open to join' : g.join === 'approval' ? 'ask to join' : 'invitation only' }}</small></div></header>
                      @if (g.about) { <p class="about">{{ g.about }}</p> }
                      @if (g.my_role) { <p class="mine">You're {{ role(g.my_role) }}@if (g.requests) { · {{ g.requests }} waiting to join }</p> }
                      @if (g.my_status === 'requested') { <p class="mine">You asked to join.</p> }
                      <ul class="list">
                        @for (e of c.page.events.slice(0, 5); track e.id) {
                          <li><button type="button" (click)="brain.hear('e' + e.id)"><span class="kind">{{ icon(e.kind) }}</span><span class="grow"><b>{{ e.title }}</b><small>{{ e.polling ? 'Time to be decided' : when(e.start, e.end) }}</small></span></button></li>
                        } @empty { <li class="none">Nothing planned yet.</li> }
                      </ul>
                    </article>
                  }
                }
                @case ('groups') {
                  <ul class="card list">
                    @for (g of c.groups; track g.id) {
                      <li><button type="button" (click)="brain.hear('group ' + g.slug)">
                        <span class="avatar" [style.background]="tint(g.id)">{{ initials(g.name) }}</span>
                        <span class="grow"><b>{{ g.name }}</b><small>{{ count(g.members, 'member') }}@if (g.my_status === 'requested') { · asked to join }@if (g.my_role && g.my_role !== 'member') { · {{ role(g.my_role) }} }</small></span>
                      </button></li>
                    }
                  </ul>
                }
                @case ('people') {
                  <ul class="card list">
                    @for (p of c.people; track p.id) {
                      <li><span class="row"><span class="avatar" [style.background]="tint(p.id + 50)">{{ initials(p.display_name) }}</span><span class="grow"><b>{{ p.display_name }}</b><small>{{ p.bio || p.household_name }}</small></span></span></li>
                    }
                  </ul>
                }
                @case ('rsvps') {
                  <ul class="card list">
                    @for (r of c.rsvps; track r.person) {
                      <li><span class="row"><span class="avatar" [style.background]="tint(r.person + 50)">{{ initials(r.display_name) }}</span><span class="grow"><b>{{ r.display_name }}@if (r.plus) { +{{ r.plus }} }</b><small>{{ r.note || (r.by_name ? 'answered by ' + r.by_name : '') }}</small></span><span class="pill" [attr.data-s]="r.status">{{ status(r.status) }}</span></span></li>
                    } @empty { <li class="none">No answers yet.</li> }
                  </ul>
                }
                @case ('notices') {
                  <ul class="card list">
                    @for (n of c.notices; track n.id) {
                      <li [class.unread]="!n.read"><button type="button" (click)="n.event ? brain.hear('e' + n.event) : brain.hear('group ' + n.group_name)">
                        <span class="grow">{{ notice(n) }}<small>{{ rel(n.created) }}</small></span>
                      </button></li>
                    } @empty { <li class="none">Nothing yet.</li> }
                  </ul>
                }
                @case ('me') {
                  <article class="card me">
                    <header [style.background]="tint(c.me.id + 50)"><span class="avatar">{{ initials(c.me.display_name) }}</span><div><h3>{{ c.me.display_name }}</h3><small>{{ c.me.role }} · {{ c.me.email || 'no email' }}</small></div></header>
                    <dl>
                      <dt>About</dt><dd>{{ c.me.bio || '—' }}</dd>
                      <dt>Home</dt><dd>{{ c.me.household_name || '—' }}</dd>
                      <dt>Found by</dt><dd>{{ c.me.discoverable === 'public' ? 'everyone here' : c.me.discoverable === 'members' ? 'people in my groups' : 'nobody' }}</dd>
                    </dl>
                  </article>
                }
              }
            }
            @if (m.chips?.length) {
              <div class="chips">@for (c of m.chips; track c.label) { <button type="button" [class.soft]="c.soft" (click)="c.run()">{{ c.label }}</button> }</div>
            }
          }
        </div>
      }
      @if (chat.question(); as q) {
        @if (q.options?.length) {
          <div class="chips answer">
            @for (o of q.options; track o.value) {
              <button type="button" [class.on]="q.many && picked().includes(o.value)" (click)="option(o.value, o.label)">{{ o.label }}</button>
            }
            @if (q.many) { <button type="button" class="done" (click)="done()">Done{{ picked().length ? ' (' + picked().length + ')' : '' }}</button> }
            @if (q.optional) { <button type="button" class="soft" (click)="chat.reply('', 'Skip')">Skip</button> }
            <button type="button" class="soft" (click)="brain.hear('cancel')">Cancel</button>
          </div>
        }
      }
    </main>
    <form class="composer" (submit)="send($event)">
      @if (chat.question()?.input === 'datetime') {
        <input type="datetime-local" aria-label="Pick a date and time" (change)="pickDate($event)" />
      }
      <input #box [type]="chat.question()?.input === 'pin' ? 'password' : chat.question()?.input === 'number' ? 'number' : 'text'"
        [attr.inputmode]="chat.question()?.input === 'pin' || chat.question()?.input === 'number' ? 'numeric' : null"
        [placeholder]="placeholder()" [value]="draft()" (input)="draft.set($any($event.target).value)" aria-label="Message" [disabled]="brain.starting()"
        [attr.autocomplete]="chat.question()?.input === 'pin' ? 'current-password' : 'off'" />
      <button type="submit" [disabled]="brain.starting() || !draft().trim()" aria-label="Send">➤</button>
    </form>
  `,
})
export class App implements OnInit {
  readonly api = inject(Api);
  readonly chat = inject(Chat);
  readonly brain = inject(Brain);
  readonly draft = signal('');
  readonly picked = signal<string[]>([]);
  private readonly thread = viewChild.required<ElementRef<HTMLElement>>('thread');
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');
  readonly placeholder = computed(() => {
    const q = this.chat.question();
    if (!q) return 'Say something… (“help” lists what I understand)';
    if (q.input === 'none') return 'Tap an answer, or type it';
    return q.placeholder || 'Type your answer';
  });
  readonly when = when;
  readonly headline = headline;
  readonly initials = initials;
  readonly count = count;

  constructor() {
    // New messages scroll into view; the composer keeps focus.
    afterRenderEffect(() => {
      this.chat.messages();
      const q = this.chat.question();
      this.picked.set(q?.picked ?? []);
      const el = this.thread().nativeElement;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      if (q && q.input !== 'none') this.box().nativeElement.focus();
    });
  }

  ngOnInit(): void {
    void this.brain.start();
  }

  send(e: Event): void {
    e.preventDefault();
    const text = this.draft();
    this.draft.set('');
    this.box().nativeElement.value = '';
    this.brain.hear(text);
  }

  option(value: string, label: string): void {
    const q = this.chat.question();
    if (!q) return;
    if (q.many) {
      this.picked.update((p) => (p.includes(value) ? p.filter((x) => x !== value) : [...p, value]));
      return;
    }
    this.chat.reply(value, label);
  }

  done(): void {
    const q = this.chat.question();
    const labels = (q?.options ?? []).filter((o) => this.picked().includes(o.value)).map((o) => o.label);
    this.chat.reply(this.picked(), labels.length ? labels.join(', ') : 'None of them');
  }

  pickDate(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    if (v) this.chat.reply(String(Math.floor(new Date(v).getTime() / 1000)), when(Math.floor(new Date(v).getTime() / 1000)));
  }

  tint(id: number): string {
    return colour(id);
  }

  icon(kind: string): string {
    return KIND_INFO[kind as keyof typeof KIND_INFO]?.icon ?? '📅';
  }

  status(s: string): string {
    return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s;
  }

  role(r: string): string {
    return (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r).toLowerCase();
  }

  rel(t: number): string {
    return relative(t);
  }

  claimed(v: { claimed: { id: number; count: number }[] }, id: number): number {
    return v.claimed.find((c) => c.id === id)?.count ?? 0;
  }

  vote(v: { votes: { id: number; count: number }[] }, id: number): number {
    return v.votes.find((c) => c.id === id)?.count ?? 0;
  }

  where(v: { event: { where_kind: string; place: string; address: string } }): string {
    const e = v.event;
    if (e.where_kind === 'tbd') return 'To be decided';
    return [e.place || (e.where_kind === 'home' ? "Someone's home" : ''), e.address].filter(Boolean).join(', ');
  }

  notice(n: { kind: string; actor_name: string; event_title: string; group_name: string; count: number }): string {
    const verb = NOTICE_TEXT[n.kind] ?? n.kind;
    const what = n.event_title || n.group_name;
    const who = n.actor_name ? `${n.actor_name}${n.count > 1 ? ` and ${n.count - 1} more` : ''} ` : '';
    return verb.endsWith(':') || !who ? `${verb} ${what}` : `${who}${verb} ${what}`;
  }
}
