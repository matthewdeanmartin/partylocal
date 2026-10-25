import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { afterEach, expect, it, vi } from 'vitest';
import { View } from './view';
afterEach(() => vi.unstubAllGlobals());
it('does not mistake account or management paths for mobile paths', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'desk' });
  const view = runInInjectionContext(Injector.create({ providers: [{ provide: Router, useValue: {} }] }), () => new View());
  expect(view.settle('/me')).toBeNull();
  expect(view.settle('/manage/events/1')).toBeNull();
  expect(view.settle('/m/people/7')).toBe('/people/7');
});
it('keeps full group forms available on phones', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'phone' });
  const view = runInInjectionContext(Injector.create({ providers: [{ provide: Router, useValue: {} }] }), () => new View());
  expect(view.settle('/groups/book-club/bulk')).toBeNull();
  expect(view.settle('/people/7')).toBe('/m/people/7');
});
