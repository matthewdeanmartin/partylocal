import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from 'party-ng';
import { ChatPanel } from '../chat/panel';
import { Theme } from '../theme';
import { View } from '../view';
import { SHORTCUTS, Shortcuts } from './shortcuts';

/**
 * The desktop app: masthead, the contents strip (the menu), one page at a
 * time, and the features around it: the theme picker, the phone view, the
 * chat panel and keyboard shortcuts.
 */
@Component({
  selector: 'ch-desk',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ChatPanel],
  template: `
    @let L = theme.t();
    <div class="paper">
      <header class="masthead">
        <div class="ears">
          <span>{{ api.status()?.instance ?? 'party' }}<br />{{ L.earLeft }}</span>
          <a routerLink="/" class="nameplate">{{ L.app }}</a>
          <span>{{ L.earRight }}</span>
        </div>
        <p class="dateline"><span>{{ today }}</span><span>{{ L.issue(issue()) }}</span><span>{{ api.me() ? L.forName(api.me()!.display_name) : '' }}</span></p>
        @if (api.me()) {
          <nav class="contents" aria-label="Sections">
            <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">{{ L.nav.home }}</a>
            <a routerLink="/plans" routerLinkActive="on">{{ L.nav.plans }}@if (api.summary()?.awaiting) { <sup>{{ api.summary()!.awaiting }}</sup> }</a>
            <a routerLink="/groups" routerLinkActive="on">{{ L.nav.groups }}</a>
            <a routerLink="/calendar" routerLinkActive="on">{{ L.nav.calendar }}</a>
            <a routerLink="/notices" routerLinkActive="on">{{ L.nav.notices }}@if (api.summary()?.unread) { <sup>{{ api.summary()!.unread }}</sup> }</a>
            <a routerLink="/people" routerLinkActive="on">{{ L.nav.people }}</a>
            <a routerLink="/profile" routerLinkActive="on">{{ L.nav.profile }}</a>
            @if (api.me()!.role === 'admin') { <a routerLink="/admin" routerLinkActive="on">{{ L.nav.admin }}</a> }
            <a routerLink="/new" routerLinkActive="on" class="press">{{ L.nav.create }}</a>
          </nav>
        }
      </header>
      @if (api.ready() && !api.status()) { <p class="stop">{{ L.stop }}</p> }
      <main><router-outlet /></main>
      <footer class="colophon">
        <span>{{ L.footer }}</span>
        <span class="picker" role="radiogroup" aria-label="Theme">
          @for (t of theme.all; track t.name) { <button type="button" role="radio" [attr.aria-checked]="theme.name() === t.name" [class.on]="theme.name() === t.name" (click)="theme.set(t.name)">{{ t.label }}</button> }
        </span>
        <button type="button" class="linkish" (click)="view.toPhone()">📱 Phone view</button>
        @if (api.me()) {
          <a routerLink="/text" class="linkish">⌨ {{ L.nav.text }}</a>
          <button type="button" class="linkish" (click)="keys.help.set(true)">? Shortcuts</button>
        }
      </footer>
    </div>
    @if (api.me()) {
      @if (keys.chat()) {
        @defer (on immediate) { <ch-chat (closed)="keys.chat.set(false)" /> }
      } @else {
        <button type="button" class="chat-fab" (click)="keys.chat.set(true)" [title]="L.chatOpen + ' (c)'">💬 {{ L.chatOpen }}</button>
      }
    }
    @if (keys.help()) {
      <div class="help-scrim" (click)="keys.help.set(false)"></div>
      <div class="help-card" role="dialog" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        <p class="small">The same idea as Mastodon's: press <kbd>g</kbd>, then a letter, to go somewhere.</p>
        <dl>@for (s of shortcuts; track s[0]) { <dt><kbd>{{ s[0] }}</kbd></dt><dd>{{ s[1] }}</dd> }</dl>
        <button type="button" class="quiet" (click)="keys.help.set(false)">Close</button>
      </div>
    }
  `,
})
export class DeskShell {
  readonly api = inject(Api);
  readonly theme = inject(Theme);
  readonly view = inject(View);
  readonly keys = inject(Shortcuts);
  readonly shortcuts = SHORTCUTS;
  readonly today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  readonly issue = computed(() => {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
  });
}
