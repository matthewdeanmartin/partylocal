import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Api, blankDraft } from 'party-ng';
import type { EventView } from 'party-core';
import { Brain } from './brain';
import { Chat } from './chat';
import { Brain as EmbeddedBrain } from '../../../ui-clubhouse/src/app/chat/brain';
import { Chat as EmbeddedChat } from '../../../ui-clubhouse/src/app/chat/chat';

for (const [name, B, C] of [['standalone', Brain, Chat], ['embedded', EmbeddedBrain, EmbeddedChat]] as const) {
  describe(`${name} chat`, () => {
    it('keeps existing RSVP notes and extra bringing text when requested', async () => {
      const view = { event: { ...blankDraft(), id: 8, rev: 1, modules: ['bring'], plus_ones: 'none' }, mine: { note: 'Arrive late', bring_other: 'Cake', bring: [], answers: [], shifts: [], when: [] }, claimed: [] } as unknown as EventView;
      const send = vi.fn().mockResolvedValue(view), choose = vi.fn().mockResolvedValue('keep');
      const chat = { choose, ask: vi.fn(), typing: (p: Promise<unknown>) => p, say: vi.fn() };
      const injector = createEnvironmentInjector([{ provide: Api, useValue: { send, me: signal({ id: 1 }), refreshSummary: vi.fn() } }, { provide: C, useValue: chat }, { provide: Router, useValue: {} }], null as unknown as EnvironmentInjector);
      const brain = runInInjectionContext(injector, () => new B());
      await brain.answerFlow(view, 'going');
      expect(send.mock.calls[0][2]).toMatchObject({ note: 'Arrive late', bring_other: 'Cake' });
      expect(choose).toHaveBeenCalledTimes(2); injector.destroy();
    });
    it('waits for startup before accepting an event command', async () => {
      let finish!: () => void;
      const refresh = new Promise<void>(resolve => { finish = resolve; });
      const chat = new C();
      const api = { refresh: () => refresh, status: signal(null), me: signal(null) };
      const injector = createEnvironmentInjector([{ provide: Api, useValue: api }, { provide: C, useValue: chat }, { provide: Router, useValue: {} }], null as unknown as EnvironmentInjector);
      const brain = runInInjectionContext(injector, () => new B());
      const started = brain.start();
      expect(brain.starting()).toBe(true);
      brain.hear('e1');
      expect(chat.messages().some(m => m.from === 'me')).toBe(false);
      finish(); await started;
      expect(brain.starting()).toBe(false);
      expect(chat.messages().some(m => m.text.includes("can't reach"))).toBe(true);
      injector.destroy();
    });
    it('does not resolve an ambiguous name to the first option', () => {
      const reply = vi.fn(), say = vi.fn();
      const chat = { question: signal({ input: 'none', options: [{ label: 'Sam (#2)', value: '2' }, { label: 'Sam (#3)', value: '3' }] }), reply, echo: vi.fn(), say };
      const injector = createEnvironmentInjector([{ provide: Api, useValue: {} }, { provide: C, useValue: chat }, { provide: Router, useValue: {} }], null as unknown as EnvironmentInjector);
      const brain = runInInjectionContext(injector, () => new B()); brain.hear('Sam');
      expect(reply).not.toHaveBeenCalled(); expect(say).toHaveBeenCalled(); injector.destroy();
    });
  });
}
