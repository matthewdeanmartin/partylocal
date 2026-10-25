import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { EventForm } from './event-form';
import { blankDraft } from 'party-ng';

function setup(canEdit = true) {
  const event = { ...blankDraft(), id: 8, rev: 4, group: 2, status: 'scheduled', hosts: [1, 2], invitees: [3], visibility: 'invite-only', map: 'https://example.test/map' };
  const view = { event, can_edit: canEdit, host_names: ['Alice', 'Bob'] };
  const send = vi.fn().mockResolvedValue({ ...view, event: { ...event, rev: 5 } });
  const get = vi.fn(async (path: string) => {
    if (path.includes('/households')) return { households: [] };
    if (path.includes('/groups/')) return { visibility: 'private' };
    if (path.includes('/people/')) return { id: 3, display_name: 'Carol' };
    if (path.includes('/people?')) return { people: [{ id: 4, display_name: 'Dave' }], next: 0 };
    return view;
  });
  const injector = createEnvironmentInjector([{ provide: Api, useValue: { get, send } }, { provide: Router, useValue: { navigate: vi.fn() } }], null as unknown as EnvironmentInjector);
  const form = runInInjectionContext(injector, () => new EventForm());
  Object.defineProperty(form, 'id', { value: signal('8') });
  return { form, send, get, injector };
}

describe('full event management', () => {
  it('preserves access settings through an unrelated edit and reports success', async () => {
    const { form, send, injector } = setup();
    await form.ngOnInit(); form.title.set('Changed');
    await form.submit({ preventDefault() {} } as Event);
    expect(send.mock.calls[0][2]).toMatchObject({ title: 'Changed', hosts: [1, 2], invitees: [3], visibility: 'invite-only', map: 'https://example.test/map', rev: 4 });
    expect(form.saved()).toBe('Event saved.');
    await form.submit({ preventDefault() {} } as Event);
    expect(send.mock.calls[1][2].rev).toBe(5);
    injector.destroy();
  });
  it('submits selected hosts, visibility, invitees and map', async () => {
    const { form, send, injector } = setup(); await form.ngOnInit();
    await form.searchPeople();
    expect(form.personName(4)).toBe('Dave');
    form.hosts.set([2, 4]); form.invitees.set([4]); form.visibility.set('group'); form.map.set('https://example.test/new');
    await form.submit({ preventDefault() {} } as Event);
    expect(send.mock.calls[0][2]).toMatchObject({ hosts: [2, 4], invitees: [4], visibility: 'group', map: 'https://example.test/new' });
    injector.destroy();
  });
  it('does not allow viewers to submit edits', async () => {
    const { form, send, injector } = setup(false); await form.ngOnInit();
    await form.submit({ preventDefault() {} } as Event);
    expect(form.allowed()).toBe(false); expect(send).not.toHaveBeenCalled();
    injector.destroy();
  });
  it('rejects an empty host list and unsafe map links before sending', async () => {
    const { form, send, injector } = setup(); await form.ngOnInit();
    form.hosts.set([]); await form.submit({ preventDefault() {} } as Event);
    expect(form.error()).toContain('1 to 4');
    form.hosts.set([1]); form.map.set('javascript:alert(1)');
    await form.submit({ preventDefault() {} } as Event);
    expect(form.error()).toContain('https://'); expect(send).not.toHaveBeenCalled();
    injector.destroy();
  });
  it('shows server permission failures without reporting success', async () => {
    const { form, send, injector } = setup(); await form.ngOnInit();
    send.mockRejectedValue(new Error('Permission changed'));
    await form.submit({ preventDefault() {} } as Event);
    expect(form.error()).toContain('Permission changed'); expect(form.saved()).toBe(''); expect(form.busy()).toBe(false);
    injector.destroy();
  });
});
