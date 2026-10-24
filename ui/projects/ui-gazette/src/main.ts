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
