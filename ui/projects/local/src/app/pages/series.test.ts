import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { Api } from '../api';
import { SeriesSettings } from './series';

function setup(canEdit = true) {
  const view = { id: 7, group: 2, rule: 'weekly', every: 1, nth: 1, until: 1_900_000_023, count: 12, window: 3, status: 'active', summary: 'Every Friday', regular: false, regulars: 0, upcoming: [], can_edit: canEdit };
  const send = vi.fn().mockResolvedValue(view), get = vi.fn().mockResolvedValue(view);
  const injector = createEnvironmentInjector([{ provide: Api, useValue: { get, send } }], null as unknown as EnvironmentInjector);
  const page = runInInjectionContext(injector, () => new SeriesSettings());
  Object.defineProperty(page, 'id', { value: signal('7') });
  return { page, view, send, get, injector };
}
const event = { preventDefault() {} } as Event;

describe('series settings', () => {
  it('preserves the exact end timestamp when changing only the window', async () => {
    const { page, send, injector } = setup(); await page.ngOnInit(); page.window.set(5);
    await page.save(event);
    expect(send).toHaveBeenCalledWith('PATCH', '/api/v1/series/7', { until: 1_900_000_023, count: 12, window: 5 }, 'SeriesView');
    expect(page.message()).toBe('Series settings saved.'); injector.destroy();
  });
  it('can clear limits without changing the recurrence rule', async () => {
    const { page, send, injector } = setup(); await page.ngOnInit(); page.until.set(''); page.count.set(0);
    await page.save(event);
    expect(send.mock.calls[0][2]).toEqual({ until: 0, count: 0, window: 3 }); injector.destroy();
  });
  it('blocks unauthorized writes and invalid limits', async () => {
    const a = setup(false); await a.page.ngOnInit(); await a.page.save(event); a.page.confirmStop.set(true); await a.page.stop();
    expect(a.send).not.toHaveBeenCalled(); a.injector.destroy();
    const b = setup(); await b.page.ngOnInit(); b.page.count.set(105); await b.page.save(event);
    expect(b.send).not.toHaveBeenCalled(); expect(b.page.error()).toContain('0–104'); b.injector.destroy();
  });
  it.each([false, true])('requires explicit confirmation to stop; cancel future = %s', async (cancel) => {
    const { page, send, injector } = setup(); await page.ngOnInit(); await page.stop(); expect(send).not.toHaveBeenCalled();
    page.confirmStop.set(true); page.cancelFuture.set(cancel); await page.stop();
    expect(send).toHaveBeenCalledWith('DELETE', `/api/v1/series/7${cancel ? '?cancel=1' : ''}`, undefined, 'Done');
    expect(page.confirmStop()).toBe(false); injector.destroy();
  });
  it('uses the regular endpoint and leaves unsaved generation settings intact', async () => {
    const { page, send, view, injector } = setup(); await page.ngOnInit(); page.window.set(6);
    send.mockResolvedValue({ ...view, regular: true }); await page.regular();
    expect(send).toHaveBeenCalledWith('PUT', '/api/v1/series/7/regular', { on: true }, 'SeriesView');
    expect(page.view()?.regular).toBe(true); expect(page.window()).toBe(6); injector.destroy();
  });
  it('reports failures without claiming the action succeeded', async () => {
    const { page, send, injector } = setup(); await page.ngOnInit(); send.mockRejectedValue(new Error('Permission changed'));
    await page.save(event); expect(page.error()).toContain('Permission changed'); expect(page.message()).toBe(''); expect(page.busy()).toBe(false); injector.destroy();
  });
});
