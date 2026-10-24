import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

/** Mastodon-style: "g" then a letter goes somewhere; single keys act. */
export const SHORTCUTS: [string, string][] = [
  ['g h', 'Home'], ['g p', 'My plans'], ['g g', 'Groups'], ['g c', 'Calendar'], ['g n', 'Notifications'], ['g w', 'People'], ['g u', 'Profile'], ['g t', 'Text mode'],
  ['n', 'New event'], ['/', 'Search people'], ['c', 'Chat with the board'], ['?', 'These shortcuts'], ['Esc', 'Close / leave a field'],
];

const GO: Record<string, string> = { h: '/', p: '/plans', g: '/groups', c: '/calendar', n: '/notices', w: '/people', u: '/profile', t: '/text' };

/** Keyboard shortcuts for the desktop app (Text mode keeps its own keys, except "g"). */
@Injectable({ providedIn: 'root' })
export class Shortcuts {
  private readonly router = inject(Router);
  readonly help = signal(false);
  readonly chat = signal(false);
  private g = 0;

  constructor() {
    document.addEventListener('keydown', (e) => this.key(e));
  }

  private key(e: KeyboardEvent): void {
    if (this.router.url.startsWith('/m') || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (e.key === 'Escape') {
      this.help.set(false);
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) t.blur();
      return;
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const textMode = !!document.querySelector('.console');
    if (this.g && Date.now() - this.g < 1500 && GO[e.key]) {
      this.g = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
      void this.router.navigateByUrl(GO[e.key]);
      return;
    }
    this.g = 0;
    if (e.key === 'g') {
      this.g = Date.now();
      return;
    }
    // Text mode has its own single keys (it isn't using "g").
    if (textMode) return;
    if (e.key === '?') this.help.set(!this.help());
    else if (e.key === 'n') void this.router.navigateByUrl('/new');
    else if (e.key === 'c') this.chat.set(!this.chat());
    else if (e.key === '/') {
      void this.router.navigateByUrl('/people').then(() => setTimeout(() => document.getElementById('people-search')?.focus()));
    } else return;
    e.preventDefault();
  }
}
