import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { startDemo } from 'party-demo';
import { App } from './app/app';

// The keyboard is the navigation; nothing to route.
startDemo();
bootstrapApplication(App, {
  providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
