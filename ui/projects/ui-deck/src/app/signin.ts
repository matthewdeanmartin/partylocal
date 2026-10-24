import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Api, problem } from 'party-ng';

/** Signing in like unlocking a phone: who you are, then a PIN pad. */
@Component({
  selector: 'deck-signin',
  template: `
    <div class="lock">
      <p class="logo">🎉</p>
      <h1>{{ setup() ? 'Set up party' : signUp() ? 'Join party' : 'party' }}</h1>
      @if (stage() === 'who') {
        <form class="who" (submit)="toPin($event)">
          <input class="big" [placeholder]="setup() || signUp() ? 'Your name' : 'Name or email'" [value]="login()" (input)="login.set(val($event))" autocomplete="username" required />
          @if (setup() || signUp()) { <input class="big" type="email" placeholder="Email (optional)" (input)="email = val($event)" /> }
          @if (setup() && api.status()?.setup_code_required) { <input class="big" placeholder="Setup code" (input)="code = val($event)" /> }
          <button type="submit" class="go" [disabled]="!login().trim()">Next</button>
          @if (!setup() && api.status()?.signup_open) {
            <button type="button" class="ghost" (click)="signUp.set(!signUp())">{{ signUp() ? 'I already have an account' : "I'm new here" }}</button>
          }
        </form>
      } @else {
        <p class="for">{{ setup() || signUp() ? 'Choose a PIN' : 'Enter your PIN' }}, {{ login() }}</p>
        <div class="dots" [class.shake]="error()" aria-live="polite">@for (i of [0, 1, 2, 3, 4, 5]; track i) { <i [class.on]="pin().length > i" [class.extra]="i >= 4"></i> }</div>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <div class="pad">
          @for (k of keys; track k) {
            @if (k === 'back') { <button type="button" class="key soft" (click)="back()" aria-label="Delete">⌫</button> }
            @else if (k === 'ok') { <button type="button" class="key ok" [disabled]="pin().length < 4 || busy()" (click)="go()" aria-label="OK">→</button> }
            @else { <button type="button" class="key" (click)="press(k)">{{ k }}</button> }
          }
        </div>
        <button type="button" class="ghost" (click)="stage.set('who'); pin.set('')">Not {{ login() }}?</button>
      }
    </div>
  `,
})
export class SignIn {
  readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly stage = signal<'who' | 'pin'>('who');
  readonly login = signal('');
  readonly pin = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly signUp = signal(false);
  readonly setup = computed(() => !!this.api.status()?.setup_needed);
  readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
  email = '';
  code = '';

  toPin(e: Event): void {
    e.preventDefault();
    this.stage.set('pin');
  }

  press(k: string): void {
    this.error.set('');
    if (this.pin().length < 8) this.pin.update((p) => p + k);
  }

  back(): void {
    this.pin.update((p) => p.slice(0, -1));
  }

  async go(): Promise<void> {
    this.busy.set(true);
    try {
      if (this.setup()) await this.api.setup(this.login(), this.email, this.pin(), this.code);
      else if (this.signUp()) await this.api.signUp(this.login(), this.email, this.pin());
      else await this.api.signIn(this.login(), this.pin());
      await this.api.refresh();
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(problem(e));
      this.pin.set('');
    } finally {
      this.busy.set(false);
    }
  }

  val(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
