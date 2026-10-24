# Demo mode: party without a board

Every UI over the board can run with the board faked inside the browser:
`fetch()` calls to `/api/v1/*` are answered by a TypeScript port of the
board's rules, and the data lives in `localStorage`. It's for trying party
out (later on GitHub Pages) and for working on a UI without flashing.

```sh
make demo-local              # build Club House and the prototypes, serve http://localhost:4300
make demo-dev APP=clubhouse  # live-reload one UI in demo mode (clubhouse classic chat calendar deck terminal gazette)
```

All UIs are on one origin, so they share the same data: answer something in
one and it's there in the others. You start signed in as **Sam Rivera**
(admin). The **DEMO** tab on the right edge of every UI switches person,
signs out, resets the seed, or starts an empty board to try first-run setup.
Every PIN is `1234`.

## Published demo

The demo is on GitHub Pages at
<https://matthewdeanmartin.github.io/partylocal/>.
`.github/workflows/pages.yml` publishes it on pushes to `main` that touch the
UI or the demo tools, or by hand (Actions → Deploy party demo → Run
workflow). It checks out the microcontroller repository next to this one
(only the framework's Angular client is needed for the demo).

It runs `make test-web`, then `make demo-build DEMO_BASE=partylocal/`. Pages
has no per-folder fallback for path routes, so the site's `404.html`
(`.github/pages/`) sends `/partylocal/<ui>/<route>` to
`/partylocal/<ui>/?__p=<route>`, and a small script that
`tools/demo-deep-links.mjs` adds to each UI's `index.html` puts the route
back before Angular starts. Visitors get the seeded neighbourhood; their
changes stay in their own browser.

## Club House: the direction

`/clubhouse/` (project `ui-clubhouse`) is the UI the prototypes below fed
into. It's one app with two views:

- **Desktop** (`/`): the Gazette's layout and its fill-in-the-blank forms
  ("I'm going to Maple Street party, bringing 2 guests…"). Smaller screens
  get a reflowed version, but phones default to the deck.
- **Phone** (`/m/`): the Deck, opened by default on narrow or touch screens.
  "📱 Phone view" (desktop footer) and "Desktop view" (phone Me tab) switch
  views and keep the page; the choice is remembered in the browser.

**Themes** change both the look and the wording: `app/lexicon.ts` holds every
word the desktop shows, one `Lexicon` per theme, and `styles.css` holds the
look under `html[data-theme=…]`. The components and forms are shared, so
switching (footer, or Profile) is instant. Two themes so far:
**Club House** (neutral words, clean look, the default) and **Gazette**
(the newspaper). Adding one is a `Lexicon` plus a CSS block.

**Features**, built into the desktop view:

| Feature | Where | From |
|---|---|---|
| Calendar | the Calendar tab (`/calendar`): month/week/agenda, group layers; a day opens the new-event form at that time, events open their page, hosts drag to move | Calendar prototype |
| Chat | "Ask the board" on every page (or press `c`); chips open the matching page | Chat prototype |
| Text mode | footer link or `g t` (`/text`): two panes, the keys for what you can do always on screen, nano-style editor (^O save, ^X close, ^K/^U cut and paste a line), plain-word commands after `/` (`going e12`, `new event`) | Terminal prototype, minus vi |
| Keyboard | Mastodon-style everywhere on the desktop: `g h` home, `g p` plans, `g g` groups, `g c` calendar, `g n` notifications, `g w` people, `g u` profile, `g t` text mode, `n` new event, `/` search people, `?` the list | Mastodon web |
| Phone view | `/m/`, the whole Deck | Deck prototype |

Code: `app/desk/` (pages, forms, calendar, text mode, shortcuts),
`app/mobile/` (the deck), `app/chat/` (the panel), `app/theme.ts`,
`app/lexicon.ts`, `app/view.ts`. Each feature's stylesheet is scoped to its
element (`ch-desk`, `m-shell`, `.chat-panel`, `.console`, `.calendar-page`)
so none of them leak into each other.

The prototype projects (`ui-chat`, `ui-calendar`, `ui-deck`, `ui-terminal`,
`ui-gazette`) are still there for comparison; Club House has its own copies,
so they can be deleted whenever you like.

## The prototypes

| Path | Project | Navigation | Forms |
|---|---|---|---|
| `/classic/` | `local` | header menu, pages | classic fields |
| `/chat/` | `ui-chat` | a conversation; typed commands and tappable chips, no menu | asked one question at a time; slot-filling (`fri 7pm`, `Salad x3`) |
| `/calendar/` | `ui-calendar` | the month/week/agenda grid; groups are layers in a rail; drag an event to move it | a drawer, with a day timeline for picking the time (and poll options, shifts) |
| `/deck/` | `ui-deck` | phone tab bar; a stack of cards (swipe right go, left pass, up maybe) | full-screen steps with big targets; a PIN pad to sign in |
| `/terminal/` | `ui-terminal` | keys (`1-5`, `j/k`, `y/m/n`), `:` commands, `ctrl-k` palette | `key: value` text buffers, `:w` to save, errors by line number |
| `/gazette/` | `ui-gazette` | a newspaper's table of contents | sentences with blanks ("I shall attend…, bringing 2 guests") |

Each one covers the member flows: sign in/up (and setup), home, groups
(browse, join, start one), events (read, answer with every module, create,
edit, cancel, lock a poll), people, notifications and profile. Admin and
channel setup are only in Classic.

## How it fits together

| Path | What |
|---|---|
| `ui/projects/party-ng/` | the Angular client every UI shares (`Api`, moved out of `local`), plus UI-neutral flows (`loadOverview`, `saveEvent`, `EventDraft`) and `parseWhen` |
| `ui/projects/party-demo/` | the fake board: `board.ts` (rules), `routes.ts` (`/api/v1`), `seed.ts` (the neighbourhood), `install.ts` (fetch shim, storage, toolbar), `schema.ts` (generated) |
| `ui/projects/ui-*/` | the five new UIs; each has its own shell, routing, pages and styles |
| `tools/serve-demo.mjs` | a static server with per-UI SPA fallback |
| `tools/demo-schema.mjs` | refreshes `schema.ts` from a running server (`make run`, then `make demo-schema`) |

Each app's `main.ts` calls `startDemo()`. In live builds that's a no-op
(`party-demo/src/switch.ts`); the `demo` configurations in `angular.json`
replace it with `switch.demo.ts`, so the fake board never ships in firmware
(the live `local` bundle has none of it).

The seed is built through the board's own rules (`createGroup`,
`createEvent`, `answer`…), so it's consistent; `board.test.ts` checks it and
the main rules (visibility, waitlist, bring-list slots, polls). Dates are
relative to the day it's made, and move forward a week at a time so an old
demo stays current.

## Limits

- Nothing leaves the browser: no email, Mastodon, OAuth, PIN reset or publishing (those endpoints answer with an explanation).
- The fake board follows the Rust rules closely but isn't them. When they differ, the board is right.
- PINs are stored as typed: it's made-up people in one browser.
- Path routing needs a fallback to each UI's `index.html`. `serve-demo.mjs` does that locally; on GitHub Pages the site's `404.html` and the restore script do it (see Published demo).
