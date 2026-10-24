import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * A frame for the Classic app's screens that Club House reuses as they are:
 * admin, channels, invitation links, Mastodon sign-in. Their styles are
 * scoped to .classic (classic.css).
 */
@Component({
  selector: 'ch-classic',
  imports: [RouterOutlet],
  template: `<div class="classic"><router-outlet /></div>`,
})
export class ClassicFrame {}
