import { loadOverview } from 'party-ng';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { colour, count, EventSummary, GroupView, initials } from 'party-core';
import { Api, problem } from '../api';
import { EventList } from '../event-list';

/** My groups first, then public ones I could join. */
@Component({
  selector: 'party-home',
  imports: [RouterLink, EventList],
  template: `
    <div class="bar">
      <h1>Hi, {{ api.me()?.display_name }}</h1>
      <a class="button" routerLink="/groups/new">Start a group</a>
    </div>
    @if (error()) { <p class="error card" role="alert">{{ error() }}</p> }
    @if (waiting().length) {
      <section class="card">
        <h2>Waiting for your answer</h2>
        <party-event-list [events]="waiting()" [showGroup]="true" />
      </section>
    }
    <section class="card">
      <h2>Your plans</h2>
      <party-event-list [events]="plans()" [showGroup]="true" empty="Nothing you're going to yet." />
    </section>
    <section class="card">
      <h2>Your groups</h2>
      @if (mine().length) {
        <ul class="groups">
          @for (g of mine(); track g.id) {
            <li>
              <span class="avatar" [style.background]="colour(g.id)" aria-hidden="true">{{ initials(g.name) }}</span>
              <a [routerLink]="['/groups', g.slug]">{{ g.name }}</a>
              @if (g.my_status === 'requested') { <span class="status">asked to join</span> }
              @else if (g.my_role !== 'member') { <span class="status on">{{ g.my_role }}</span> }
              @if (g.requests) { <span class="badge" [attr.aria-label]="g.requests + ' join requests'">{{ g.requests }}</span> }
            </li>
          }
        </ul>
      } @else if (loaded()) {
        <p class="aside">You're not in any groups yet. Start one, or join one below.</p>
      }
    </section>
    @if (others().length) {
      <section class="card">
        <h2>Public groups</h2>
        <ul class="groups">
          @for (g of others(); track g.id) {
            <li>
              <span class="avatar" [style.background]="colour(g.id)" aria-hidden="true">{{ initials(g.name) }}</span>
              <a [routerLink]="['/groups', g.slug]">{{ g.name }}</a>
              <span class="aside">{{ count(g.members, 'member') }}</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class Home implements OnInit {
  readonly api = inject(Api);
  readonly mine = signal<GroupView[]>([]);
  readonly others = signal<GroupView[]>([]);
  readonly loaded = signal(false);
  readonly plans = signal<EventSummary[]>([]);
  readonly waiting = signal<EventSummary[]>([]);
  readonly error = signal('');
  readonly colour = colour;
  readonly initials = initials;
  readonly count = count;

  async ngOnInit(): Promise<void> {
    try {
      const overview = await loadOverview(this.api);
      this.plans.set(overview.plans); this.waiting.set(overview.waiting);
      this.mine.set(overview.mine); this.others.set(overview.others);
    } catch (e) {
      this.error.set(problem(e));
    } finally {
      this.loaded.set(true);
    }
  }
}
