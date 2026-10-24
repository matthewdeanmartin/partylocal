import { Component, computed, inject, signal } from '@angular/core';
import { Api, problem } from 'party-ng';
import { Cal } from './state';

/** Signing in on a tear-off calendar page. */
@Component({
  selector: 'cal-signin',
  template: `
    <div class="tear">
      <div class="page">
        <div class="rings" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <p class="month">{{ month }}</p>
        <p class="date">{{ date }}</p>
        <p class="dow">{{ dow }}</p>
        <form (submit)="go($event)">
          @if (setup()) {
            <p>A fresh board. Whoever fills this in becomes its admin.</p>
          } @else {
            <div class="seg">
              <button type="button" [class.on]="!up()" (click)="up.set(false)">Sign in</button>
              @if (api.status()?.signup_open) { <button type="button" [class.on]="up()" (click)="up.set(true)">New here</button> }
            </div>
          }
          @if (setup() || up()) {
            <input name="name" placeholder="Your name" [value]="name" (input)="name = val($event)" autocomplete="name" required />
            <input name="email" type="email" placeholder="Email (optional)" (input)="email = val($event)" autocomplete="email" />
          } @else {
            <input name="login" placeholder="Name or email" (input)="name = val($event)" autocomplete="username" required />
          }
          <input name="pin" type="password" inputmode="numeric" placeholder="PIN (4–8 digits)" (input)="pin = val($event)" [attr.autocomplete]="up() || setup() ? 'new-password' : 'current-password'" required />
          @if (setup() && api.status()?.setup_code_required) { <input placeholder="Setup code" (input)="code = val($event)" required /> }
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button type="submit" class="primary">{{ setup() ? 'Set up the board' : up() ? 'Make my account' : 'Open my calendar' }}</button>
        </form>
      </div>
    </div>
  `,
})
export class SignIn {
  readonly api = inject(Api);
  readonly up = signal(false);
  readonly error = signal('');
  readonly setup = computed(() => !!this.api.status()?.setup_needed);
  readonly month = new Date().toLocaleDateString(undefined, { month: 'long' });
  readonly date = new Date().getDate();
  readonly dow = new Date().toLocaleDateString(undefined, { weekday: 'long' });
  name = '';
  email = '';
  pin = '';
  code = '';
  private readonly cal = inject(Cal);

  async go(e: Event): Promise<void> {
    e.preventDefault();
    this.error.set('');
    try {
      if (this.setup()) await this.api.setup(this.name, this.email, this.pin, this.code);
      else if (this.up()) await this.api.signUp(this.name, this.email, this.pin);
      else await this.api.signIn(this.name, this.pin);
      await this.api.refresh();
      await this.cal.load();
    } catch (err) {
      this.error.set(problem(err));
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
