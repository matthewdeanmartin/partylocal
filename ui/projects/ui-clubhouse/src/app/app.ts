import { Component, inject } from '@angular/core';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { View } from './view';

/**
 * Club House: the desktop forms app (under /) and the phone deck (under
 * /m), one board. A phone opening a desktop link is sent to the deck.
 */
@Component({
  selector: 'party-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {
  private readonly view = inject(View);
  private readonly router = inject(Router);

  constructor() {
    const first = this.router.events.subscribe((e) => {
      if (!(e instanceof NavigationStart)) return;
      first.unsubscribe();
      const to = this.view.settle(e.url);
      if (to) setTimeout(() => void this.router.navigateByUrl(to, { replaceUrl: true }));
    });
  }
}
