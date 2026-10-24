// Every word the desktop UI shows, per theme. A theme is this vocabulary
// plus the CSS tokens under [data-theme] in styles.css: the components and
// the forms are the same. To add a theme, add a Lexicon and a CSS block.
import type { EventKind } from 'party-core';

export type ThemeName = 'clubhouse' | 'gazette';

export interface Lexicon {
  name: string;
  /** The theme picker's label for this theme. */
  label: string;
  app: string;
  earLeft: string;
  earRight: string;
  issue: (n: number) => string;
  forName: (name: string) => string;
  nav: { home: string; plans: string; groups: string; calendar: string; notices: string; people: string; profile: string; text: string; create: string; admin: string };
  invite: string;
  moreSignIn: string;
  footer: string;

  // Home
  leadKicker: string;
  leadBy: (hosts: string, group: string) => string;
  leadMore: (id: number) => string;
  noAbout: string;
  alsoHeading: string;
  quietWeek: string;
  attending: (n: number) => string;
  ofPlaces: (n: number) => string;
  you: string;
  awaitingHeading: string;
  awaitingCta: string;
  allReplied: string;
  weekHeading: string;
  weekLine: (events: number, plans: number) => string;
  joinHeading: string;
  dateByVote: string;
  expected: (heads: number, cap: number, maybe: number) => string;
  yourReplyOnFile: (status: string) => string;
  noReplyYet: string;

  // Plans
  plansTitle: string;
  plansLede: string;
  plansEmpty: string;
  outstanding: string;
  replyCta: string;

  // Groups
  groupsTitle: string;
  groupsLede: string;
  startGroup: string;
  yourGroups: string;
  openGroups: string;
  noneOpen: string;
  applying: string;
  youAre: (role: string) => string;
  requestsWaiting: (n: number) => string;
  groupKicker: string;
  noAims: string;
  join: (open: boolean) => string;
  withdraw: string;
  leave: string;
  host: string;
  forthcoming: string;
  nothingPlanned: string;
  recently: string;
  roll: string;
  rollPrivate: string;
  applicant: string;
  admit: string;

  // Notices and people
  noticesTitle: string;
  noticesLede: string;
  markRead: string;
  noNotices: string;
  noticeKind: Record<string, string>;
  peopleTitle: string;
  peopleLede: string;
  peopleSearch: string;
  nobody: string;
  of: string;

  // The event page and its reply form
  pageOf: (id: number) => string;
  cancelledBanner: string;
  draftBanner: string;
  regular: (summary: string) => string;
  guestList: string;
  noReplies: string;
  perhaps: string;
  waiting: string;
  with: (n: number) => string;
  regrets: (names: string) => string;
  facts: { title: string; when: string; where: string; admission: string; free: string; expected: string; replyBy: string; wanted: string; tbd: string; home: string };
  still: (n: number) => string;
  correct: string;
  spike: string;
  spikeConfirm: string;
  editorsDesk: string;
  votedLead: string;
  fixFor: (when: string, votes: number) => string;
  reply: {
    title: string;
    lead: (name: string) => string;
    status: { going: string; maybe: string; no: string };
    bringing: string;
    guestsNone: string;
    guest: (n: number) => string;
    namely: string;
    namesHint: string;
    ofWhom: string;
    kidsNone: string;
    kids: (n: number) => string;
    datesLead: string;
    datesTail: string;
    bringLead: string;
    bringNothing: string;
    bringItem: (name: string) => string;
    covered: string;
    bringOther: string;
    shiftLead: string;
    shiftNone: string;
    shiftTail: string;
    rideLead: string;
    ride: { none: string; need: string; offer: string; own: string };
    rideFor: string;
    ridePeople: { offer: string; need: string };
    dietLead: string;
    dietHint: string;
    askLead: (prompt: string) => string;
    noAnswer: string;
    note: string;
    noteHint: string;
    signOff: string;
    sendNew: string;
    sendAgain: string;
    received: (status: string) => string;
    waitlisted: string;
    onFile: (status: string) => string;
    closed: string;
    membersOnly: string;
  };

  // New / edit event
  press: {
    title: string;
    editTitle: string;
    lede: string;
    editLede: string;
    noGroups: string;
    lead: string;
    announces: string;
    kinds: Record<EventKind, string>;
    calledEdit: string;
    called: string;
    titleHint: string;
    pollLead: string;
    or: string;
    anotherTime: string;
    on: string;
    until: string;
    repeat: { once: string; weekly: string; nth: string; date: string };
    where: { place: string; home: string; tbd: string };
    placeHint: string;
    whichHome: string;
    addressHint: string;
    places: string;
    placesUnlimited: string;
    placesLimited: string;
    persons: string;
    eachMay: string;
    guests: { none: string; one: string; two: string; three: string; any: string };
    bringLead: string;
    bringHint: string;
    costLead: string;
    costHint: string;
    dietLead: string;
    dietHint: string;
    askLead: string;
    askHint: string;
    linkLead: string;
    particulars: string;
    particularsHint: string;
    alsoPrint: string;
    hold: string;
    send: string;
    sendEdit: string;
  };

  // New group
  found: { title: string; lead: string; kinds: { club: string; circle: string; oneoff: string }; purpose: string; purposeHint: string; nameHint: string; knownTo: string; vis: { public: string; unlisted: string; private: string }; joining: string; joins: { open: string; approval: string; invite: string }; signed: string; send: string };

  // Profile
  profile: { title: string; nameLead: string; emailLead: string; emailHint: string; notifyLead: string; notify: { yes: string; no: string }; notifyTail: string; listedLead: string; listed: { public: string; members: string; nobody: string }; bioLead: string; bioHint: string; signOff: string; send: string; saved: string; pinLead: string; pinTail: string; pinSend: string; pinSaved: string; leaving: string; signOut: string; look: string; view: string; phone: string };

  // Sign in
  signin: { title: string; setupTitle: string; lede: string; setupLede: string; iAm: string; pinIs: string; newLead: string; newReach: string; newPin: string; setupLead: string; setupReach: string; setupPin: string; setupCode: string; go: string; goNew: string; goSetup: string; toNew: string; toOld: string };

  // Features
  calendarTitle: string;
  calendarLede: string;
  textTitle: string;
  chatOpen: string;
  chatTitle: string;
  stop: string;
}

const KIND_GAZETTE: Record<EventKind, string> = {
  generic: 'a get-together', party: 'a party', dinner: 'a dinner', potluck: 'a potluck', outing: 'an outing', meeting: 'a meeting', workday: 'a working bee', poll: 'a gathering',
};

export const GAZETTE: Lexicon = {
  name: 'gazette',
  label: 'Gazette',
  app: 'The Party Gazette',
  earLeft: 'House edition',
  earRight: 'Price: free to residents',
  issue: (n) => `Vol. I · No. ${n}`,
  forName: (n) => `For ${n}`,
  nav: { home: 'Front Page', plans: 'Your Diary', groups: 'Societies', calendar: 'The Almanac', notices: 'Notices', people: "Who's Who", profile: 'Letters', text: 'The Wire', create: 'Submit a Story', admin: 'The Office' },
  invite: 'Invitations',
  moreSignIn: 'Other ways in: Mastodon, or a forgotten PIN →',
  footer: 'All the news that fits the house.',
  leadKicker: 'Lead story',
  leadBy: (h, g) => `By ${h}, for ${g}`,
  leadMore: (id) => `Continued on page E${id}, with the reply slip →`,
  noAbout: 'Particulars are few, but the hosts promise a good time to all who come. Readers are encouraged to reply promptly.',
  alsoHeading: 'Also in this issue',
  quietWeek: 'A quiet week: no further gatherings reported.',
  attending: (n) => `${n} ${n === 1 ? 'reader has' : 'readers have'} said they will attend`,
  ofPlaces: (n) => `, of ${n} places`,
  you: 'You',
  awaitingHeading: 'Awaiting your reply',
  awaitingCta: 'Clip and reply →',
  allReplied: 'You are all replied up. The editors salute you.',
  weekHeading: 'The week ahead',
  weekLine: (e, p) => `${e} ${e === 1 ? 'gathering' : 'gatherings'} in the next seven days; ${p} in your diary.`,
  joinHeading: 'Societies to join',
  dateByVote: 'Date to be settled by vote',
  expected: (h, c, m) => `${h ? `${h} ${h === 1 ? 'person is' : 'people are'} expected` : 'No one has yet replied'}${c ? `, with room for ${c}` : ''}${m ? `; ${m} more ${m === 1 ? 'is' : 'are'} undecided` : ''}.`,
  yourReplyOnFile: (s) => `Your reply is on file: ${s}.`,
  noReplyYet: 'Your reply has not yet been received.',
  plansTitle: 'Your Diary',
  plansLede: 'Engagements accepted, considered and pending, as recorded by this office.',
  plansEmpty: 'Your diary is empty. See the front page for gatherings.',
  outstanding: 'Replies outstanding',
  replyCta: 'Reply →',
  groupsTitle: 'The Society Pages',
  groupsLede: 'Clubs, circles and one-off gatherings of the house and its neighbours.',
  startGroup: 'Found a society →',
  yourGroups: 'Your memberships',
  openGroups: 'Open to new members',
  noneOpen: 'None at present.',
  applying: 'Your application is under consideration.',
  youAre: (r) => `You are ${r === 'member' ? 'a member' : `an ${r}`}.`,
  requestsWaiting: (n) => `${n} application${n === 1 ? '' : 's'} await${n === 1 ? 's' : ''} you.`,
  groupKicker: 'The Society Pages',
  noAims: 'The society has not yet published a statement of aims.',
  join: (open) => (open ? 'Become a member' : 'Apply for membership'),
  withdraw: 'Withdraw it',
  leave: 'Resign membership',
  host: 'Announce a gathering',
  forthcoming: 'Forthcoming',
  nothingPlanned: 'Nothing announced.',
  recently: 'Recently',
  roll: 'The roll',
  rollPrivate: 'The roll is private.',
  applicant: 'applicant',
  admit: 'admit',
  noticesTitle: 'Notices',
  noticesLede: 'Personal announcements addressed to you.',
  markRead: 'Mark all as read',
  noNotices: 'No notices.',
  noticeKind: { reminder: 'Reminder', request: 'Application', invited: 'Invitation', cancelled: 'Cancellation', promoted: 'Good news', changed: 'Amendment', answered_for: 'On your behalf' },
  peopleTitle: "Who's Who",
  peopleLede: 'Residents and friends who have consented to be listed.',
  peopleSearch: 'look someone up',
  nobody: 'No one by that name is listed.',
  of: 'of',
  pageOf: (id) => `Page E${id}`,
  cancelledBanner: 'CANCELLED. The hosts regret that this gathering will not take place.',
  draftBanner: 'PROOF: not yet published. Only the hosts can read this.',
  regular: (s) => `This is a regular fixture: ${s.toLowerCase()}.`,
  guestList: 'The guest list',
  noReplies: 'No replies yet.',
  perhaps: '(perhaps)',
  waiting: '(waiting)',
  with: (n) => `(with ${n})`,
  regrets: (n) => `Regrets from ${n}.`,
  facts: { title: 'The particulars', when: 'When', where: 'Where', admission: 'Admission', free: 'Free', expected: 'Expected', replyBy: 'Reply by', wanted: 'Wanted', tbd: 'To be announced', home: 'A private residence' },
  still: (n) => `${n} still`,
  correct: 'Correct this story',
  spike: 'spike it (cancel)',
  spikeConfirm: 'Spike this story? Everyone who replied will be told it is cancelled.',
  editorsDesk: "From the editors' desk",
  votedLead: 'The readers have voted.',
  fixFor: (w, v) => `Fix it for ${w} (${v} ${v === 1 ? 'vote' : 'votes'})`,
  reply: {
    title: 'Reply slip',
    lead: (n) => `I, ${n},`,
    status: { going: 'shall attend', maybe: 'may attend', no: 'regret that I cannot attend' },
    bringing: 'bringing',
    guestsNone: 'no',
    guest: (n) => (n === 1 ? 'guest' : 'guests'),
    namely: 'namely',
    namesHint: 'their names',
    ofWhom: 'of whom',
    kidsNone: 'none',
    kids: (n) => (n === 1 ? 'is a child' : 'are children'),
    datesLead: 'Of the proposed dates,',
    datesTail: 'would suit me.',
    bringLead: 'For the table I shall bring',
    bringNothing: 'nothing in particular',
    bringItem: (s) => `a ${s.toLowerCase()}`,
    covered: '(covered)',
    bringOther: 'something else',
    shiftLead: 'I volunteer for the',
    shiftNone: '(no particular)',
    shiftTail: 'shift.',
    rideLead: 'As to getting there, I',
    ride: { none: 'have not decided', need: 'shall need a lift', offer: 'can offer lifts', own: 'shall make my own way' },
    rideFor: 'for',
    ridePeople: { offer: 'passengers', need: 'of us' },
    dietLead: 'On matters of diet, the hosts should know',
    dietHint: 'nothing in particular',
    askLead: (p) => `To the question “${p}” I answer`,
    noAnswer: '(no reply)',
    note: 'P.S.',
    noteHint: 'a note for everyone (optional)',
    signOff: 'Yours faithfully,',
    sendNew: 'Post my reply',
    sendAgain: 'Send a corrected reply',
    received: (s) => `Received with thanks: ${s}.`,
    waitlisted: 'Received. The gathering is full; you are on the waiting list.',
    onFile: (s) => `Your reply is on file: ${s}.`,
    closed: ' Replies are now closed.',
    membersOnly: 'Only members may reply:',
  },
  press: {
    title: 'The press desk',
    editTitle: 'Corrections desk',
    lede: 'Fill in the blanks; what you see is what will be printed.',
    editLede: 'Amend the announcement below and send it back to press. Readers who replied are told of changes.',
    noGroups: 'You may not announce gatherings for any society yet. Found one first, from the Society Pages.',
    lead: 'The',
    announces: 'announces',
    kinds: KIND_GAZETTE,
    calledEdit: 'The gathering called',
    called: 'to be called',
    titleHint: 'a fine title',
    pollLead: 'to be held at one of the following times, as the readers decide:',
    or: ' or ',
    anotherTime: '+ another time',
    on: 'on',
    until: 'until',
    repeat: { once: 'once only', weekly: 'and every week thereafter', nth: 'and on the same weekday each month', date: 'and on the same date each month' },
    where: { place: 'at', home: 'at the home of', tbd: 'at a place to be announced' },
    placeHint: 'the place',
    whichHome: '(which household?)',
    addressHint: "address, for residents' eyes only",
    places: 'Places are',
    placesUnlimited: 'unlimited',
    placesLimited: 'limited to',
    persons: 'persons, guests included',
    eachMay: 'Each may bring',
    guests: { none: 'no guests', one: 'one guest', two: 'up to two guests', three: 'up to three guests', any: 'as many guests as they like' },
    bringLead: 'Attendees are asked to bring',
    bringHint: 'e.g. salad x3, dessert x2, chairs',
    costLead: 'Admission:',
    costHint: 'free',
    dietLead: 'Guests will be asked:',
    dietHint: 'Any allergies?',
    askLead: 'They will also be asked, yes or no:',
    askHint: 'Can you bring a chair?',
    linkLead: 'Those attending from afar may follow at',
    particulars: 'Further particulars:',
    particularsHint: 'What readers should know…',
    alsoPrint: 'Also print',
    hold: 'Hold the presses (save as a proof only the hosts can see)',
    send: 'Send to press',
    sendEdit: 'Print the correction',
  },
  found: {
    title: 'Founding a society', lead: 'We hereby found', nameHint: "the society's name",
    kinds: { club: 'a club that meets regularly', circle: 'a circle of family or friends', oneoff: 'a committee for a single occasion' },
    purpose: 'for', purposeHint: 'its purpose', knownTo: 'Its existence shall be known to',
    vis: { public: 'all readers', unlisted: 'those given the link', private: 'its members alone' },
    joining: 'and new members', joins: { open: 'may simply join', approval: 'may apply, to be approved by the organizers', invite: 'are admitted by invitation only' },
    signed: 'Signed,', send: 'Register the society',
  },
  profile: {
    title: 'Letters to the Editor', nameLead: 'Dear Editor, kindly print my name as', emailLead: 'Readers may write to me at', emailHint: '(no address)',
    notifyLead: 'and I', notify: { yes: 'should', no: 'should not' }, notifyTail: 'like news of invitations sent there.',
    listedLead: "I wish to be listed in Who's Who for", listed: { public: 'every reader', members: 'fellow members of my societies', nobody: 'no one at all' },
    bioLead: 'A word about myself:', bioHint: '(nothing to add)', signOff: 'Yours,', send: 'Send the letter', saved: 'Your letter has been received and the corrections made.',
    pinLead: 'Dear Editor, my present PIN is', pinTail: 'and I should like it changed to', pinSend: 'Change my PIN', pinSaved: 'Your PIN has been changed.',
    leaving: 'Leaving?', signOut: 'Suspend delivery (sign out)', look: 'This paper is printed as', view: 'Reading on a phone?', phone: 'Switch to the pocket edition',
  },
  signin: {
    title: "The subscriber's desk", setupTitle: 'A new paper', lede: 'Residents and friends read free. Please identify yourself.',
    setupLede: 'This board has no readers yet. Whoever registers first becomes its editor (admin).',
    iAm: 'I am', pinIs: 'and my PIN is', newLead: 'I am new here. Please enrol me as', newReach: 'to be reached at', newPin: 'with the PIN',
    setupLead: 'I,', setupReach: 'take up the editorship. Correspondence may reach me at', setupPin: 'My PIN shall be', setupCode: 'The setup code is',
    go: 'Deliver my paper', goNew: 'Enrol me', goSetup: 'Begin publication', toNew: 'I am new here', toOld: 'I am already a reader',
  },
  calendarTitle: 'The Almanac',
  calendarLede: 'Gatherings by date. Click a day to announce one; drag a story to move it.',
  textTitle: 'The Wire',
  chatOpen: 'Ask the editor',
  chatTitle: 'The editor will see you now',
  stop: 'STOP PRESS: the board is not responding. Is it on, and are you on the home Wi-Fi?',
};

const KIND_CLUB: Record<EventKind, string> = {
  generic: 'a get-together', party: 'a party', dinner: 'a dinner', potluck: 'a potluck', outing: 'an outing', meeting: 'a meeting', workday: 'a workday', poll: 'something (time to be voted on)',
};

export const CLUBHOUSE: Lexicon = {
  name: 'clubhouse',
  label: 'Club House',
  app: 'Club House',
  earLeft: 'Groups and events',
  earRight: 'Members only',
  issue: () => '',
  forName: (n) => `Hi, ${n.split(' ')[0]}`,
  nav: { home: 'Home', plans: 'My plans', groups: 'Groups', calendar: 'Calendar', notices: 'Notifications', people: 'People', profile: 'Profile', text: 'Text mode', create: 'New event', admin: 'Admin' },
  invite: 'Invite people',
  moreSignIn: 'More ways to sign in: Mastodon, or a forgotten PIN →',
  footer: 'Club House runs on the house party board.',
  leadKicker: 'Up next',
  leadBy: (h, g) => `Hosted by ${h} · ${g}`,
  leadMore: () => 'Details and your answer →',
  noAbout: 'No description yet.',
  alsoHeading: 'Coming up',
  quietWeek: 'Nothing else planned yet.',
  attending: (n) => `${n} going`,
  ofPlaces: (n) => ` of ${n}`,
  you: 'You',
  awaitingHeading: 'Needs your answer',
  awaitingCta: 'Answer →',
  allReplied: "You've answered everything.",
  weekHeading: 'This week',
  weekLine: (e, p) => `${e} ${e === 1 ? 'event' : 'events'} in the next 7 days · ${p} in your plans`,
  joinHeading: 'Groups you could join',
  dateByVote: 'Time to be voted on',
  expected: (h, c, m) => `${h} going${c ? ` of ${c} places` : ''}${m ? ` · ${m} maybe` : ''}.`,
  yourReplyOnFile: (s) => `Your answer: ${s}.`,
  noReplyYet: "You haven't answered yet.",
  plansTitle: 'My plans',
  plansLede: "Things you're going to, thinking about, or waiting for a place at.",
  plansEmpty: 'No plans yet. Have a look at Home.',
  outstanding: 'Needs your answer',
  replyCta: 'Answer →',
  groupsTitle: 'Groups',
  groupsLede: 'Clubs, circles and one-off events in and around the house.',
  startGroup: 'Start a group →',
  yourGroups: 'Your groups',
  openGroups: 'Open to join',
  noneOpen: 'None right now.',
  applying: 'You asked to join; an organizer will let you in.',
  youAre: (r) => `You're ${r === 'member' ? 'a member' : `an ${r}`}.`,
  requestsWaiting: (n) => `${n} waiting to join.`,
  groupKicker: 'Group',
  noAims: 'No description yet.',
  join: (open) => (open ? 'Join' : 'Ask to join'),
  withdraw: 'Cancel request',
  leave: 'Leave group',
  host: 'New event here',
  forthcoming: 'Coming up',
  nothingPlanned: 'Nothing planned.',
  recently: 'Recently',
  roll: 'Members',
  rollPrivate: 'Only members see who is in this group.',
  applicant: 'asked to join',
  admit: 'let in',
  noticesTitle: 'Notifications',
  noticesLede: "What's happened lately.",
  markRead: 'Mark all read',
  noNotices: 'Nothing new.',
  noticeKind: { reminder: 'Reminder', request: 'Join request', invited: 'Invitation', cancelled: 'Cancelled', promoted: "You're in", changed: 'Changed', answered_for: 'Answered for you' },
  peopleTitle: 'People',
  peopleLede: 'Everyone you can find here.',
  peopleSearch: 'Search people',
  nobody: 'Nobody found.',
  of: 'from',
  pageOf: (id) => `E${id}`,
  cancelledBanner: 'This event was cancelled.',
  draftBanner: 'Draft: only hosts can see this.',
  regular: (s) => `Repeats: ${s.toLowerCase()}.`,
  guestList: "Who's coming",
  noReplies: 'No answers yet.',
  perhaps: '(maybe)',
  waiting: '(waitlist)',
  with: (n) => `+${n}`,
  regrets: (n) => `Can't make it: ${n}.`,
  facts: { title: 'Details', when: 'When', where: 'Where', admission: 'Cost', free: 'Free', expected: 'Going', replyBy: 'Answer by', wanted: 'Bring list', tbd: 'To be decided', home: "Someone's home" },
  still: (n) => `${n} needed`,
  correct: 'Edit event',
  spike: 'cancel event',
  spikeConfirm: 'Cancel this event? Everyone who answered is told.',
  editorsDesk: 'Pick the time',
  votedLead: "You're a host. Votes so far:",
  fixFor: (w, v) => `${w} (${v} ${v === 1 ? 'vote' : 'votes'})`,
  reply: {
    title: 'Your answer',
    lead: (n) => `${n.split(' ')[0]}:`,
    status: { going: "I'm going to", maybe: 'I might go to', no: "I can't make it to" },
    bringing: 'and bringing',
    guestsNone: 'no',
    guest: (n) => (n === 1 ? 'guest' : 'guests'),
    namely: '',
    namesHint: 'their names',
    ofWhom: 'with',
    kidsNone: 'no',
    kids: (n) => (n === 1 ? 'kid among them' : 'kids among them'),
    datesLead: 'These times work for me:',
    datesTail: '',
    bringLead: "I'll bring",
    bringNothing: 'nothing this time',
    bringItem: (s) => s,
    covered: '(taken)',
    bringOther: 'something else',
    shiftLead: "I'll help with",
    shiftNone: 'no shift',
    shiftTail: '',
    rideLead: 'Getting there: I',
    ride: { none: "haven't decided", need: 'need a ride', offer: 'can drive others', own: "will get there myself" },
    rideFor: 'for',
    ridePeople: { offer: 'people', need: 'people' },
    dietLead: 'Food notes for the hosts:',
    dietHint: 'none',
    askLead: (p) => `${p}`,
    noAnswer: '—',
    note: 'Note for everyone:',
    noteHint: 'optional',
    signOff: '',
    sendNew: 'Send my answer',
    sendAgain: 'Update my answer',
    received: (s) => `Saved: ${s}.`,
    waitlisted: "It's full, so you're on the waitlist. We'll tell you if a place opens.",
    onFile: (s) => `Your answer: ${s}.`,
    closed: ' Answers are closed.',
    membersOnly: 'Join the group to answer:',
  },
  press: {
    title: 'New event',
    editTitle: 'Edit event',
    lede: 'Fill in the blanks. The sentence is your preview.',
    editLede: 'Change what you need; people who answered are told about changes.',
    noGroups: "You can't create events in any group yet. Start a group first.",
    lead: '',
    announces: 'is hosting',
    kinds: KIND_CLUB,
    calledEdit: 'The event called',
    called: 'called',
    titleHint: 'a name for it',
    pollLead: 'at one of these times (people vote):',
    or: ' or ',
    anotherTime: '+ add a time',
    on: 'on',
    until: 'until',
    repeat: { once: "and it doesn't repeat", weekly: 'and every week after', nth: 'and on the same weekday every month', date: 'and on the same date every month' },
    where: { place: 'at', home: 'at the home of', tbd: 'somewhere to be decided' },
    placeHint: 'place',
    whichHome: '(pick a household)',
    addressHint: 'address, shown to members only',
    places: 'Places:',
    placesUnlimited: 'no limit',
    placesLimited: 'up to',
    persons: 'people, guests included',
    eachMay: 'Everyone can bring',
    guests: { none: 'no guests', one: '1 guest', two: 'up to 2 guests', three: 'up to 3 guests', any: 'any number of guests' },
    bringLead: 'Please bring',
    bringHint: 'e.g. salad x3, dessert x2, chairs',
    costLead: 'Cost:',
    costHint: 'free',
    dietLead: "We'll ask:",
    dietHint: 'Any allergies?',
    askLead: 'And a yes/no question:',
    askHint: 'Can you bring a chair?',
    linkLead: 'Join online at',
    particulars: 'Description:',
    particularsHint: 'Anything people should know…',
    alsoPrint: 'Extras',
    hold: 'Save as a draft (only hosts see it)',
    send: 'Create event',
    sendEdit: 'Save changes',
  },
  found: {
    title: 'Start a group', lead: "We're starting", nameHint: 'group name',
    kinds: { club: 'a club that meets regularly', circle: 'a circle of family or friends', oneoff: 'a group for one event' },
    purpose: 'for', purposeHint: "what it's about", knownTo: 'It can be found by',
    vis: { public: 'everyone here', unlisted: 'people with the link', private: 'members only' },
    joining: 'and people', joins: { open: 'can just join', approval: 'ask, and an organizer approves', invite: 'join by invitation only' },
    signed: 'Organizer:', send: 'Create group',
  },
  profile: {
    title: 'Profile', nameLead: 'Call me', emailLead: 'My email is', emailHint: '(none)',
    notifyLead: 'and I', notify: { yes: 'want', no: "don't want" }, notifyTail: 'emails about invitations and changes.',
    listedLead: 'People who can find me:', listed: { public: 'everyone here', members: 'people in my groups', nobody: 'nobody' },
    bioLead: 'About me:', bioHint: '(optional)', signOff: '', send: 'Save profile', saved: 'Saved.',
    pinLead: 'My current PIN is', pinTail: 'and my new PIN is', pinSend: 'Change PIN', pinSaved: 'PIN changed.',
    leaving: 'Done for now?', signOut: 'Sign out', look: 'Look:', view: 'On a phone?', phone: 'Switch to the phone view',
  },
  signin: {
    title: 'Welcome to Club House', setupTitle: 'Set up Club House', lede: 'Sign in with your name and PIN.',
    setupLede: 'This board is new. The first account becomes the admin.',
    iAm: "I'm", pinIs: 'and my PIN is', newLead: "I'm new. Make me an account as", newReach: 'with the email', newPin: 'and the PIN',
    setupLead: "I'm", setupReach: "and I'll be the admin. My email is", setupPin: 'My PIN will be', setupCode: 'The setup code is',
    go: 'Sign in', goNew: 'Create account', goSetup: 'Set up', toNew: "I'm new here", toOld: 'I already have an account',
  },
  calendarTitle: 'Calendar',
  calendarLede: 'Click a day to plan something; drag an event to move it.',
  textTitle: 'Text mode',
  chatOpen: 'Ask the board',
  chatTitle: 'Ask the board',
  stop: "The board isn't responding. Is it on, and are you on the home Wi-Fi?",
};

export const THEMES: Record<ThemeName, Lexicon> = { clubhouse: CLUBHOUSE, gazette: GAZETTE };
