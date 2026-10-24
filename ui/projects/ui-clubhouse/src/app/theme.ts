import { computed, effect, Injectable, signal } from '@angular/core';
import { Lexicon, THEMES, ThemeName } from './lexicon';

const KEY = 'party-clubhouse:theme';

/**
 * The look and the words. Switching sets <html data-theme> (the CSS) and
 * the lexicon every template reads, so nothing reloads.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  readonly name = signal<ThemeName>(read());
  readonly t = computed<Lexicon>(() => THEMES[this.name()]);
  readonly all = Object.values(THEMES);

  constructor() {
    effect(() => {
      const n = this.name();
      document.documentElement.dataset['theme'] = n;
      document.title = THEMES[n].app;
      try {
        localStorage.setItem(KEY, n);
      } catch {
        // Not remembered.
      }
    });
  }

  set(n: string): void {
    if (n in THEMES) this.name.set(n as ThemeName);
  }

  next(): void {
    const names = Object.keys(THEMES) as ThemeName[];
    this.name.set(names[(names.indexOf(this.name()) + 1) % names.length]);
  }
}

function read(): ThemeName {
  try {
    const n = localStorage.getItem(KEY);
    if (n && n in THEMES) return n as ThemeName;
  } catch {
    // Default.
  }
  return 'clubhouse';
}
