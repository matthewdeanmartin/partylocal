import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeriesView, fromLocalInput, toLocalInput, when } from 'party-core';
import { Api, problem } from '../api';

@Component({
  selector: 'party-series', imports: [RouterLink],
  styles: [`:host { display:block; padding:1rem; } section { max-width:48rem; margin:auto; } label { display:block; margin:1rem 0; } input { max-width:100%; } button { margin:.3rem; } li { margin:1rem 0; }`],
  template: `
    <section class="card">
      <h1>Recurring event</h1>
      @if (error()) { <p role="alert" class="error">{{ error() }}</p> }
      @if (message()) { <p role="status">{{ message() }}</p> }
      @if (view(); as s) {
        <p>{{ s.summary }} · {{ s.status === 'active' ? 'Repeating' : 'Future generation stopped' }}</p>
        <p>The repeat schedule uses the board's timezone and keeps its local time through daylight-saving changes. Dates below and date inputs use your device's timezone ({{ zone }}).</p>
        <p>Yearly repeats keep the same month and date; February 29 uses February 28 in non-leap years and returns to February 29 in leap years. Weekly, monthly and yearly rules are chosen when creating a series; to change the rule, stop this series and create another.</p>
        <h2>Your regular attendance</h2>
        <p>Being a regular adds a Going RSVP to new occurrences and upcoming occurrences you have not answered. Existing answers stay unchanged. Turning it off leaves your existing RSVPs in place; change those on each event.</p>
        <button type="button" [disabled]="busy()" (click)="regular()">{{ s.regular ? 'Stop being a regular' : 'Become a regular' }}</button>
        @if (s.can_edit) {
          <h2>Generation settings</h2>
          <p>These limits control future generation. Reducing them does not remove events already created. The occurrence limit counts from the beginning of the series, including past occurrences; 0 means unlimited.</p>
          @if (s.status !== 'active') { <p>Saving these settings may restart generation if the end and occurrence limits allow more events. Cancelled occurrences are not restored.</p> }
          <form (submit)="save($event)">
            <fieldset [disabled]="busy()">
              <label>Last allowed start <small>optional, inclusive</small><input type="datetime-local" step="1" [value]="until()" (input)="until.set($any($event.target).value)" /></label>
              <label>Total occurrence limit <input type="number" min="0" max="104" required [value]="count()" (input)="count.set(+$any($event.target).value)" /></label>
              <label>Keep upcoming occurrences ahead <input type="number" min="1" max="8" required [value]="window()" (input)="window.set(+$any($event.target).value)" /></label>
              <button type="submit">{{ busy() ? 'Saving…' : 'Save generation settings' }}</button>
            </fieldset>
          </form>
          <h2>Stop repeating</h2>
          <p>Stop future generation while keeping scheduled events, or also cancel every upcoming occurrence. Past events and attendance history remain.</p>
          @if (!confirmStop()) {
            <button type="button" [disabled]="busy()" (click)="confirmStop.set(true)">Stop repeating…</button>
          } @else {
            <label><input type="checkbox" [checked]="cancelFuture()" (change)="cancelFuture.set($any($event.target).checked)" /> Also cancel already-created upcoming events</label>
            <p>{{ cancelFuture() ? 'Upcoming events will be cancelled and attendees notified.' : 'Already-created events will remain scheduled.' }}</p>
            <button type="button" [disabled]="busy()" (click)="stop()">Confirm stop{{ cancelFuture() ? ' and cancel upcoming events' : '' }}</button>
            <button type="button" [disabled]="busy()" (click)="confirmStop.set(false)">Keep repeating</button>
          }
        }
        <h2>Upcoming occurrences</h2>
        <p>“Edit this occurrence” changes only that event. “Edit this and following” changes its details, all later active occurrences and the template used for future events. Time edits change the time of day; the repeat dates stay on the existing schedule.</p>
        <ul>
          @for (e of s.upcoming; track e.id) {
            <li><a [routerLink]="['/events', e.id]">{{ e.title }} · {{ when(e.start, e.end) }}</a>
              @if (s.can_edit) {
                <p><a [routerLink]="['/events', e.id, 'edit']">Edit this occurrence</a> · <a [routerLink]="['/events', e.id, 'edit']" [queryParams]="{ scope: 'following' }">Edit this and following</a></p>
              }
            </li>
          } @empty { <li>No upcoming occurrences.</li> }
        </ul>
      } @else if (!error()) { <p role="status">Loading series…</p> }
    </section>
  `,
})
export class SeriesSettings implements OnInit {
  private readonly api = inject(Api);
  readonly id = input('');
  readonly view = signal<SeriesView | null>(null);
  readonly until = signal(''); readonly count = signal(0); readonly window = signal(4);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  readonly confirmStop = signal(false); readonly cancelFuture = signal(false);
  readonly when = when;
  readonly zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private originalUntil = 0;
  private initialUntil = '';
  private setView(s: SeriesView): void {
    this.view.set(s); this.originalUntil = s.until;
    const seconds = s.until ? String(new Date(s.until * 1000).getSeconds()).padStart(2, '0') : '';
    this.initialUntil = s.until ? `${toLocalInput(s.until)}:${seconds}` : '';
    this.until.set(this.initialUntil); this.count.set(s.count); this.window.set(s.window);
  }
  async ngOnInit(): Promise<void> {
    try { this.setView(await this.api.get<SeriesView>(`/api/v1/series/${this.id()}`, 'SeriesView')); }
    catch (e) { this.error.set(problem(e)); }
  }
  private async act(action: () => Promise<void>, message: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await action(); this.message.set(message); }
    catch (e) { this.error.set(problem(e)); }
    finally { this.busy.set(false); }
  }
  async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.view()?.can_edit || this.busy()) return;
    const until = this.until() === this.initialUntil ? this.originalUntil : fromLocalInput(this.until());
    if (!Number.isInteger(this.count()) || this.count() < 0 || this.count() > 104 || !Number.isInteger(this.window()) || this.window() < 1 || this.window() > 8 || (this.until() && !until)) {
      this.error.set('Use a valid end time, 0–104 total occurrences, and 1–8 occurrences ahead.'); return;
    }
    await this.act(async () => this.setView(await this.api.send<SeriesView>('PATCH', `/api/v1/series/${this.id()}`, { until, count: this.count(), window: this.window() }, 'SeriesView')), 'Series settings saved.');
  }
  async regular(): Promise<void> {
    const s = this.view(); if (!s) return;
    await this.act(async () => {
      const updated = await this.api.send<SeriesView>('PUT', `/api/v1/series/${this.id()}/regular`, { on: !s.regular }, 'SeriesView');
      this.view.set(updated);
    }, s.regular ? 'Regular attendance turned off. Existing RSVPs remain.' : 'You are now a regular. Existing answers were preserved.');
  }
  async stop(): Promise<void> {
    if (!this.view()?.can_edit || !this.confirmStop()) return;
    const cancel = this.cancelFuture();
    await this.act(async () => {
      await this.api.send('DELETE', `/api/v1/series/${this.id()}${cancel ? '?cancel=1' : ''}`, undefined, 'Done');
      this.confirmStop.set(false);
      this.setView(await this.api.get<SeriesView>(`/api/v1/series/${this.id()}`, 'SeriesView'));
    }, cancel ? 'Future generation stopped and upcoming events cancelled.' : 'Future generation stopped. Already-created events remain scheduled.');
  }
}
