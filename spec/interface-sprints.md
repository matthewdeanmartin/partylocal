# Interface coverage: six sprints

Follow-on to [the functionality audit](functionality-audit.md). These are focused delivery increments, separate from the original numbered product sprints. Work stays uncommitted in the working tree; deployment is a separate step.

## 1. Preserve existing event settings — implemented; rendered verification pending

Fix simplified desktop/mobile editors so editing one question preserves its identity, type, choices and additional questions. Preserve bring-item identities when reordering lists; prevent ambiguous names from being rewritten by a lossy text format. Review edits of scheduled polls, guest limits, shifts and hidden fields for the same class of problem.

Exit: regression tests cover rich settings edited through simpler interfaces, untouched fields survive round trips, and unsupported edits are clearly explained or handed to the full editor. Validate the affected production builds and perform a rendered-page check when browser tooling is available.

Implemented:

- Shared question editing preserves type, choices, identity and additional questions; blanking an existing prompt cannot silently delete it.
- Bring-list edits preserve identities by item name rather than position; ambiguous names remain read-only in the short format.
- Resolved polls retain their scheduled start/end through shared, full-form and text editors. New/unresolved polls still save without a fixed start.
- Adding a time vote preserves the event kind, existing modules and guest policy.
- Guest allowances above the small preset menu are displayed accurately and retained.
- Both text editors parse only changed fields, preserving precise timestamps, multi-day durations, separators in stored content and hidden settings during unrelated edits. Reordered questions, shifts and poll choices no longer inherit ids by row position.
- Simplified desktop/mobile editors link to the full saved-event editor; standalone Gazette/Deck have matching guarded routes.
- Regression tests check shared save requests and both text editors. All 77 UI tests pass. Production builds for Club House, Classic, Gazette, Deck and Terminal pass; Club House still exceeds its initial-bundle warning budget.

Remaining verification: rendered interaction checks. Browser automation was unavailable during the prior verification attempt; do not treat this as a visually verified or deployed release. No Rust schema or API changes were needed for these editor fixes.

## 2. Complete event management — implemented; rendered verification pending

Expose event-specific hosts, visibility, direct invitees and map links in the shared full editor. Use person selectors, permission-aware controls, and explicit save feedback. Make these controls reachable from each shipped desktop theme and text mode. Keep group co-organizer roles distinct from event hosts.

Exit: authorized hosts can manage each supported field; unauthorized users cannot; changing an unrelated field preserves access settings. Private/invite-only event tests remain green.

Implemented:

- The full editor has discoverability-respecting, paginated person search; 1–4 event hosts; direct invitees; group/invite-only/public visibility; and HTTP(S) map links. Public visibility is selectable only for public groups.
- Event hosts are explicitly distinguished from group co-organizers. Existing selections survive unrelated edits, including people absent from search results.
- The editor waits for permissions before enabling controls, blocks unauthorized submission, reports server failures and save success, and uses the returned revision for subsequent saves. Removing your own edit access disables further edits.
- Club House and Gazette event pages link directly to hosts/access management and display map links. Classic already routes to the full editor; simplified desktop/mobile editors retain their full-editor handoffs.
- Embedded text mode has `manage`; standalone Terminal has `:manage` and a lazy full-editor route. An open text buffer must be saved/closed before switching.
- 82 UI tests and 96 Rust tests pass, including private/invite-only coverage. Production builds pass for Club House, Classic, Gazette, Deck and Terminal. Club House's existing initial-bundle warning remains; rendered interaction verification remains pending.

**Four implementation sprints remain (3–6).** Outstanding rendered checks from sprints 1–2 carry into release verification; these changes are not deployed.

## 3. Complete recurring-event settings — implemented; rendered verification pending

Add a series-settings screen for end date, occurrence limit and future-generation window. Surface regular attendance, stop repeating, and single-occurrence versus following-occurrence edits. Explain timezone behavior and the distinction between cancelling generated events and stopping future generation.

Exit: every existing Rust series control has a reachable UI with appropriate tests. Annual recurrence is explicitly identified as unsupported; adding a new Rust recurrence rule is a separate scope decision, not implied by exposing existing controls.

Implemented:

- Shared `/series/:id` screen exposes inclusive end time, total occurrence limit (0–104), generation window (1–8), regular attendance, and stopping with or without cancelling upcoming events.
- Text explains device versus board timezone, daylight-saving behavior, retained RSVPs when leaving regular attendance, and the fact that lowering limits does not cancel existing events. Saving ended-series settings can restart generation; this is stated on the form.
- Upcoming occurrences link to single-event and following-occurrence editing. Weekly/monthly creation exposes end/count limits and explicit first/second/third/fourth/last weekday selection. Annual recurrence and changing an existing repeat rule are explicitly unsupported by Rust.
- Club House, Gazette and Classic link to series settings. Embedded text and standalone Terminal provide `series` and `new-series` commands (prefixed with `:` in Terminal). Simplified desktop creation links to the full recurring-event form with a clear warning that typed draft content is not transferred. Deck has a guarded settings route and the saved-event editor handoff; native mobile/chat actions remain Sprint 5.
- Browser-demo series saves now persist limits and generate additional occurrences, and regular toggles retain existing answers. Stop operations enforce host permissions.
- 93 UI tests pass; cross-app type checks pass. The existing 96 Rust tests plus a new series-limit permission/preservation test pass. Five affected production builds pass. Club House's existing bundle warning and rendered verification remain open.

**Three implementation sprints remain (4–6).** Changes remain local and uncommitted.

## 4. Attendance and member tools across desktop views — implemented; rendered verification pending

Surface RSVP-on-behalf, detailed answers, host-only ride coordination, profiles, retained attendance history, request approval and member roles. Give Club House, Gazette and Terminal themes consistent navigation. Add keyboard-accessible actions to embedded text mode. Review standalone Gazette/Terminal and either expose the relevant controls or provide an explicit handoff rather than silently omitting them.

Exit: a capability matrix distinguishes native controls, linked forms and remaining gaps. No hidden profile, dietary answer or host-only detail leaks through a new entry point.

Implemented:

- Gazette and Terminal now reach the full event/group tools. Embedded text mode and Terminal have keyboard `o` and `tools`/`profile` commands for selected events, groups and people; open editor buffers are protected.
- Full attendance shows guest names, shifts, votes and permitted private question answers. Ride coordination remains host-only, with visible load failures. RSVP-on-behalf uses the API's permitted people; private household-member answers are omitted from writes and preserved. Saving is blocked until existing answers load successfully.
- Profile/member pages and retained group RSVP history have working cross-theme links. Group tools provide request approval and role management; direct role actions check management permission before sending. Shared people directories follow pagination.
- Capability matrix recorded in functionality-audit.md; mobile/chat native workflows remain Sprint 5.
- User-directed scope addition: yearly birthday recurrence in Rust/demo and all creation modes, including explicit bulk yearly imports. February 29 uses February 28 in non-leap years and returns to February 29 in leap years. This supersedes Sprint 3's annual exclusion. Weekly/monthly holidays are not converted to fixed-date yearly rules.

- Validation: 98 UI tests, 98 Rust tests and 3 gate tests pass. Cross-app type checks, formatting and Clippy (including gate) pass. All five affected production builds pass; Terminal is under budget after lazy-loading its main screen. Club House retains its existing warning.

**Two implementation sprints remain (5–6).** Rendered checks remain pending; changes remain local and uncommitted.

## 5. Focused chat and mobile actions — implemented; rendered verification pending

Add named-person request approval, series regular toggles, household RSVP selection, profile/history access, permitted ride-board viewing and calendar downloads. Complete chat RSVP notes and bringing-other-items. Keep clear entity selection and confirmation for ambiguous names or role changes. Retain linked forms for bulk imports, complex series/question/shift editing, ownership transfer and channel administration.

Exit: each action is discoverable from the relevant group/event/person, uses existing backend permissions, handles failure visibly, and preserves optional RSVP fields. Mobile controls remain usable on a narrow viewport.

Implemented:

- Both chats expose event-specific regular attendance, proxy/household RSVP selection, host ride coordination and calendar downloads. Group cards expose named request approval and member-history selection; profiles and complex settings have form handoffs. Yearly birthdays are available in guided creation.
- Request approval names the selected person and group, asks for confirmation, then rechecks permissions/pending status. Ambiguous typed choices no longer select the first match. Regular toggles explain that existing RSVPs remain.
- Chat RSVP notes and extra bringing text have keep/change/clear choices; existing guest names, diet and text answers also offer preservation. Household proxies omit private fields. Conversations survive linked-form navigation.
- Dedicated mobile pages have touch-sized request-review actions, native profiles and group attendance history, regular controls, calendar links and host-only ride lists. RSVP sheets identify the selected person, re-read permitted targets and existing answers, retain optional fields and hide/preserve private answers for household proxies.
- Shared actions recheck permissions and propagate failures. Complex member roles, ownership, bulk imports, full event/series settings, household and channel administration retain explicit form handoffs; admin handoffs are permission guarded.
- 115 UI tests pass, including both chat implementations and both mobile RSVP sheets. Cross-app type checks and three affected production builds pass. Deck and standalone Chat are under budget; Club House's existing warning remains. Browser inventory exposed no browser automation surface, so narrow-viewport rendered interaction checks remain pending for Sprint 6.

**One implementation sprint remains (6).** Work is local and uncommitted; no deployment.

## 6. Coverage and release verification — complete

Reconcile every Rust social-app route and writable input field against all interfaces, including account/identity, notifications, household/admin and external-channel settings. Clearly separate operational/diagnostic endpoints from social features. Close missing handoffs, check route aliases and pagination, and verify the three themes plus text/chat/mobile. Measure bundle size and resolve or explicitly account for budget warnings.

Exit: tests, type checks, Clippy and production builds pass; rendered interaction checks pass; the audit marks every capability native, linked, deliberately excluded or still open with a reason. Board flashing and external publication are not part of this sprint without authorization.


Implemented and verified:

- Reconciled the Rust route match arms and writable message fields in [the coverage record](interface-coverage.md). Distinguished native actions, linked forms and deliberately excluded diagnostics. Corrected the earlier description: Club House/Gazette are themes; Terminal is embedded text mode or a separate prototype.
- Added Gazette/Terminal account and admin entry points, standalone invitation/auth aliases, and direct chat/mobile handoffs to full attendance/host tools. Full event tools now provide explicit, confirmed permanent deletion, including cancelled events.
- Exposed email sender name, provider button name and bot certificate trust. Bot trust must be selected when saving because the existing read response does not return it.
- Fixed overview pagination in shared and Classic views, Classic group-event pagination, desktop/mobile route detection, and birthday dates drifting when old demo data is refreshed.
- Fixed both chats accepting input before startup completed, embedded chat cards overflowing their panel, and the standalone chat shell pushing the phone composer below the viewport.
- Lazy-loaded desktop shell and view-specific styles, keeping invitation panels styled. Club House's production initial bundle is **298.13 kB**, below its unchanged 300 kB warning budget. All production applications build without budget warnings.
- Added repeatable Playwright checks with an isolated Chromium browser and demo data. Ten checks cover both desktop themes, embedded text/chat, standalone Gazette/Terminal/Classic routes, 390-pixel phone layouts, named approvals, regular attendance, conversation preservation, invitation navigation, biography space, creation context, confirmed deletion/cancellation, and overflow/composer bounds. Screenshots were visually inspected.

Validation: **98 Rust tests + 3 gate tests; 121 UI unit tests; 10 browser tests**, all passing. Cross-app type checks, Rust formatting, Clippy with/without gate, and all eight production app builds pass. Production dependency audit reports no vulnerabilities. Browser checks use the local demo backend; live OAuth/email/publishing and firmware deployment were not performed.

**Zero sprints remain (6 of 6 complete).** Changes remain local and uncommitted; no board flashed or site published. The earlier rendered-verification carryovers are closed by Sprint 6.
