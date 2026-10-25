import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { CanActivateFn, provideRouter, Router, Routes, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { startDemo } from 'party-demo';
import { Api } from 'party-ng';
import { App } from './app/app';
import { Diary, Front, Notices, Societies, Society, WhosWho } from './app/pages';

async function ready(api: Api): Promise<void> {
  if (!api.ready()) await api.refresh().catch(() => undefined);
}

const signedIn: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() && !api.status()?.setup_needed ? true : router.parseUrl('/subscribe');
};

const signedOut: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() ? router.parseUrl('/') : true;
};

// The front page and sections load at once; the article and the desks are lazy.
const routes: Routes = [
  { path: 'me', redirectTo: 'account' },
  { path: 'signin/finishing', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.Finishing) },
  { path: 'signin', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignIn) },
  { path: 'signup', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignUp) },
  { path: 'invite/:token', loadComponent: () => import('../../local/src/app/pages/invite').then(m => m.Invite) },
  { path: 'groups', pathMatch: 'full', redirectTo: 'societies' },
  { path: 'groups/new', redirectTo: 'societies/found' },

  { path: 'account', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/me').then(m => m.Profile) },
  { path: 'admin/channels', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/channels').then(m => m.Channels) },
  { path: 'admin', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/admin').then(m => m.Admin) },

  { path: 'manage/events/:id', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event').then(m => m.EventPage) },
  { path: 'manage/groups/:ref', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group').then(m => m.Group) },
  { path: 'groups/:ref/edit', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group-form').then(m => m.GroupForm) },
  { path: 'groups/:ref/events/new', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'series/:id', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/series').then(m => m.SeriesSettings) },
  { path: 'events/:id/edit', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'events/:id', redirectTo: 'e/:id' },
  { path: 'people', component: WhosWho, canActivate: [signedIn] },
  { path: 'people/:id', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(x => x.Person) },
  { path: 'groups/:slug/invite', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(x => x.GroupInvite) },
  { path: 'groups/:slug/members/:id', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(x => x.Person) },
  { path: 'groups/:slug/bulk', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/bulk').then(x => x.BulkEvents) },
  { path: 'groups/:slug', redirectTo: 'societies/:slug' },
  { path: '', component: Front, canActivate: [signedIn], title: 'The Party Gazette' },
  { path: 'subscribe', canActivate: [signedOut], loadComponent: () => import('./app/press').then((m) => m.Subscribe), title: 'Subscribe · The Party Gazette' },
  { path: 'diary', component: Diary, canActivate: [signedIn], title: 'Your Diary · The Party Gazette' },
  { path: 'societies', component: Societies, canActivate: [signedIn], title: 'Societies · The Party Gazette' },
  { path: 'societies/found', canActivate: [signedIn], loadComponent: () => import('./app/press').then((m) => m.Found), title: 'Found a society · The Party Gazette' },
  { path: 'societies/:slug', component: Society, canActivate: [signedIn], title: 'Society · The Party Gazette' },
  { path: 'e/:id', canActivate: [signedIn], loadComponent: () => import('./app/article').then((m) => m.Article), title: 'The Party Gazette' },
  { path: 'notices', component: Notices, canActivate: [signedIn], title: 'Notices · The Party Gazette' },
  { path: 'whos-who', component: WhosWho, canActivate: [signedIn], title: "Who's Who · The Party Gazette" },
  { path: 'letters', canActivate: [signedIn], loadComponent: () => import('./app/press').then((m) => m.Letters), title: 'Letters · The Party Gazette' },
  { path: 'press', canActivate: [signedIn], loadComponent: () => import('./app/press').then((m) => m.Press), title: 'Press desk · The Party Gazette' },
  { path: '**', redirectTo: '' },
];

startDemo();
bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' })),
  ],
}).catch((err) => console.error(err));
