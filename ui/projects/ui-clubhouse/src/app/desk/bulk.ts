import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GroupView, when } from 'party-core';
import { Api, blankDraft, loadGroup, problem, saveEvent } from 'party-ng';
import { BulkRow, parseBulk, usHolidays } from './bulk-data';

@Component({
  selector: 'ch-bulk', imports: [RouterLink],
  template: `
    @if (group(); as g) {
      <h1>Bulk add to {{ g.name }}</h1><p><a [routerLink]="['/groups', g.slug]">Back to group</a></p>
      @if (g.can_create_events) {
        <p>One event per line: YYYY-MM-DD HH:mm | Title. Dates use this device’s time zone. For birthdays, enter each date and name. For a February 29 birthday, use its next leap-year date to preserve that birthday; non-leap years use February 28.</p>
        <label><input type="checkbox" [disabled]="busy()" [checked]="yearly()" (change)="yearly.set($any($event.target).checked); rows.set([])" /> Repeat each entry yearly (birthdays and fixed-date anniversaries)</label>
        <p>Yearly imports keep one upcoming occurrence per series. Weekday-based holidays should remain individual events.</p>
        <label>Holiday year <input class="blank" type="number" min="2026" max="2100" [value]="year" (input)="year = +$any($event.target).value" /></label>
        <button type="button" [disabled]="busy()" (click)="holidays()">Use US federal holidays</button>
        <p class="small">Actual holiday dates, at noon; edit the times before importing. <a href="https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/" target="_blank" rel="noopener">OPM holiday reference</a></p>
        <textarea class="blank-area" rows="12" aria-label="Events to add" [disabled]="busy()" [value]="text()" (input)="text.set($any($event.target).value); rows.set([])"></textarea>
        <button type="button" [disabled]="busy()" (click)="preview()">Preview</button>
        @for (r of rows(); track $index) { <p>{{ r.title }} · {{ when(r.start) }} · {{ r.id ? 'Created' : r.duplicate ? 'Already exists — skipped' : 'Ready' }} @if (r.id) { <a [routerLink]="['/e', r.id]">Open</a> }</p> }
        @if (rows().length) { <button type="button" [disabled]="busy() || !pending()" (click)="save()">{{ busy() ? 'Adding…' : 'Add remaining events' }}</button> }
      }
    }
    @if (error()) { <p class="stop" role="alert">{{ error() }}</p> }
    @if (message()) { <p role="status">{{ message() }}</p> }
  `,
})
export class BulkEvents implements OnInit {
  readonly slug = input.required<string>(); private readonly api = inject(Api);
  readonly group = signal<GroupView | null>(null); readonly text = signal(''); readonly rows = signal<BulkRow[]>([]);
  readonly busy = signal(false); readonly error = signal(''); readonly message = signal(''); readonly when = when;
  readonly yearly = signal(false);
  year = new Date().getFullYear() + 1;
  async ngOnInit(): Promise<void> { try { this.group.set((await loadGroup(this.api, this.slug())).group); } catch (e) { this.error.set(problem(e)); } }
  holidays(): void { try { this.yearly.set(false); this.text.set(usHolidays(this.year)); this.rows.set([]); this.error.set(''); } catch(e) { this.error.set(problem(e)); } }
  pending(): boolean { return this.rows().some(r => !r.id && !r.duplicate); }
  async preview(): Promise<void> {
    this.error.set(''); this.message.set(''); this.busy.set(true);
    try {
      const rows = parseBulk(this.text()); const p = await loadGroup(this.api, this.slug());
      const existing = [...p.events, ...p.past];
      this.rows.set(rows.map(r => ({ ...r, duplicate: existing.some(e => e.title === r.title && e.start === r.start) })));
    } catch(e) { this.rows.set([]); this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
  async save(): Promise<void> {
    if (this.busy()) return; this.busy.set(true); this.error.set('');
    try {
      const current = await loadGroup(this.api, this.slug());
      const existing = [...current.events, ...current.past];
      this.rows.update(rows => rows.map(r => ({ ...r, duplicate: r.duplicate || existing.some(e => e.title === r.title && e.start === r.start) })));
      for (let i = 0; i < this.rows().length; i++) {
        const r = this.rows()[i]; if (r.id || r.duplicate) continue;
        const id = await saveEvent(this.api, { ...blankDraft('generic', r.start), title: r.title, repeat: this.yearly() ? 'yearly' : '', window: 1 }, { group: this.group()!.id });
        this.rows.update(rows => rows.map((row, j) => j === i ? { ...row, id } : row));
      }
      this.message.set('Finished. Existing events were skipped.');
    } catch(e) { this.error.set(`Stopped: ${problem(e)}. Created events are marked above; retry adds only the remaining rows.`); } finally { this.busy.set(false); }
  }
}
