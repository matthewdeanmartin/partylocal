import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { CanActivateFn, provideRouter, Router, Routes, withComponentInputBinding } from '@angular/router';
import { startDemo } from 'party-demo';
import { Api } from 'party-ng';
import { App } from './app/app';
import { Deck } from './app/deck';
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
  { path: '', component: Deck, canActivate: [signedIn], title: 'party' },
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
