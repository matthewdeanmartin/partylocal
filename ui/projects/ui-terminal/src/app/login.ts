import { Component, computed, ElementRef, inject, output, signal, viewChild, afterNextRender } from '@angular/core';
import { Api, problem } from 'party-ng';

/** A login prompt, as on a console: one question per line. */
@Component({
  selector: 'term-login',
  template: `
    <pre class="tty" (click)="focus()">{{ banner() }}
@for (l of history(); track $index) {{{ l }}
}<form (submit)="enter($event)"><span>{{ prompt() }}</span><input #line [type]="secret() ? 'password' : 'text'" [attr.inputmode]="secret() ? 'numeric' : null" [value]="value()" (input)="value.set($any($event.target).value)" autocomplete="off" spellcheck="false" aria-label="Answer" /></form>@if (error()) {
<span class="err">{{ error() }}</span>}</pre>
  `,
})
export class Login {
  readonly api = inject(Api);
  readonly done = output<void>();
  readonly history = signal<string[]>([]);
  readonly value = signal('');
  readonly error = signal('');
  private readonly answers: string[] = [];
  private readonly line = viewChild<ElementRef<HTMLInputElement>>('line');
  readonly setup = computed(() => !!this.api.status()?.setup_needed);
  /** The questions asked, in order: sign in, sign up or first-run setup. */
  readonly questions = computed(() =>
    this.setup()
      ? ['new board. admin name: ', 'email (optional): ', 'pin: ', ...(this.api.status()?.setup_code_required ? ['setup code: '] : [])]
      : this.mode() === 'new' ? ['name: ', 'email (optional): ', 'pin: '] : [`${(this.api.status()?.instance ?? 'party').replace(/\s/g, '')} login: `, 'pin: '],
  );
  readonly mode = signal<'in' | 'new'>('in');
  readonly step = signal(0);
  readonly prompt = computed(() => this.questions()[this.step()] ?? '');
  readonly secret = computed(() => this.prompt().startsWith('pin'));
  readonly banner = computed(() => `party ${this.api.status()?.version ?? ''} (${this.api.status()?.build ?? ''}) on ${this.api.status()?.instance ?? 'the board'}
${this.setup() ? 'This board has no accounts yet: the first one becomes admin.' : `Type "new" at the login prompt to make an account${this.api.status()?.signup_open ? '' : ' (closed here)'}.`}
`);

  constructor() {
    afterNextRender(() => this.focus());
  }

  focus(): void {
    this.line()?.nativeElement.focus();
  }

  async enter(e: Event): Promise<void> {
    e.preventDefault();
    const v = this.value();
    this.value.set('');
    this.error.set('');
    if (this.step() === 0 && !this.setup() && this.mode() === 'in' && v.trim() === 'new') {
      this.history.update((h) => [...h, this.prompt() + v]);
      this.mode.set('new');
      return;
    }
    this.history.update((h) => [...h, this.prompt() + (this.secret() ? '' : v)]);
    this.answers[this.step()] = v;
    if (this.step() < this.questions().length - 1) {
      this.step.update((s) => s + 1);
      return;
    }
    try {
      const [name, a, b, c] = this.answers;
      if (this.setup()) await this.api.setup(name, a, b, c ?? '');
      else if (this.mode() === 'new') await this.api.signUp(name, a, b);
      else await this.api.signIn(name, a);
      await this.api.refresh();
      this.done.emit();
    } catch (err) {
      this.error.set(`${problem(err)}\n`);
      this.history.set([]);
      this.step.set(0);
      this.mode.set('in');
    }
  }
}
