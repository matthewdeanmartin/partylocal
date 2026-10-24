import { Injectable, signal } from '@angular/core';

/** One line at the bottom, for a few seconds. */
@Injectable({ providedIn: 'root' })
export class Toast {
  readonly text = signal('');
  private timer = 0;

  say(text: string): void {
    this.text.set(text);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.text.set(''), 3000) as unknown as number;
  }
}
