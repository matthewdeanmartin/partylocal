import { EventView, RsvpInput, RsvpView, SeriesView, RideBoard } from 'party-core';
import { Api } from './api';
import { loadGroup } from './flows';

/** Re-read permissions and answers before a proxy RSVP; never treat a failed load as an empty answer. */
export async function answerFor(api: Api, event: number, person: number): Promise<EventView> {
  const view = await api.get<EventView>(`/api/v1/events/${event}`, 'EventView');
  if (person === api.me()?.id) {
    if (!view.can_answer && !view.answer_for.some(p => p.id === person)) throw new Error('You cannot answer this event now.');
    return view;
  }
  if (!view.answer_for.some(p => p.id === person)) throw new Error('You cannot answer for this person.');
  const list = await api.get<{ rsvps: RsvpView[] }>(`/api/v1/events/${event}/rsvps`, 'RsvpList');
  return { ...view, mine: list.rsvps.find(r => r.person === person) ?? null };
}

export function permittedAnswer(input: RsvpInput, privateFields: boolean): RsvpInput {
  const result = { ...input };
  if (!privateFields) { delete result.diet; delete result.answers; }
  return result;
}

export async function regularAttendance(api: Api, series: number, on: boolean): Promise<SeriesView> {
  return api.send<SeriesView>('PUT', `/api/v1/series/${series}/regular`, { on }, 'SeriesView');
}

export async function approveRequest(api: Api, slug: string, person: number): Promise<void> {
  const page = await loadGroup(api, slug);
  if (!page.group.can_manage) throw new Error('Only group managers can approve requests.');
  if (!page.members.some(m => m.person === person && m.status === 'requested')) throw new Error('This person no longer has a pending request.');
  await api.send('PUT', `/api/v1/groups/${page.group.id}/members/${person}`, { status: 'active' }, 'MemberList');
}

export async function rideBoard(api: Api, event: number): Promise<RideBoard> {
  const view = await api.get<EventView>(`/api/v1/events/${event}`, 'EventView');
  if (!view.can_edit) throw new Error('Ride coordination is available only to event hosts and group managers.');
  return api.get<RideBoard>(`/api/v1/events/${event}/rides`, 'RideBoard');
}

/** Only status is needed for history; private answers never enter the presentation model. */
export async function memberHistory(api: Api, slug: string, person: number) {
  const page = await loadGroup(api, slug);
  const read = async (events: typeof page.events) => {
    const rows: { id: number; title: string; start: number; status: string }[] = [];
    for (const e of events) {
      const list = await api.get<{ rsvps: RsvpView[] }>(`/api/v1/events/${e.id}/rsvps`, 'RsvpList');
      const r = list.rsvps.find(r => r.person === person);
      if (r) rows.push({ id: e.id, title: e.title, start: e.start, status: r.status });
    }
    return rows;
  };
  return { upcoming: await read(page.events), past: await read(page.past) };
}
