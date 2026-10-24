// The demo's made-up neighbourhood. Built through the board's own rules
// (createGroup, createEvent, answer…) so the data is consistent, with dates
// relative to now. Every demo person's PIN is 1234.
import { Board, DemoState, emptyState } from './board';

export const DEMO_PIN = '1234';

/** People the demo toolbar offers to sign in as, with who they are. */
export const PERSONAS: { name: string; blurb: string }[] = [
  { name: 'Sam Rivera', blurb: 'admin; organizes Maple Street' },
  { name: 'Jordan Okafor', blurb: "Sam's household" },
  { name: 'Alex Chen', blurb: 'runs Friday Game Club' },
  { name: 'Priya Natarajan', blurb: 'leads Riverside Walkers' },
  { name: 'Lena Novak', blurb: 'hosts the Book Club' },
  { name: 'Theo Marsh', blurb: 'new; asked to join Maple Street' },
];

export function seed(now = Math.floor(Date.now() / 1000)): DemoState {
  const state = emptyState(now);
  const b = new Board(state, () => now);
  const at = (days: number, hour: number, minute = 0) => {
    const d = new Date(now * 1000);
    d.setDate(d.getDate() + days);
    d.setHours(hour, minute, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };
  /** Days until the next `weekday` (0 = Sunday), at least `min` days away. */
  const next = (weekday: number, min = 1) => {
    const today = new Date(now * 1000).getDay();
    let d = (weekday - today + 7) % 7;
    while (d < min) d += 7;
    return d;
  };

  const person = (name: string, email: string, bio: string, discoverable: 'public' | 'members' = 'public') => {
    const id = b.createPerson(name, email, DEMO_PIN, false);
    const p = b.person(id)!;
    p.bio = bio;
    p.discoverable = discoverable;
    p.created = now - 60 * 86_400 + id * 3_600;
    return id;
  };
  const sam = person('Sam Rivera', 'sam@example.com', 'Maple Street. Keeps the tool library honest.');
  b.person(sam)!.admin = true;
  const jordan = person('Jordan Okafor', 'jordan@example.com', 'Cooks too much. Ask about the sourdough.');
  const alex = person('Alex Chen', 'alex@example.com', 'Runs Friday Game Club. Will teach any game.');
  const priya = person('Priya Natarajan', 'priya@example.com', 'Walks, every Saturday, any weather.');
  const lena = person('Lena Novak', 'lena@example.com', 'Book Club host. Reads the ending first.');
  const theo = person('Theo Marsh', '', 'New on Maple Street.');
  const morgan = person('Morgan Blake', 'morgan@example.com', 'Drives a van; happy to give lifts.');
  const dana = person('Dana Whitfield', 'dana@example.com', 'Gardener. Brings tomatoes whether you want them or not.', 'members');
  const ravi = person('Ravi Patel', 'ravi@example.com', 'Board-game hoarder.');
  const ines = person('Ines Duarte', 'ines@example.com', 'Bakes. Walks. Bakes again.');
  const kofi = person('Kofi Mensah', 'kofi@example.com', 'Two kids, one dog, no free time.', 'members');
  const grace = person('Grace Liu', 'grace@example.com', 'Retired teacher; Book Club since forever.');

  const home = (name: string, ...people: number[]) => {
    const id = state.next.household++;
    state.households.push({ id, name });
    for (const p of people) b.person(p)!.household = id;
    return id;
  };
  const riveraHome = home('The Rivera-Okafor house', sam, jordan);
  home('The Mensah house', kofi);
  home('Number 14', dana, morgan);

  const group = (organizer: number, input: Record<string, unknown>, members: number[], co: number[] = []) => {
    const g = b.createGroup(organizer, input);
    g.created = now - 45 * 86_400;
    for (const m of members) g.members.push({ person: m, role: co.includes(m) ? 'co-organizer' : 'member', status: 'active', joined: now - 30 * 86_400 });
    return g;
  };
  const games = group(alex, {
    name: 'Friday Game Club', kind: 'club', visibility: 'public', join: 'open',
    about: 'Board games most Fridays. Beginners welcome; we teach. Bring snacks, not opinions about Monopoly.',
  }, [sam, ravi, morgan, ines, kofi, jordan], [sam]);
  const walkers = group(priya, {
    name: 'Riverside Walkers', kind: 'club', visibility: 'public', join: 'open',
    about: 'An easy 5 km by the river every Saturday morning, coffee after. Dogs and prams welcome.',
  }, [sam, ines, grace, dana, morgan]);
  const maple = group(sam, {
    name: 'Maple Street Neighbours', kind: 'circle', visibility: 'unlisted', join: 'approval',
    about: 'Street parties, the tool library and the odd working bee. For people on (or near) Maple Street.',
  }, [jordan, dana, morgan, kofi, ines], [dana]);
  maple.members_create_events = true;
  const family = group(sam, {
    name: 'Rivera-Okafor Family', kind: 'circle', visibility: 'private', join: 'invite',
    about: 'Sunday dinners and birthdays. Grandma has the final say on dates.',
  }, [jordan]);
  const books = group(lena, {
    name: 'Book Club', kind: 'club', visibility: 'public', join: 'approval',
    about: 'One book a month, argued about over tea. This month: "Piranesi".',
  }, [grace, ines, priya]);

  const event = (host: number, g: typeof games, input: Record<string, unknown>) => b.createEvent(host, g, input);
  const answer = (who: number, e: { id: number }, input: Record<string, unknown>) =>
    b.answer(who, e.id, who, { rev_seen: b.event(e.id)!.rev, ...input });

  // Friday Game Club: a weekly series with a regular crowd.
  const fri = next(5);
  const series = b.createSeries(alex, games, {
    rule: 'weekly', every: 1, window: 3,
    event: {
      kind: 'meeting', title: 'Game night', start: at(fri, 19), end: at(fri, 22), where_kind: 'place', place: 'The back room at Hops & Co',
      address: '22 Mill Lane', capacity: 12, plus_ones: 'limited', plus_max: 1, modules: ['headcount', 'questions'],
      about: 'Two tables, one heavy game and one party game. Doors at 18:45.',
      questions: [{ id: 0, kind: 'choice', prompt: 'Which table?', choices: ['Heavy game', 'Party game', 'Either'] }],
    },
  });
  series.regulars = [alex, ravi];
  const nights = state.events.filter((e) => e.series === series.id);
  nights[0].title = 'Game night: Wingspan and friends';
  const choice = nights[0].questions[0].id;
  for (const [who, pick, plus] of [[alex, 'Heavy game', 0], [ravi, 'Heavy game', 1], [morgan, 'Party game', 0], [ines, 'Either', 0], [kofi, 'Party game', 1], [sam, 'Heavy game', 0]] as const) {
    answer(who, nights[0], { status: 'going', plus, answers: [{ question: choice, value: pick }] });
  }
  answer(jordan, nights[0], { status: 'maybe', note: 'Depends on the babysitter' });
  for (const who of [alex, ravi, morgan]) answer(who, nights[1], { status: 'going' });
  answer(ravi, nights[2], { status: 'going' });
  // A past one, so "past events" has something.
  const last = event(alex, games, { kind: 'meeting', title: 'Game night: Cascadia', start: at(1, 19), end: at(1, 22), where_kind: 'place', place: 'The back room at Hops & Co' });
  for (const who of [alex, sam, ravi, ines]) answer(who, last, { status: 'going' });
  last.start = at(fri - 7, 19);
  last.end = at(fri - 7, 22);
  last.status = 'done';

  // Riverside Walkers: an outing with rides and a cost.
  const sat = next(6);
  const walk = event(priya, walkers, {
    kind: 'outing', title: 'Saturday river walk', start: at(sat, 9), end: at(sat, 11), place: 'Riverside Park, north gate',
    about: 'The usual loop, then coffee at the kiosk.', cost: 'Free; coffee on you', rides_note: 'Meet at the library car park at 8:40 for lifts.',
  });
  answer(priya, walk, { status: 'going', ride: 'own' });
  answer(morgan, walk, { status: 'going', ride: 'offer', seats: 4 });
  answer(grace, walk, { status: 'going', ride: 'need' });
  answer(ines, walk, { status: 'going', plus: 1, names: 'my sister Rosa', ride: 'need', seats: 2 });
  answer(dana, walk, { status: 'no', note: 'Allotment day, sorry' });
  const hike = event(priya, walkers, {
    kind: 'outing', title: 'Autumn hike to Beacon Hill', start: at(sat + 14, 8, 30), end: at(sat + 14, 15), place: 'Beacon Hill trailhead',
    capacity: 10, about: 'A longer one: 12 km with a pub lunch. Proper boots.', cost: 'About 15 for lunch',
  });
  for (const [who, ride, seats] of [[priya, 'offer', 3], [morgan, 'offer', 4], [grace, 'need', 1], [dana, 'need', 1], [ines, 'own', 0]] as const) {
    answer(who, hike, { status: 'going', ride, seats });
  }

  // Maple Street: a potluck with a bring list, a workday with shifts, a time poll.
  const party = event(sam, maple, {
    kind: 'potluck', title: 'Maple Street party', start: at(next(0, 10), 14), end: at(next(0, 10), 19), where_kind: 'place',
    place: 'Maple Street (closed to cars)', about: 'Bring a dish to share and a chair. The road is closed 13:00-20:00. Bouncy castle for the kids at 15:00.',
    diet_prompt: 'Anything we should know for the food table?',
    bring: [
      { id: 0, name: 'Salad', count: 3 }, { id: 0, name: 'Dessert', count: 3 }, { id: 0, name: 'Folding table', count: 2 },
      { id: 0, name: 'Drinks', count: 4 }, { id: 0, name: 'Barbecue', count: 1 },
    ],
  });
  const slot = (name: string) => party.bring.find((s) => s.name === name)!.id;
  answer(sam, party, { status: 'going', plus: 2, kids: 2, names: 'the twins', bring: [slot('Barbecue')] });
  answer(dana, party, { status: 'going', bring: [slot('Salad')], diet: 'Vegetarian' });
  answer(morgan, party, { status: 'going', bring: [slot('Folding table'), slot('Drinks')] });
  answer(kofi, party, { status: 'going', plus: 2, kids: 2, bring: [slot('Dessert')], diet: 'One of ours has a nut allergy' });
  answer(ines, party, { status: 'maybe', bring: [slot('Dessert')] });
  // Jordan's answer for the household is left open: "waiting for your answer".
  const bee = event(dana, maple, {
    kind: 'workday', title: 'Tool library working bee', start: at(next(6, 3), 9), end: at(next(6, 3), 13), where_kind: 'place',
    place: 'Community garden shed', about: 'Sharpen, oil, label, and finally fix the shelf.',
    bring: [{ id: 0, name: 'Gloves', count: 6 }, { id: 0, name: 'Thermos of tea', count: 2 }],
    shifts: [
      { id: 0, name: 'Sharpening', start: at(next(6, 3), 9), end: at(next(6, 3), 11), count: 2 },
      { id: 0, name: 'Shelves', start: at(next(6, 3), 9), end: at(next(6, 3), 13), count: 3 },
      { id: 0, name: 'Inventory', start: at(next(6, 3), 11), end: at(next(6, 3), 13), count: 2 },
    ],
  });
  const shift = (name: string) => bee.shifts.find((s) => s.name === name)!.id;
  answer(dana, bee, { status: 'going', shifts: [shift('Inventory')] });
  answer(morgan, bee, { status: 'going', shifts: [shift('Shelves')], bring: [bee.bring[0].id] });
  answer(sam, bee, { status: 'going', shifts: [shift('Sharpening')] });
  const poll = event(sam, maple, {
    kind: 'poll', title: 'When suits for the winter meeting?', where_kind: 'home', home: riveraHome, address: '9 Maple Street',
    about: 'Agenda: snow shovels, the holiday lights, and who keeps the key to the shed.',
    when: [
      { id: 0, start: at(12, 19), end: at(12, 21) }, { id: 0, start: at(15, 19), end: at(15, 21) }, { id: 0, start: at(19, 10), end: at(19, 12) },
    ],
  });
  const [w1, w2, w3] = poll.when.map((o) => o.id);
  answer(sam, poll, { status: 'going', when: [w1, w2] });
  answer(dana, poll, { status: 'going', when: [w2, w3] });
  answer(kofi, poll, { status: 'maybe', when: [w2] });
  answer(morgan, poll, { status: 'going', when: [w1, w2, w3] });
  // Theo asked to join; Sam and Dana get the request.
  b.joinGroup(theo, maple);

  // The family: a dinner with a diet question and an RSVP deadline.
  const dinner = event(sam, family, {
    kind: 'dinner', title: 'Sunday dinner at ours', start: at(next(0, 3), 17), end: at(next(0, 3), 20), where_kind: 'home', home: riveraHome,
    address: '9 Maple Street', about: "Roast chicken, and Jordan's sourdough. Grandma's coming.", diet_prompt: 'Any allergies or dislikes?',
  });
  answer(sam, dinner, { status: 'going' });
  answer(jordan, dinner, { status: 'going', diet: 'No coriander, ever' });

  // The Book Club, which Sam isn't in, invites Sam to an author talk.
  const talk = event(lena, books, {
    kind: 'meeting', title: 'Author talk: an evening with S. Clarke (on video)', start: at(9, 19, 30), end: at(9, 21), where_kind: 'place',
    place: 'Library, upstairs room', visibility: 'invite-only', invitees: [sam, jordan, grace], modules: ['headcount', 'questions', 'link'],
    link: 'https://example.com/live', questions: [{ id: 0, kind: 'yesno', prompt: 'Have you read the book?', choices: [] }],
  });
  answer(grace, talk, { status: 'going' });
  const meet = event(lena, books, {
    kind: 'meeting', title: 'Book Club: Piranesi', start: at(next(3, 4), 19), end: at(next(3, 4), 21), where_kind: 'place', place: "Lena's kitchen",
    questions: [
      { id: 0, kind: 'yesno', prompt: 'Finished it?', choices: [] },
      { id: 0, kind: 'choice', prompt: 'Next month?', choices: ['The Overstory', 'Klara and the Sun', 'Small Things Like These'] },
    ],
  });
  answer(grace, meet, { status: 'going' });
  answer(priya, meet, { status: 'going' });

  // Things that happened "before": a changed event, a reminder, an answer made for Sam.
  b.answer(jordan, walk.id, sam, { status: 'maybe', rev_seen: walk.rev, note: 'Jordan: you said maybe?' });
  b.updateEvent(alex, nights[0].id, { place: 'The back room at Hops & Co (upstairs this week)' });
  b.notify(sam, 'reminder', dinner.id, 0);
  for (const [i, n] of state.notices.entries()) n.created = now - (i + 1) * 47 * 60;
  for (const n of state.notices.filter((x) => x.to === sam).slice(3)) n.read = true;

  state.session = sam;
  state.audit = [];
  return state;
}
