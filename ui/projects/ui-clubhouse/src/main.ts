import { enableFeatureStyles } from './app/feature-styles';
import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { CanActivateFn, provideRouter, Route, Router, Routes, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { startDemo } from 'party-demo';
import { Api } from 'party-ng';
import { App } from './app/app';

async function ready(api: Api): Promise<void> {
  if (!api.ready()) await api.refresh().catch(() => undefined);
}

/** Signed-in pages; `home` is where sign-in lives for that view. */
const signedIn = (signin: string): CanActivateFn => async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() && !api.status()?.setup_needed ? true : router.parseUrl(signin);
};

const signedOut = (home: string): CanActivateFn => async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me() ? router.parseUrl(home) : true;
};

const desk = signedIn('/signin');
const admin: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await ready(api);
  return api.me()?.role === 'admin' ? true : router.parseUrl('/');
};
const classicFrame = () => import('./app/desk/classic').then((x) => x.ClassicFrame);
const classic = () => import('../../local/src/app/pages/auth');
/** A Classic screen, as it is, inside Club House's frame. */
const reuse = (path: string, load: Route['loadComponent'], guards: CanActivateFn[] = []): Route => ({
  path, loadComponent: classicFrame, canActivate: guards, children: [{ path: '', loadComponent: load }],
});
const phone = signedIn('/m/signin');
const pages = () => import('./app/desk/pages');
const forms = () => import('./app/desk/forms');
const m = () => import('./app/mobile/pages');

// Only the desktop frame loads at once; every page, and the whole phone view, on first visit.
const routes: Routes = [
  {
    path: 'm',
    loadComponent: () => import('./app/mobile/shell').then((x) => x.MobileShell),
    children: [
      { path: '', loadComponent: () => import('./app/mobile/deck').then((x) => x.Deck), canActivate: [phone], title: 'Club House' },
      { path: 'signin', loadComponent: () => import('./app/mobile/signin').then((x) => x.SignIn), canActivate: [signedOut('/m')], title: 'Sign in' },
      { path: 'people/:id', loadComponent: () => import('./app/mobile/social').then(m => m.MobilePerson), canActivate: [phone] },
      { path: 'groups/:slug/members/:id', loadComponent: () => import('./app/mobile/social').then(m => m.MobilePerson), canActivate: [phone] },
      { path: 'plans', loadComponent: () => m().then((x) => x.Plans), canActivate: [phone], title: 'Plans' },
      { path: 'groups', loadComponent: () => m().then((x) => x.Groups), canActivate: [phone], title: 'Groups' },
      { path: 'groups/new', loadComponent: () => import('./app/mobile/wizard').then((x) => x.NewGroup), canActivate: [phone], title: 'New group' },
      { path: 'groups/:slug', loadComponent: () => m().then((x) => x.Group), canActivate: [phone], title: 'Group' },
      { path: 'e/:id', loadComponent: () => m().then((x) => x.EventScreen), canActivate: [phone], title: 'Event' },
      { path: 'new', loadComponent: () => import('./app/mobile/wizard').then((x) => x.Wizard), canActivate: [phone], title: 'New event' },
      { path: 'inbox', loadComponent: () => m().then((x) => x.Inbox), canActivate: [phone], title: 'Inbox' },
      { path: 'me', loadComponent: () => m().then((x) => x.Profile), canActivate: [phone], title: 'Me' },
      { path: '**', redirectTo: '' },
    ],
  },
  {
    path: '',
    loadComponent: () => import('./app/desk/shell').then(m => m.DeskShell),
    children: [
      { path: '', loadComponent: () => pages().then((x) => x.Home), canActivate: [desk] },
      { path: 'signin', loadComponent: () => forms().then((x) => x.SignIn), canActivate: [signedOut('/')] },
      { path: 'plans', loadComponent: () => pages().then((x) => x.Plans), canActivate: [desk] },
      { path: 'groups', loadComponent: () => pages().then((x) => x.Groups), canActivate: [desk] },
      { path: 'groups/new', loadComponent: () => forms().then((x) => x.NewGroup), canActivate: [desk] },
      { path: 'groups/:slug/bulk', loadComponent: () => import('./app/desk/bulk').then(x => x.BulkEvents), canActivate: [desk] },
      { path: 'groups/:slug/invite', loadComponent: () => import('./app/desk/community').then(x => x.GroupInvite), canActivate: [desk] },
      { path: 'groups/:slug/members/:id', loadComponent: () => import('./app/desk/community').then(x => x.Person), canActivate: [desk] },
      { path: 'people/:id', loadComponent: () => import('./app/desk/community').then(x => x.Person), canActivate: [desk] },
      { path: 'groups/:slug', loadComponent: () => pages().then((x) => x.Group), canActivate: [desk] },
      { path: 'e/:id', loadComponent: () => import('./app/desk/article').then((x) => x.EventScreen), canActivate: [desk] },
      { path: 'notices', loadComponent: () => pages().then((x) => x.Notices), canActivate: [desk] },
      { path: 'people', loadComponent: () => pages().then((x) => x.People), canActivate: [desk] },
      { path: 'profile', loadComponent: () => forms().then((x) => x.Profile), canActivate: [desk] },
      { path: 'new', loadComponent: () => forms().then((x) => x.NewEvent), canActivate: [desk] },
      { path: 'calendar', loadComponent: () => import('./app/desk/calendar').then((x) => x.Calendar), canActivate: [desk] },
      { path: 'text', loadComponent: () => import('./app/desk/console').then((x) => x.Console), canActivate: [desk] },
      // From the Classic app, for what Club House doesn't redo itself.
      reuse('manage/groups/:ref', () => import('../../local/src/app/pages/group').then(x => x.Group), [desk]),
      reuse('groups/:ref/events/new', () => import('../../local/src/app/pages/event-form').then(x => x.EventForm), [desk]),
      reuse('groups/:ref/edit', () => import('../../local/src/app/pages/group-form').then(x => x.GroupForm), [desk]),
      reuse('manage/events/:id', () => import('../../local/src/app/pages/event').then(x => x.EventPage), [desk]),
      reuse('series/:id', () => import('../../local/src/app/pages/series').then(x => x.SeriesSettings), [desk]),
      reuse('events/:id/edit', () => import('../../local/src/app/pages/event-form').then(x => x.EventForm), [desk]),
      reuse('me', () => import('../../local/src/app/pages/me').then(x => x.Profile), [desk]),
      reuse('admin', () => import('../../local/src/app/pages/admin').then((x) => x.Admin), [desk, admin]),
      reuse('admin/channels', () => import('../../local/src/app/pages/channels').then((x) => x.Channels), [desk, admin]),
      reuse('invite/:token', () => import('../../local/src/app/pages/invite').then((x) => x.Invite)),
      reuse('signin/finishing', () => classic().then((x) => x.Finishing)),
      reuse('signin/more', () => classic().then((x) => x.SignIn), [signedOut('/')]),
      reuse('signup', () => classic().then((x) => x.SignUp), [signedOut('/')]),
      { path: 'events/:id', redirectTo: 'e/:id' },
      { path: '**', redirectTo: '' },
    ],
  },
];

enableFeatureStyles();
startDemo();
bootstrapApplication(App, {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' })),
  ],
}).catch((err) => console.error(err));
