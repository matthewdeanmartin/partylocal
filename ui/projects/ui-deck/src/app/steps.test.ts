import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Api, blankDraft } from 'party-ng';
import type { EventView } from 'party-core';
import { Steps, stepsFor } from './steps';
import { Steps as EmbeddedSteps } from '../../../ui-clubhouse/src/app/mobile/steps';

for (const [name, Type] of [['deck', Steps], ['embedded', EmbeddedSteps]] as const) {
  describe(`${name} mobile RSVP sheet`, () => {
    it('submits to the selected person, preserves optional fields, and omits hidden answers', async () => {
      const view = { event: { ...blankDraft(), id: 9, rev: 4, modules: ['diet', 'questions', 'bring'] }, mine: { status: 'going', bring: [], answers: [{ question: 1, value: 'private' }], when: [], shifts: [], diet: 'private', note: 'Keep note', bring_other: 'Cake' } } as unknown as EventView;
      const send = vi.fn().mockResolvedValue(view);
      const injector = createEnvironmentInjector([{ provide: Api, useValue: { send } }], null as unknown as EnvironmentInjector);
      const sheet = runInInjectionContext(injector, () => new Type());
      for (const [key, value] of Object.entries({ view, status: 'no', target: 2, privateFields: false })) Object.defineProperty(sheet, key, { value: signal(value) });
      await sheet.next();
      expect(send.mock.calls[0][1]).toBe('/api/v1/events/9/rsvps/2');
      expect(send.mock.calls[0][2]).toMatchObject({ note: 'Keep note', bring_other: 'Cake', status: 'no' });
      expect(send.mock.calls[0][2]).not.toHaveProperty('diet'); expect(send.mock.calls[0][2]).not.toHaveProperty('answers');
      injector.destroy();
    });
  });
}
it('shows the bring step even if there are no predefined slots', () => {
  const view = { event: { ...blankDraft(), modules: ['bring'], bring: [], plus_ones: 'none' } } as unknown as EventView;
  expect(stepsFor(view, 'going')).toContain('bring');
});
