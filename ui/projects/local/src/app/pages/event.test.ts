import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { EventPage } from './event';
import type { EventView } from 'party-core';

function setup(host = false) {
  const send = vi.fn();
  const injector = createEnvironmentInjector([{ provide: Api, useValue: { me: signal({ id: 1 }), send } }, { provide: Router, useValue: {} }], null as unknown as EnvironmentInjector);
  const page = runInInjectionContext(injector, () => new EventPage());
  page.view.set({ can_edit: host, can_answer: true, answer_for: [{ id: 2, display_name: 'Household member' }], event: { questions: [], shifts: [], when: [] } } as unknown as EventView);
  page.who.set(2); page.answersReady.set(true);
  page.form.set({ status: 'going', rev_seen: 1, diet: 'hidden', answers: [{ question: 3, value: 'private' }], note: 'Bring cake', plus: 2 });
  return { page, send, injector };
}

describe('attendance privacy and permission checks', () => {
  it('omits private fields when answering for a household member, preserving stored answers', () => {
    const { page, injector } = setup();
    expect(page.submission()).toEqual({ status: 'going', rev_seen: 1, note: 'Bring cake', plus: 2 });
    expect(page.form().diet).toBe('hidden'); injector.destroy();
  });
  it('lets hosts and the person submit their own private fields', () => {
    const a = setup(true); expect(a.page.submission().answers).toHaveLength(1); a.injector.destroy();
    const b = setup(); b.page.who.set(1); expect(b.page.submission().diet).toBe('hidden'); b.injector.destroy();
  });
  it('refuses unknown targets and submissions before answers load', async () => {
    const { page, send, injector } = setup(); page.pickWho(999); expect(page.who()).toBe(2);
    page.who.set(999); await page.send({ preventDefault() {} } as Event); expect(send).not.toHaveBeenCalled();
    page.who.set(2); page.answersReady.set(false); await page.send({ preventDefault() {} } as Event); expect(send).not.toHaveBeenCalled(); injector.destroy();
  });
});
