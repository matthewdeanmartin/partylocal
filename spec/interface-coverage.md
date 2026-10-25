# Interface coverage — Sprint 6

Reviewed against `api/src/api.rs`, `api/src/api_more.rs` and writable wire messages on 2026-10-25. This is the current coverage record; older audit entries describe earlier states.

Club House and Gazette are two skins of the shipped desktop application. Terminal is available as embedded text mode (`/text`) and a standalone prototype, not as a third theme-picker option. The standalone Gazette, Chat and Deck builds use the same Rust API and shared forms.

## Interface decisions

N = native interaction; L = linked full form; X = deliberately excluded, with the reason below. Authorization is always enforced by Rust. A linked form is part of the same app, not a link to a different installed UI.

| Capability | Club House / Gazette skins | Standalone Gazette | Embedded / standalone Terminal | Chat | Mobile / Deck |
| --- | --- | --- | --- | --- | --- |
| Overview, groups, events, people, notices | N | N | N | N | N (people via member/profile links) |
| Create event, RSVP, common module answers | N | N | N | N | N |
| Hosts, visibility, invitees, map, complex modules | L full editor | L | L `manage` | L event settings | L full editor |
| Yearly birthdays; weekly/monthly recurrence | N + L limits | N + L limits | N + L series | N creation + L settings | N creation + L settings |
| Regular attendance | L series/event tools | L | L series | N, named confirmation | N |
| Household/proxy RSVP; private answers | L | L | L tools | N permitted-person selection | N permitted-person sheet |
| Ride board and calendar download | L | L | L tools | N | N |
| Request approval | N | N | L tools | N, named confirmation | N, named confirmation |
| Profiles, retained group RSVP history | N | N | L selected profile/tools | L profile/history | N |
| Co-organizers, removal, transfer ownership | L member/group tools | L | L tools | L | L |
| Invite existing accounts; external invitations | Dedicated page | Dedicated page | L group tools | L | L |
| Bulk birthdays / holidays | Dedicated group page | Dedicated group page | L group tools | L | L |
| Permanent event deletion | L event tools, confirmation | L | L tools | L full event page | L full event page |
| Profile, PIN, notifications | N + L full account | N + L account | N + L account | N + L account | N + L account |
| Identity linking/reset, personal links/feeds | L full account/sign-in | L account/sign-in | L account/sign-in | L | L |
| Household and people administration, settings/zone/audit/storage | L admin | L admin | L `admin` | L admin-only | L admin-only |
| Providers, mail/bot, delivery, publishing | L channels | L channels | L `channels` | L admin-only | L admin-only |
| Gate, sync diagnostics, framework operations | X | X | X | X | X |

Complex collection editors, ownership changes, credentials and bulk imports remain forms: chat choices become cumbersome and phone screens benefit from explicit review. Shared forms remain available on phones. Public directories intentionally respect discoverability; members' private dietary/question answers are never added to proxy writes.

## Writable field coverage

All fields below are accounted for. Revision values and item IDs are carried automatically, not editable presentation fields. Blank/zero sentinel behavior follows Rust validation.

| Wire input | Fields and destination |
| --- | --- |
| NewAccount | display_name, email, pin, setup_code: setup/sign-up; invite: carried from invitation |
| PinSignIn | login, pin: sign-in |
| MeUpdate | display_name, email, bio, discoverable, email_notify, dm_notify: profile/full account |
| PinChange | current, pin: full account/native PIN flow |
| AdminPersonUpdate | role, disabled, pin, display_name, sign_out, household: admin people |
| SettingsUpdate | signup_open, groups_admin_only: admin settings |
| HouseholdInput | name: admin households; add/remove person uses the equivalent admin-person household update |
| GroupInput | name, about, kind, visibility, join, members_create_events: group editor; status: archive/reopen tools; rev: automatic |
| MemberUpdate / Transfer | role, status: member/group tools; to: explicit ownership transfer |
| EventInput | kind, title, about, hosts, start/end, where_kind, place, address, map, home, visibility, invitees, capacity, rsvp_by, plus_ones/plus_max, status, modules, bring, diet_prompt, questions, cost, rides_note, when, shifts, link, reminder_secs: full editor; rev: automatic |
| Event nested collections | Slot name/count; question kind/prompt/choices; time-option start/end; shift name/start/end/count: full editor. IDs retained on edits. Reminder UI offers presets and preserves custom stored seconds; arbitrary second-level reminder entry is deliberately omitted. |
| RsvpInput | status, plus, kids, names, bring, bring_other, diet, answers, ride, seats, when, shifts, note: full RSVP; rev_seen: automatic; private fields omitted for household proxies |
| LockIn | option: host selects poll winner |
| SeriesInput | event: full creation editor; rule/every/nth: creation; until/count/window: creation and series settings. Rust does not support changing a saved rule; create a new series instead. |
| Regular / MarkRead | on: regular toggle; up_to: read notices action |
| ZoneSetting | zone: admin timezone (board recurrence uses this timezone); offset_secs is computed output, not an editable setting |
| InviteInput | target_kind/target: page context; email/handle/person, days/uses: invitation page/panel |
| NewPerson | display_name/email: invite panel; household deliberately assigned afterward through admin people, retaining Rust's admin-only household management |
| ProviderInput | name/base/trust: channels, including optional sign-in button name |
| OAuthStart | provider: selected button; purpose/token: sign-in, linking or invitation context |
| PinResetStart / PinResetConfirm | login/code/pin: full sign-in recovery |
| MailSetup | api_key/sender_email/sender_name: channels |
| BotSetup | instance/token/trust/commands/poll_secs: channels. Trust selection is required on each save because BotView does not return it. |
| PublishSetup | repo/branch/token/site_url/every_minutes: channels |

## Intentional boundaries

- Gate measurements and framework storage/crypto/outbound diagnostics are operational tools, not social-app features. `sync/status` is available for diagnostics; channel pages show the actionable publishing/delivery states.
- OAuth callback, wire schema and calendar feed requests are infrastructure consumed by their sign-in/download clients, not standalone screens. External-provider delivery and board firmware were not exercised by the demo browser tests.
- Household membership endpoints are redundant with the admin-person household control; there is no second UI for the same operation.
- Member history covers retained records only. Bulk import remains sequential/resumable, not a backend transaction. Birthday rules preserve month/day, with Feb 29 observed on Feb 28 in non-leap years; movable holidays require their appropriate weekday rule or individual dates.
- Form handoffs do not transfer an unsaved simplified-form draft; the warning is visible before switching. Text buffers must be saved/closed before handoff.
- The API does not offer a provider PATCH route despite an older message comment mentioning one. The actual supported operations are list/add/remove.

## Route inventory

Generated from the actual match arms, not just schema comments. Paths below use `/api/v1` unless already absolute. The preceding matrix specifies presentation per interface; the destination here identifies the shared capability implementing the route.

| Method | Route | Destination / disposition |
| --- | --- | --- |
| GET | `/api/v1/status` | Consumed by startup/navigation |
| POST | `/api/v1/setup` | N/L: setup, sign-in, account |
| POST | `/api/v1/auth/signup` | N/L: setup, sign-in, account |
| POST | `/api/v1/auth/pin` | N/L: setup, sign-in, account |
| POST | `/api/v1/auth/logout` | N/L: setup, sign-in, account |
| GET | `/api/v1/auth/me` | N/L: setup, sign-in, account |
| PATCH | `/api/v1/me` | N/L: account; summary consumed by navigation |
| PUT | `/api/v1/me/pin` | N/L: account; summary consumed by navigation |
| GET | `/api/v1/people` | N/L: profiles or invitation account creation |
| GET | `/api/v1/households` | L: admin household tools; household choices on event forms |
| POST | `/api/v1/households` | L: admin household tools; household choices on event forms |
| GET | `/api/v1/groups` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups` | N/L: group, members, invitations, event creation |
| GET | `/api/v1/admin/people` | L: administration |
| GET | `/api/v1/admin/settings` | L: administration |
| PATCH | `/api/v1/admin/settings` | L: administration |
| GET | `/api/v1/admin/storage` | L: administration |
| GET | `/api/v1/admin/audit` | L: administration |
| GET | `/api/v1/admin/zone` | L: administration |
| PATCH | `/api/v1/admin/zone` | L: administration |
| GET | `/api/v1/events` | N/L: event, editor, attendance, host tools/calendar |
| GET | `/api/v1/notifications` | N: inbox/read |
| POST | `/api/v1/notifications/read` | N: inbox/read |
| GET | `/api/v1/me/summary` | N/L: account; summary consumed by navigation |
| POST | `/api/v1/me/calendar` | N/L: account; summary consumed by navigation |
| GET | `/api/v1/gate` | X: operational benchmark |
| POST | `/api/v1/gate/storage` | X: operational benchmark |
| POST | `/api/v1/gate/crypto` | X: operational benchmark |
| POST | `/api/v1/gate/outbound` | X: operational benchmark |
| GET | `/api/v1/people/{id}` | N/L: profiles or invitation account creation |
| PATCH | `/api/v1/admin/people/{id}` | L: administration |
| PATCH | `/api/v1/households/{id}` | L: admin household tools; household choices on event forms |
| DELETE | `/api/v1/households/{id}` | L: admin household tools; household choices on event forms |
| PUT | `/api/v1/households/{id}/members/{person}` | L: admin household tools; equivalent admin-person household control |
| DELETE | `/api/v1/households/{id}/members/{person}` | L: admin household tools; equivalent admin-person household control |
| GET | `/api/v1/groups/{g}` | N/L: group, members, invitations, event creation |
| PATCH | `/api/v1/groups/{g}` | N/L: group, members, invitations, event creation |
| DELETE | `/api/v1/groups/{g}` | N/L: group, members, invitations, event creation |
| GET | `/api/v1/groups/{g}/members` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups/{g}/join` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups/{g}/leave` | N/L: group, members, invitations, event creation |
| PUT | `/api/v1/groups/{g}/members/{person}` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups/{g}/transfer` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups/{g}/events` | N/L: group, members, invitations, event creation |
| POST | `/api/v1/groups/{g}/series` | N/L: series creation/settings/regulars |
| GET | `/api/v1/events/{id}` | N/L: event, editor, attendance, host tools/calendar |
| PATCH | `/api/v1/events/{id}` | N/L: event, editor, attendance, host tools/calendar |
| DELETE | `/api/v1/events/{id}` | N/L: event, editor, attendance, host tools/calendar |
| POST | `/api/v1/events/{id}/cancel` | N/L: event, editor, attendance, host tools/calendar |
| POST | `/api/v1/events/{id}/lock` | N/L: event, editor, attendance, host tools/calendar |
| GET | `/api/v1/events/{id}/rsvps` | N/L: event, editor, attendance, host tools/calendar |
| PUT | `/api/v1/events/{id}/rsvps/{who}` | N/L: event, editor, attendance, host tools/calendar |
| GET | `/api/v1/events/{id}/rides` | N/L: event, editor, attendance, host tools/calendar |
| GET | `/api/v1/events/{id}.ics` | N/L: event, editor, attendance, host tools/calendar |
| GET | `/api/v1/series/{id}` | N/L: series creation/settings/regulars |
| PATCH | `/api/v1/series/{id}` | N/L: series creation/settings/regulars |
| DELETE | `/api/v1/series/{id}` | N/L: series creation/settings/regulars |
| PUT | `/api/v1/series/{id}/regular` | N/L: series creation/settings/regulars |
| POST | `/api/v1/auth/oauth/start` | N/L: setup, sign-in, account |
| GET | `/api/v1/auth/oauth/{ticket}` | N/L: setup, sign-in, account |
| POST | `/api/v1/auth/pin-reset` | N/L: setup, sign-in, account |
| POST | `/api/v1/auth/pin-reset/confirm` | N/L: setup, sign-in, account |
| DELETE | `/api/v1/me/identities` | N/L: account; summary consumed by navigation |
| POST | `/api/v1/me/link` | N/L: account; summary consumed by navigation |
| POST | `/api/v1/people` | N/L: profiles or invitation account creation |
| POST | `/api/v1/invitations` | L: invite panel / redemption page |
| GET | `/api/v1/invitations` | L: invite panel / redemption page |
| GET | `/api/v1/invitations/{token}` | L: invite panel / redemption page |
| POST | `/api/v1/invitations/{token}/redeem` | L: invite panel / redemption page |
| POST | `/api/v1/invitations/{id}/revoke` | L: invite panel / redemption page |
| GET | `/api/v1/admin/providers` | L: channels |
| POST | `/api/v1/admin/providers` | L: channels |
| DELETE | `/api/v1/admin/providers/{id}` | L: channels |
| GET | `/api/v1/admin/mail` | L: channels |
| PUT | `/api/v1/admin/mail` | L: channels |
| DELETE | `/api/v1/admin/mail` | L: channels |
| GET | `/api/v1/admin/bot` | L: channels |
| PUT | `/api/v1/admin/bot` | L: channels |
| DELETE | `/api/v1/admin/bot` | L: channels |
| GET | `/api/v1/admin/delivery` | L: channels |
| POST | `/api/v1/admin/delivery/{id}/retry` | L: channels |
| GET | `/api/v1/admin/inbox` | L: channels |
| GET | `/api/v1/admin/publish` | L: channels |
| PUT | `/api/v1/admin/publish` | L: channels |
| POST | `/api/v1/admin/publish/now` | L: channels |
| DELETE | `/api/v1/admin/publish` | L: channels |
| GET | `/api/v1/sync/status` | X: sync diagnostic; actionable state in channels |
| GET | `/cal/{token}.ics` | Linked personal calendar feed |
| GET | `/auth/callback` | OAuth callback, consumed by sign-in |
| GET | `/api/v1/schema` | Framework wire schema, consumed by API client |


## Reproducing release checks

Run `make check` for Rust/unit/type/Clippy checks and the shipped/Classic/Companion builds. Build the standalone variants with `npx ng build ui-chat`, `ui-deck`, `ui-gazette`, `ui-terminal` and `ui-calendar` from `ui/`.

For rendered tests, install Chromium once with `npx playwright install chromium` from `ui/`, build the local demo with `make demo-build` at the repository root, then run `npm run test:browser` from `ui/`. Playwright starts its own server on 127.0.0.1:4316; it does not reuse a developer server or existing browser session. Screenshots/traces are in ignored `ui/test-results/`. These tests write only isolated browser demo state.

Final results: 98 Rust tests plus 3 gate tests; 121 UI unit tests; 10 browser tests. Type checks, fmt and Clippy pass. Initial production sizes: Club House 298.13 kB, Classic 280.51 kB, Chat 263.39 kB, Deck 280.55 kB, Gazette 290.16 kB, Terminal 263.87 kB, Calendar 240.82 kB, Companion 239.66 kB. No budget thresholds were raised.

No unclassified social route or writable field remains in this audit. The intentional boundaries above are retained; this is local release verification, not validation of live external integrations or a hardware deployment.
