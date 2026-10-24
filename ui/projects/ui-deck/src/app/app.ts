import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api } from 'party-ng';
import { Toast } from './toast';

/** A phone: the page, and a tab bar with a big ＋ in the middle. */
@Component({
  selector: 'party-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="phone">
      <div class="screen">
        @if (api.ready() && !api.status()) { <p class="error banner">The board is not responding. Is it on, and are you on the home Wi-Fi?</p> }
        <router-outlet />
      </div>
      @if (api.me()) {
        <nav class="tabs" aria-label="Main">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"><span>🃏</span>Deck@if (api.summary()?.awaiting) { <b>{{ api.summary()!.awaiting }}</b> }</a>
          <a routerLink="/plans" routerLinkActive="on"><span>📆</span>Plans</a>
          <a routerLink="/new" class="plus" aria-label="New event"><span>＋</span></a>
          <a routerLink="/groups" routerLinkActive="on"><span>👥</span>Groups</a>
          <a routerLink="/me" routerLinkActive="on"><span>🙂</span>Me</a>
        </nav>
      }
      @if (toast.text()) { <p class="toast" role="status">{{ toast.text() }}</p> }
    </div>
  `,
})
export class App {
  readonly api = inject(Api);
  readonly toast = inject(Toast);
}
