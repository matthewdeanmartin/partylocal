import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { startDemo } from 'party-demo';
import { App } from './app/app';

// No router: the conversation is the navigation.
startDemo();
bootstrapApplication(App, {
  providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()],
}).catch((err) => console.error(err));
