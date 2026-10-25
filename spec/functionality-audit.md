# Functionality audit — 2026-10-25

Scope: Rust routes in `api/src/api.rs` and `api_more.rs`, event and membership rules, the shipped `ui-clubhouse` application, its Club House/Gazette themes, embedded text mode, chat, mobile, and the older standalone prototypes.

The two shipped desktop themes share the same routes and components. Theme switching does not change their feature coverage. The separate `ui-gazette` and `ui-terminal` builds are prototypes and do not have complete parity with the shipped application.

Current coverage is recorded in [Sprint 6 coverage](interface-coverage.md). The dated entries below preserve the audit history; their former gaps and test counts are superseded by the sprint tracker.

## Changes in this pass

| Report | Result |
|---|---|
| Existing-account invitations | Dedicated group invitation page searches all accessible people pages and adds an account through the existing membership API. Email, Mastodon, link and accountless invitations remain available there. Directory privacy is preserved. |
| Arbitrary default group | Global desktop and text-mode creation leave the group unselected. Group actions and calendar context retain an explicit group. Mobile already required a choice. |
| Co-organizers and member detail | Member links open a group-scoped page with promotion/demotion, upcoming answers and retained history. API permissions remain authoritative. Hidden directory profiles do not prevent management of visible memberships. |
| Profile pages | `/people/:id` is linked from the shipped directory, Classic directory and standalone Gazette directory. |
| Biography size | Desktop text areas and backend validation allow 2,400 characters. Existing paragraphs are retained. |
| Notification default | New people already had email enabled (`email_off = false`). The profile now reports the saved preference even before an email address is supplied. Existing opt-outs are retained. In-app notifications were already enabled. |
| New Event hover | Club House navigation CTA now explicitly sets contrasting foreground/background for hover and keyboard focus. |
| Group clutter | Invitation forms moved off both the shipped group page and the reused Classic group-management page. |
| Creator RSVP | Scheduled event creators automatically attend, including published drafts and new series occurrences. Their place counts toward capacity. Existing events are not backfilled and later explicit answers are respected. |
| Bulk events | Group page supports up to 60 dated lines, validation and preview, existing-event checks, and resuming after partial success. Birthdays are entered as dates and names. An editable US federal-holiday shortcut uses actual dates, not substituted leave-observance dates. Entries can now be individual events or yearly series (Sprint 4); fixed-date birthday imports use one upcoming occurrence per series. Board storage limits still apply. |
| Undetermined time | A scheduled event can have start/end zero, without being a time poll. It stays upcoming, accepts RSVPs, and is omitted from calendar exports until scheduled. Desktop/mobile offer a checkbox; full forms allow blank start/end; text mode accepts blank timestamps. This represents an unset date/time, not a known date with an unknown hour. |

The holiday rules were checked against [OPM](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/). The shortcut is explicitly labeled US because no country preference was supplied during implementation.

## Coverage of the Rust application

| Capability | Shipped desktop themes after this pass | Chat / mobile |
|---|---|---|
| Setup, sign-in, signup, PIN, logout | Native forms; additional identity flows through reused Classic sign-in | Basic native flows; complex identity flows best opened as a page |
| Profile, discoverability, email preferences | Native profile; link to full account settings for identities, companion link, calendar feed | Basic profile editing; full settings remain a page task |
| People directory and individual profiles | Directory and profile routes; directory privacy enforced by Rust | Chat search; member/profile pages can be opened from navigation |
| Group creation, join/leave and requests | Native creation, join/leave and admission | Native creation and join/leave; mobile links to members and group details |
| Existing and external invitations | Dedicated invitation page with account search and full external invitation controls | Chat and mobile group actions link to the invitation page |
| Member roles, ownership transfer, removal | Member page for co-organizer changes; full organizer tools for transfer/removal | Use explicit member/organizer pages, avoiding ambiguous name-based changes |
| Group edit/archive/delete and members-create-events policy | Newly linked full organizer tools, backed by existing Classic implementation | Page handoff |
| Basic event creation/editing, draft and cancel | Native forms; full event editor also linked through event tools | Native common flows; mobile adds undetermined time |
| Bring slots, diets, rides, shifts and questions | Simple native controls; full editor supports richer slots, multiple questions and shift details | Common answers native; complex module setup should open the full editor |
| RSVP on behalf of household/invitee, detailed answers, ride board | Newly linked full event tools expose these existing Rust features | Prefer a person selector/form with explicit identity; current chat does not cover all cases |
| Time polls and selecting the winning option | Native vote/lock controls | Existing native flows where supported |
| Series regulars, stop repeating, edits to following occurrences | Full event tools expose existing controls | Good future chat chips: become/stop being a regular; broader series editing remains a page task |
| Notifications and read state | Native | Native |
| Personal calendar feed and event ICS | Full account/event tools | Link/download actions are appropriate; no need for conversational configuration |
| Administration: people, households, settings, zone, audit, storage | Existing reused admin page | Keep as explicit forms; show a link only for admins |
| OAuth providers, email, bot, delivery retries, publishing | Existing reused channel admin page | Keep credential/configuration work out of chat; route admins to the page |
| Framework operations, diagnostics and gate benchmarks | Operational endpoints; not ordinary social-app screens | Intentionally not chat/mobile social actions |

## Remaining gaps and useful next work

1. **Event-specific hosts, visibility and direct invitee editing:** Rust `EventInput` accepts these fields, but even the full event editor does not expose all three. Group co-organizer changes are now surfaced; that is distinct from assigning hosts for a single event. Add an explicit people picker and visibility selector to the full editor.
2. **Series end conditions and changing the generation window:** Rust `SeriesInput` supports `until`, count and window updates. Creation exposes some recurrence settings; there is no complete series-settings screen. Yearly birthday recurrence was added in Sprint 4.
3. **Mobile and chat coverage remains deliberately narrower:** use focused actions for admission, becoming a regular, viewing ride offers, calendar downloads, and opening someone's profile. Bulk imports, detailed multi-question/shift editing, ownership transfer and channel administration are better handled by linked forms. This pass adds group invitation links to both and bulk-entry navigation to chat; mobile can reach bulk entry through the group page.
4. **Standalone prototypes:** Gazette now receives shared profile, member, invite and bulk routes plus the event/profile fixes. Standalone Terminal gets the group-selection correction and shared backend behavior; it remains a limited text interface. Prefer the embedded `/text` interface for access to the shared application tools.
5. **History is retained history:** the board deliberately trims old events. The member page follows event pagination but cannot reconstruct expired records. A permanent attendance archive would need a separate retention/export feature.
6. **Bulk import is resumable, not transactional:** it writes one event at a time, checks title/start duplicates, and marks successful rows. Rechecking existing events before retry covers a response lost after a commit. Concurrent imports from different clients can still race; a backend idempotency key or transaction endpoint would be needed for stronger guarantees.

## Verification

Regression coverage includes creator attendance, draft publication, an undated event staying in upcoming rather than past, demo parity, capacity/waitlist behavior, invalid/leap dates, duplicate bulk input and movable holidays. Passed: 72 Rust unit tests, 24 API integration tests, 3 gate tests, 62 UI tests, TypeScript checks for all eight application projects, Clippy with gate enabled and warnings denied, and production builds for Club House, Classic, Companion and standalone Gazette. Club House produces an initial-bundle warning (385 kB against a 300 kB warning budget).

Rendered-browser verification was attempted but blocked: Computer Use could not reliably determine the Windows browser URL and ended the UI session. No board firmware was flashed or deployed in this pass.


## Sprint 1 follow-up

The simplified-editor data-loss fixes are now implemented: question metadata and additional questions survive prompt edits, bring-list identities survive reordering, resolved polls keep their scheduled time, and text editors preserve untouched rich fields. Direct full-editor handoffs were added for simplified desktop/mobile forms. See [the sprint tracker](interface-sprints.md) for verification status. The later feature-coverage gaps above remain queued for Sprints 2–6.


## Interface sprint 2 follow-up

Event hosts, visibility, direct invitees and map links now have controls in the shared full editor. Club House and Gazette link directly from event pages; Classic uses its existing editor; both text modes provide an explicit `manage` handoff (Terminal: `:manage`). The person selector respects the board's discoverability rules and follows search pagination. Group co-organizer roles remain a separate workflow. UI permission checks supplement Rust authorization; tests cover preservation, denied edits, validation and save failures. Rendered checks remain pending. Four implementation sprints remain.


## Interface sprint 3 follow-up

Series end/count/window settings, regular attendance, stop-only and stop-with-cancellation now have a shared screen. Desktop themes link to it; both text modes expose explicit handoffs. Creation includes weekday ordinal and initial limits, and occurrence editing distinguishes this event from this-and-following. The interface explains timezone and RSVP retention behavior and identifies annual recurrence as unsupported. UI and Rust tests verify limits, permission failures and preservation of created occurrences. Rendered verification remains pending; mobile/chat native actions remain Sprint 5. Three implementation sprints remain.


## Interface sprint 4 follow-up and birthday recurrence

Yearly recurrence is now supported end to end in Rust, the browser demo, full/simplified desktop creation, mobile creation and text buffers. This supersedes the Sprint 3 annual-recurrence exclusion. February 29 uses February 28 in non-leap years and returns to February 29 in leap years; this policy is stated in creation and series settings. Bulk import has an explicit yearly option for birthdays/fixed-date anniversaries; holiday presets reset to individual events because several holidays follow weekday rules.

| Capability | Club House | Gazette | Terminal | Remaining limit |
| --- | --- | --- | --- | --- |
| RSVP on behalf | Linked full event tools | Linked full event tools | `o` / `tools` opens full event page | Uses API-provided answer-for list |
| Detailed answers | Full event tools | Full event tools | Linked full event page | Diet/questions only for self or hosts |
| Ride coordination | Host tools | Linked host tools | Linked host tools | Host permission required; load failures visible |
| Profiles | Native directory + linked profile | Native directory + linked profile | Selected person: `o` / `profile` | Discoverability enforced by API |
| Retained RSVP history | Group member page | Group member page | Group → member page | Group-scoped; expired events unavailable |
| Requests/member roles | Native approval + full group tools | Native approval + full group tools | `o` / `tools` on a group | Organizer/last-owner rules remain backend-enforced |

The shared event page displays guest names, shift selections, time votes and permitted detailed answers. Household proxies omit hidden diet/question fields when submitting, preserving existing private answers. A failed answer-list load blocks submission; ride failures are reported. Shared people loading follows pagination. Profile history links use supported event aliases in each theme. Text-mode full tools are keyboard accessible and refuse to abandon an open edit buffer.

Rendered verification remains pending. Mobile/chat native attendance/member workflows remain Sprint 5; deployment and release verification remain Sprint 6.


## Interface sprint 5 follow-up: chat and mobile

| Action | Embedded / standalone chat | Club House mobile / Deck |
| --- | --- | --- |
| Named request approval | Group action; choose exact person, confirm group/name, recheck before write | Group member list; review, confirm exact person, recheck before write |
| Regular attendance | Event chip or `regular e12`; explicit confirmation and retained-RSVP explanation | Event control with retained-RSVP explanation |
| Household/proxy RSVP | Choose from permitted people; private fields omitted for non-host proxies | Native RSVP sheet, selected name shown; fresh permissions and answer load |
| Profile/history | People profile links; group member selector shows retained status history in chat | Native profile and group-scoped history screens |
| Ride coordination | Host-only event chip or `rides e12` | Host-only event control and native list |
| Calendar download | Event chip or `calendar e12` | Event download link |
| Notes/extra bringing | Keep/change/clear; no silent loss during unrelated changes | Existing fields retained in RSVP sheet, including plain No responses |
| Complex organizer/account work | Explicit full-form links; conversation retained on return | Explicit full-form links; native quick actions remain on mobile |

Permission and data-load failures remain visible. History presentation only retains event identity/date/status, not private answer details. Ambiguous names do not choose the first option. Annual birthday creation is supported in chat as well as mobile. Narrow-viewport rendering and interaction checks remain unverified; the available computer-use inventory exposed no browser automation surface. Release verification remains Sprint 6.


## Interface sprint 6 follow-up: verified

The [current coverage record](interface-coverage.md) reconciles routes and fields, records the intentional form handoffs and diagnostics exclusions, and provides repeatable verification commands. All six sprints are implemented. The rendered-testing carryover is closed with ten passing isolated Chromium checks and screenshot review. Pagination, account/admin entry points, permanent event deletion, channel fields, chat startup/layout and phone route handling received final fixes. Club House is below its unchanged bundle warning budget. See [the sprint tracker](interface-sprints.md) for final counts and deployment boundaries.
