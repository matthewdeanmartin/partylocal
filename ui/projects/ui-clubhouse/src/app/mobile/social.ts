import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PersonView, RideBoard, when } from 'party-core';
import { Api, EventPage, GroupPage, approveRequest, memberHistory, problem, regularAttendance, rideBoard } from 'party-ng';

const styles = `:host {display:block} button,a.action {min-height:44px;padding:.7rem 1rem;margin:.3rem 0;display:inline-flex;align-items:center;box-sizing:border-box} .actions {display:flex;flex-wrap:wrap;gap:.5rem} .person-row {display:flex;align-items:center;justify-content:space-between;gap:.7rem;border-bottom:1px solid #8884;padding:.5rem 0} p {overflow-wrap:anywhere} a {color:inherit} .error {color:#b33035} .bio {white-space:pre-wrap}`;
@Component({ selector: 'mobile-event-tools', imports: [RouterLink], styles: [styles], template: `
  @let p = page(); @let v = p.view;
  <div class="actions">
    <a class="action" [routerLink]="['/manage/events', v.event.id]">Full attendance and host tools</a>
    @if (v.event.start || !v.event.modules.includes('when')) { <a class="action" [href]="'/api/v1/events/' + v.event.id + '.ics'" download>Add to calendar</a> }
    @if (v.can_edit && v.event.modules.includes('rides')) { <button type="button" [disabled]="busy()" (click)="rides()">Ride coordination</button> }
  </div>
  @if (p.series; as s) {
    <p>{{ s.summary }}</p><p>Regular attendance fills new/unanswered occurrences. Turning it off keeps existing RSVPs.</p>
    <button type="button" [disabled]="busy()" (click)="regular()">{{ s.regular ? 'Stop being a regular' : 'Become a regular' }}</button>
    @if (s.can_edit) { <p><a [routerLink]="['/series', s.id]">Full series settings</a></p> }
  }
  @if (board(); as b) {
    <h2>Ride coordination</h2>
    @for (p of b.needs; track p.person) { <p>{{ p.display_name }} needs {{ p.seats }} seat(s)</p> }
    @for (p of b.offers; track p.person) { <p>{{ p.display_name }} offers {{ p.seats }} seat(s)</p> }
    <p>{{ b.spare }} spare seats</p>
  }
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (message()) { <p role="status">{{ message() }}</p> }
` })
export class MobileEventTools {
  readonly page = input.required<EventPage>(); readonly changed = output<void>();
  private readonly api = inject(Api);
  readonly board = signal<RideBoard | null>(null); readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  async regular(): Promise<void> {
    const s = this.page().series; if (!s || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await regularAttendance(this.api, s.id, !s.regular); this.message.set(s.regular ? 'Regular attendance stopped. Existing RSVPs remain.' : 'You are now a regular.'); this.changed.emit(); }
    catch(e) { this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
  async rides(): Promise<void> {
    if (this.busy()) return; this.busy.set(true); this.error.set(''); this.board.set(null);
    try { this.board.set(await rideBoard(this.api, this.page().view.event.id)); }
    catch(e) { this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
}

@Component({ selector: 'mobile-member-tools', imports: [RouterLink], styles: [styles], template: `
  @let p = page();
  <h2>Members and requests</h2>
  @for (m of p.members; track m.person) {
    <div class="person-row"><a class="action" [routerLink]="[prefix() + '/groups', p.group.slug, 'members', m.person]">{{ m.display_name }} · {{ m.status === 'requested' ? 'Requested to join' : m.role }}</a>
      @if (p.group.can_manage && m.status === 'requested') { <button type="button" [disabled]="busy()" (click)="pending.set(m.person)">Review request</button> }
    </div>
    @if (pending() === m.person) {
      <p>Approve {{ m.display_name }} (#{{ m.person }}) for {{ p.group.name }}?</p>
      <div class="actions"><button type="button" [disabled]="busy()" (click)="approve(m.person)">Approve</button><button type="button" [disabled]="busy()" (click)="pending.set(0)">Cancel</button></div>
    }
  }
  @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
  @if (message()) { <p role="status">{{ message() }}</p> }
  @if (p.group.can_manage) { <p><a [routerLink]="['/manage/groups', p.group.slug]">Full member roles and group settings</a></p> }
` })
export class MobileMemberTools {
  readonly page = input.required<GroupPage>(); readonly prefix = input('/m'); readonly changed = output<void>();
  private readonly api = inject(Api);
  readonly pending = signal(0); readonly busy = signal(false); readonly error = signal(''); readonly message = signal('');
  async approve(id: number): Promise<void> {
    if (this.busy() || this.pending() !== id) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await approveRequest(this.api, this.page().group.slug, id); this.pending.set(0); this.message.set('Request approved.'); this.changed.emit(); }
    catch(e) { this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
}

@Component({ selector: 'mobile-person', imports: [RouterLink], styles: [styles], template: `
  <div class="page-body">
    @if (person(); as p) { <h1>{{ p.display_name }}</h1><p>{{ p.household_name }}</p><p class="bio">{{ p.bio || 'No introduction yet.' }}</p> }
    @if (history(); as h) {
      <h2>Upcoming RSVPs</h2>
      @for (e of h.upcoming; track e.id) { <p><a class="action" [routerLink]="[prefix() + '/e', e.id]">{{ e.title }}</a> · {{ when(e.start) }} · {{ e.status }}</p> } @empty { <p>No visible upcoming RSVPs.</p> }
      <h2>RSVP history</h2>
      @for (e of h.past; track e.id) { <p><a class="action" [routerLink]="[prefix() + '/e', e.id]">{{ e.title }}</a> · {{ when(e.start) }} · {{ e.status }}</p> } @empty { <p>No retained history visible.</p> }
      <p>Only visible events are included; older history may have expired.</p>
    }
    @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
    @if (slug()) { <a class="action" [routerLink]="[prefix() + '/groups', slug()]">Back to group</a> }
    @else { <p>Open this person from a group to see that group's RSVP history.</p><a class="action" [routerLink]="[prefix() + '/me']">Back to people</a> }
  </div>
` })
export class MobilePerson implements OnInit {
  readonly id = input.required<string>(); readonly slug = input(''); readonly prefix = input('/m');
  private readonly api = inject(Api);
  readonly person = signal<PersonView | null>(null);
  readonly history = signal<Awaited<ReturnType<typeof memberHistory>> | null>(null);
  readonly error = signal(''); readonly when = when;
  async ngOnInit(): Promise<void> {
    try { this.person.set(await this.api.get<PersonView>(`/api/v1/people/${this.id()}`, 'PersonView')); }
    catch(e) { this.error.set(problem(e)); }
    if (this.slug()) {
      try { this.history.set(await memberHistory(this.api, this.slug(), Number(this.id()))); }
      catch(e) { this.error.set(problem(e)); }
    }
  }
}
