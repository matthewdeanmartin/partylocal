import { loadFeatureStyle } from '../feature-styles';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventSummary, MemberView, PersonList, PersonView, RsvpView, when } from 'party-core';
import { Api, ApiError, GroupPage, loadGroup, problem } from 'party-ng';
import { InvitePanel } from '../../../../local/src/app/invite-panel';

@Component({
  selector: 'ch-invite', imports: [RouterLink, InvitePanel],
  template: `
    @if (page(); as p) {
      <h1>Invite to {{ p.group.name }}</h1><p><a [routerLink]="['/groups', p.group.slug]">Back to group</a></p>
      @if (p.group.can_manage) {
        <section class="slip"><h2>Someone already here</h2>
          <form (submit)="search($event)"><label>Name <input class="blank" type="search" (input)="query = $any($event.target).value" /></label> <button>Search</button></form>
          <p class="small">People who share a group or household with you, or chose to be findable.</p>
          @for (person of people(); track person.id) { <p>{{ person.display_name }} <button type="button" [disabled]="busy()" (click)="add(person.id)">Add to group</button></p> }
          @if (searched() && !people().length) { <p>No matching accounts available to add.</p> }
        </section>
        <div class="classic"><party-invite-panel kind="group" [target]="p.group.id" /></div>
      }
    }
    @if (message()) { <p role="status">{{ message() }}</p> }
    @if (error()) { <p class="stop" role="alert">{{ error() }}</p> }
  `,
})
export class GroupInvite implements OnInit {
  private readonly featureStyle = loadFeatureStyle('classic');

  readonly slug = input.required<string>();
  private readonly api = inject(Api);
  readonly page = signal<GroupPage | null>(null);
  readonly people = signal<PersonView[]>([]);
  readonly error = signal(''); readonly message = signal(''); readonly busy = signal(false); readonly searched = signal(false);
  query = '';
  async ngOnInit(): Promise<void> { try { this.page.set(await loadGroup(this.api, this.slug())); } catch (e) { this.error.set(problem(e)); } }
  async search(event?: Event): Promise<void> {
    event?.preventDefault(); this.error.set('');
    try {
      const people: PersonView[] = []; let after = 0;
      do { const list = await this.api.get<PersonList>(`/api/v1/people?q=${encodeURIComponent(this.query)}&after=${after}`, 'PersonList'); people.push(...list.people); after = list.next; } while (after);
      const here = new Set(this.page()!.members.filter(m => m.status === 'active').map(m => m.person));
      this.people.set(people.filter(p => !here.has(p.id))); this.searched.set(true);
    } catch (e) { this.error.set(problem(e)); }
  }
  async add(id: number): Promise<void> {
    this.busy.set(true); this.error.set('');
    try { await this.api.send('PUT', `/api/v1/groups/${this.page()!.group.id}/members/${id}`, { status: 'active' }, 'MemberList'); await this.ngOnInit(); await this.search(); this.message.set('Added to the group.'); }
    catch (e) { this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
}

@Component({
  selector: 'ch-person', imports: [RouterLink],
  styles: ['.profile-bio { white-space: pre-wrap; max-width: 75ch; }'],
  template: `
    @if (person(); as p) { <h1>{{ p.display_name }}</h1><p>{{ p.household_name }}</p><p class="profile-bio">{{ p.bio || 'No introduction yet.' }}</p> }
    @if (page(); as p) {
      <p><a [routerLink]="['/groups', p.group.slug]">{{ p.group.name }}</a></p>
      @if (member(); as m) {
        <p>{{ m.role }} · {{ m.status }}</p>
        @if (p.group.can_manage && m.status === 'active' && m.role !== 'organizer') {
          <button type="button" [disabled]="busy()" (click)="role(m.role === 'member' ? 'co-organizer' : 'member')">{{ m.role === 'member' ? 'Make co-organizer' : 'Make member' }}</button>
        }
      }
      <h2>Upcoming RSVPs</h2>
      @for (r of upcoming(); track r.event.id) { <p><a [routerLink]="['/events', r.event.id]">{{ r.event.title }}</a> · {{ when(r.event.start) }} · {{ r.status }}</p> } @empty { <p>No upcoming RSVPs visible.</p> }
      <h2>RSVP history</h2>
      @for (r of past(); track r.event.id) { <p><a [routerLink]="['/events', r.event.id]">{{ r.event.title }}</a> · {{ when(r.event.start) }} · {{ r.status }}</p> } @empty { <p>No retained RSVP history visible.</p> }
      <p class="small">Only events and answers you are allowed to see are shown. Older events may have expired from the board.</p>
    }
    @if (error()) { <p class="stop" role="alert">{{ error() }}</p> }
  `,
})
export class Person implements OnInit {
  readonly id = input.required<string>(); readonly slug = input('');
  private readonly api = inject(Api);
  readonly person = signal<PersonView | null>(null); readonly page = signal<GroupPage | null>(null); readonly member = signal<MemberView | null>(null);
  readonly upcoming = signal<{ event: EventSummary; status: string }[]>([]); readonly past = signal<{ event: EventSummary; status: string }[]>([]);
  readonly error = signal(''); readonly busy = signal(false); readonly when = when;
  async ngOnInit(): Promise<void> {
    try {
      const p = this.slug() ? await loadGroup(this.api, this.slug()) : null;
      this.page.set(p); const member = p?.members.find(m => m.person === +this.id()) ?? null; this.member.set(member);
      try { this.person.set(await this.api.get<PersonView>(`/api/v1/people/${this.id()}`, 'PersonView')); }
      catch (e) {
        if (!(e instanceof ApiError && e.status === 404 && member)) throw e;
        this.person.set({ id: member.person, display_name: member.display_name, bio: '', household: 0, household_name: '' });
      }
      if (!p) return;
      const answers = async (events: EventSummary[]) => {
        const result: { event: EventSummary; status: string }[] = [];
        for (const event of events) {
          const list = await this.api.get<{ rsvps: RsvpView[] }>(`/api/v1/events/${event.id}/rsvps`, 'RsvpList');
          const r = list.rsvps.find(r => r.person === +this.id()); if (r) result.push({ event, status: r.status });
        }
        return result;
      };
      this.upcoming.set(await answers(p.events)); this.past.set(await answers(p.past));
    } catch (e) { this.error.set(problem(e)); }
  }
  async role(role: string): Promise<void> {
    if (this.busy() || !this.page()?.group.can_manage || this.member()?.status !== 'active' || this.member()?.role === 'organizer' || !['member', 'co-organizer'].includes(role)) return;
    this.busy.set(true); this.error.set('');
    try { await this.api.send('PUT', `/api/v1/groups/${this.page()!.group.id}/members/${this.id()}`, { role }, 'MemberList'); await this.ngOnInit(); }
    catch (e) { this.error.set(problem(e)); } finally { this.busy.set(false); }
  }
}
