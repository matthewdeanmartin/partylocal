import '@angular/compiler';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { answerFor, approveRequest, permittedAnswer, regularAttendance, rideBoard, memberHistory } from './social';
import type { Api } from './api';

function api(get: ReturnType<typeof vi.fn>) { return { get, me: signal({ id: 1 }), send: vi.fn().mockResolvedValue({}) } as unknown as Api; }
describe('focused social actions', () => {
  it('uses the permitted-person list and preserves an existing proxy RSVP', async () => {
    const get = vi.fn().mockResolvedValueOnce({ can_answer: true, can_edit: false, answer_for: [{ id: 2 }], event: { id: 9 } }).mockResolvedValueOnce({ rsvps: [{ person: 2, note: 'Keep', plus: 3 }] });
    const view = await answerFor(api(get), 9, 2);
    expect(view.mine).toMatchObject({ person: 2, note: 'Keep', plus: 3 });
  });
  it('does not read RSVP data for an unauthorized proxy target', async () => {
    const get = vi.fn().mockResolvedValue({ answer_for: [] });
    await expect(answerFor(api(get), 9, 3)).rejects.toThrow('cannot answer'); expect(get).toHaveBeenCalledTimes(1);
  });
  it('does not turn an RSVP read failure into a blank proxy form', async () => {
    const get = vi.fn().mockResolvedValueOnce({ answer_for: [{ id: 2 }] }).mockRejectedValueOnce(new Error('Offline'));
    await expect(answerFor(api(get), 9, 2)).rejects.toThrow('Offline');
  });
  it('omits private answers without mutating the input', () => {
    const input = { status: 'going' as const, rev_seen: 1, diet: 'private', answers: [{ question: 1, value: 'private' }], note: 'public', bring_other: 'Cake' };
    expect(permittedAnswer(input, false)).toEqual({ status: 'going', rev_seen: 1, note: 'public', bring_other: 'Cake' });
    expect(permittedAnswer(input, true)).toEqual(input); expect(input.answers).toHaveLength(1);
  });
  it('never fetches the ride board for a non-host', async () => {
    const get = vi.fn().mockResolvedValue({ can_edit: false });
    await expect(rideBoard(api(get), 9)).rejects.toThrow('only'); expect(get).toHaveBeenCalledTimes(1);
  });
  it('sends only the standing attendance toggle, leaving existing answers to the backend', async () => {
    const a = api(vi.fn()); await regularAttendance(a, 7, false);
    expect(a.send).toHaveBeenCalledWith('PUT', '/api/v1/series/7/regular', { on: false }, 'SeriesView');
  });
  it.each([false, true])('rejects unauthorized or stale approval: manager=%s', async manager => {
    const get = vi.fn(async (path: string) => path.endsWith('/members') ? { members: [] } : path.includes('/events?') ? { events: [], next: 0 } : { id: 3, can_manage: manager });
    const a = api(get); await expect(approveRequest(a, 'club', 2)).rejects.toThrow(); expect(a.send).not.toHaveBeenCalled();
  });
  it('approves the exact pending person after rechecking permission', async () => {
    const get = vi.fn(async (path: string) => path.endsWith('/members') ? { members: [{ person: 2, status: 'requested' }] } : path.includes('/events?') ? { events: [], next: 0 } : { id: 3, can_manage: true });
    const a = api(get); await approveRequest(a, 'club', 2);
    expect(a.send).toHaveBeenCalledWith('PUT', '/api/v1/groups/3/members/2', { status: 'active' }, 'MemberList');
  });
  it('reduces history to event and status, excluding private response fields', async () => {
    const get = vi.fn(async (path: string) => path.endsWith('/rsvps') ? { rsvps: [{ person: 2, status: 'going', diet: 'secret', answers: ['secret'] }] } : path.endsWith('/members') ? { members: [] } : path.includes('/events?') ? { events: path.includes('past=0') ? [{ id: 8, title: 'Birthday', start: 123 }] : [], next: 0 } : { id: 3 });
    expect(await memberHistory(api(get), 'club', 2)).toEqual({ upcoming: [{ id: 8, title: 'Birthday', start: 123, status: 'going' }], past: [] });
  });
});
