import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from 'party-ng';

/**
 * A newspaper: the masthead, the contents ribbon (the only menu), and one
 * long page per section. Every form is a sentence with blanks to fill in.
 */
@Component({
  selector: 'party-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="paper">
      <header class="masthead">
        <div class="ears">
          <span>{{ api.status()?.instance ?? 'party' }}<br />House edition</span>
          <a routerLink="/" class="nameplate">The Party Gazette</a>
          <span>Price: free<br />to residents</span>
        </div>
        <p class="dateline"><span>{{ today }}</span><span>Vol. I · No. {{ issue() }}</span><span>{{ api.me() ? 'For ' + api.me()!.display_name : 'Subscribers only' }}</span></p>
        @if (api.me()) {
          <nav class="contents" aria-label="Sections">
            <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Front Page</a>
            <a routerLink="/diary" routerLinkActive="on">Your Diary@if (api.summary()?.awaiting) { <sup>{{ api.summary()!.awaiting }}</sup> }</a>
            <a routerLink="/societies" routerLinkActive="on">Societies</a>
            <a routerLink="/notices" routerLinkActive="on">Notices@if (api.summary()?.unread) { <sup>{{ api.summary()!.unread }}</sup> }</a>
            <a routerLink="/whos-who" routerLinkActive="on">Who's Who</a>
            <a routerLink="/letters" routerLinkActive="on">Letters</a>
            <a routerLink="/press" routerLinkActive="on" class="press">Submit a Story</a>
          </nav>
        }
      </header>
      @if (api.ready() && !api.status()) {
        <p class="stop">STOP PRESS: the board is not responding. Is it on, and are you on the home Wi-Fi?</p>
      }
      <main><router-outlet /></main>
      <footer class="colophon">Printed on {{ api.status()?.secure ? 'HTTPS' : 'HTTP' }} by party v{{ api.status()?.version }} ({{ api.status()?.build }}). All the news that fits the house.</footer>
    </div>
  `,
})
export class App {
  readonly api = inject(Api);
  readonly today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  /** Days since the first of the year: the issue number. */
  readonly issue = computed(() => {
    const now = new Date();
    return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86_400_000) + 1;
  });
}
