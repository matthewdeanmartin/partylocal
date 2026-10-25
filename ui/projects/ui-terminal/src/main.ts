import { CanActivateFn, provideRouter, RouterOutlet, RouterLink, Routes, withComponentInputBinding } from '@angular/router';
import { Api } from 'party-ng';
import { bootstrapApplication } from '@angular/platform-browser';
import { Component, inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { startDemo } from 'party-demo';

const signedIn: CanActivateFn = async () => {
  const api = inject(Api); if (!api.ready()) await api.refresh(); return !!api.me();
};
const routes: Routes = [
  { path: 'me', redirectTo: 'account' },
  { path: 'signin/finishing', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.Finishing) },
  { path: 'signin', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignIn) },
  { path: 'signup', loadComponent: () => import('../../local/src/app/pages/auth').then(m => m.SignUp) },
  { path: 'invite/:token', loadComponent: () => import('../../local/src/app/pages/invite').then(m => m.Invite) },
  { path: 'groups/:slug/bulk', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/bulk').then(m => m.BulkEvents) },

  { path: 'account', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/me').then(m => m.Profile) },
  { path: 'admin/channels', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/channels').then(m => m.Channels) },
  { path: 'admin', canActivate: [async () => { const api = inject(Api); if (!api.ready()) await api.refresh(); return api.me()?.role === 'admin'; }], loadComponent: () => import('../../local/src/app/pages/admin').then(m => m.Admin) },

  { path: 'events/:id', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/event').then(m => m.EventPage) },
  { path: 'e/:id', redirectTo: 'events/:id' },
  { path: 'groups/:ref/edit', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group-form').then(m => m.GroupForm) },
  { path: 'groups/:slug/invite', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(m => m.GroupInvite) },
  { path: 'groups/:slug/members/:id', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(m => m.Person) },
  { path: 'people/:id', canActivate: [signedIn], loadComponent: () => import('../../ui-clubhouse/src/app/desk/community').then(m => m.Person) },
  { path: 'people', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/people').then(m => m.People) },
  { path: 'events/:id/edit', canActivate: [async () => {
    const api = inject(Api);
    if (!api.ready()) await api.refresh();
    return !!api.me();
  }], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'groups/:ref/events/new', canActivate: [async () => {
    const api = inject(Api);
    if (!api.ready()) await api.refresh();
    return !!api.me();
  }], loadComponent: () => import('../../local/src/app/pages/event-form').then(m => m.EventForm) },
  { path: 'series/:id', canActivate: [async () => {
    const api = inject(Api);
    if (!api.ready()) await api.refresh();
    return !!api.me();
  }], loadComponent: () => import('../../local/src/app/pages/series').then(m => m.SeriesSettings) },
  { path: 'groups/:ref', canActivate: [signedIn], loadComponent: () => import('../../local/src/app/pages/group').then(m => m.Group) },
  { path: '**', loadComponent: () => import('./app/app').then(m => m.App) },
];
@Component({ selector: 'party-root', imports: [RouterOutlet, RouterLink], template: '<p><a routerLink="/">Back to Terminal</a></p><router-outlet />' })
class Shell {}
startDemo();
bootstrapApplication(Shell, {
  providers: [provideRouter(routes, withComponentInputBinding()), provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
