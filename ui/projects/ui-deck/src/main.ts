import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { CanActivateFn, provideRouter, Router, Routes, withComponentInputBinding } from '@angular/router';
import { startDemo } from 'party-demo';
import { Api } from 'party-ng';
import { App } from './app/app';
import { SignIn } from './app/signin';

async function ready(api: Api): Promise<void> {
  if (!api.ready()) await api.refresh().catch(() => undefined);
}

const signedIn: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() && !api.status()?.setup_needed ? true : router.parseUrl('/signin');
};

const signedOut: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() ? router.parseUrl('/') : true;
};

// The deck and sign-in load at once; the other screens on first visit.
const routes: Routes = [
  { path: 'manage/events/:id', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event').then(m => m.EventPage) },
  { path: 'signin/finishing', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.Finishing) },
  { path: 'signin', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignIn) },
  { path: 'signup', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignUp) },
  { path: 'invite/:token', loadComponent: () => import('../../local/src/app/pages/invite').then(m => m.Invite) },

  { path: 'groups/:slug/bulk', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/bulk').then(m => m.BulkEvents) },
  { path: 'account', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/me').then(m => m.Profile) },
  { path: 'admin/channels', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/channels').then(m => m.Channels) },
  { path: 'admin', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/admin').then(m => m.Admin) },
  { path: 'people/:id', data: { prefix: '' }, canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/mobile/social').then(m => m.MobilePerson) },
  { path: 'groups/:slug/members/:id', data: { prefix: '' }, canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/mobile/social').then(m => m.MobilePerson) },
  { path: 'manage/groups/:ref', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group').then(m => m.Group) },
  { path: 'groups/:ref/edit', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group-form').then(m => m.GroupForm) },
  { path: 'groups/:slug/invite', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(m => m.GroupInvite) },
  { path: 'groups/:ref/events/new', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'series/:id', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/series').then(m => m.SeriesSettings) },
  { path: 'events/:id/edit', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'events/:id', redirectTo: 'e/:id' },
  { path: '', loadComponent: () => import('./app/deck').then(m => m.Deck), canActivate: [signedIn], title: 'party' },
  { path: 'signin', component: SignIn, canActivate: [signedOut], title: 'Sign in · party' },
  { path: 'plans', loadComponent: () => import('./app/pages').then((m) => m.Plans), canActivate: [signedIn], title: 'Plans · party' },
  { path: 'groups', loadComponent: () => import('./app/pages').then((m) => m.Groups), canActivate: [signedIn], title: 'Groups · party' },
  { path: 'groups/new', loadComponent: () => import('./app/wizard').then((m) => m.NewGroup), canActivate: [signedIn], title: 'New group · party' },
  { path: 'groups/:slug', loadComponent: () => import('./app/pages').then((m) => m.Group), canActivate: [signedIn], title: 'Group · party' },
  { path: 'e/:id', loadComponent: () => import('./app/pages').then((m) => m.EventScreen), canActivate: [signedIn], title: 'Event · party' },
  { path: 'new', loadComponent: () => import('./app/wizard').then((m) => m.Wizard), canActivate: [signedIn], title: 'New event · party' },
  { path: 'inbox', loadComponent: () => import('./app/pages').then((m) => m.Inbox), canActivate: [signedIn], title: 'Inbox · party' },
  { path: 'me', loadComponent: () => import('./app/pages').then((m) => m.Profile), canActivate: [signedIn], title: 'Me · party' },
  { path: '**', redirectTo: '' },
];

startDemo();
bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
  ],
}).catch((err) => console.error(err));
