SHELL := bash
.DEFAULT_GOAL := help

API := api
UI := ui
CARGO ?= cargo
ESP_PYTHON ?= C:/Espressif/python_env/idf5.5_py3.11_env/Scripts/python.exe
# The framework lives in the microcontroller repository, checked out next to this one.
MINIFRAMEWORK ?= ../microcontroller/miniframework

.PHONY: help test test-rust test-web check run web web-dev site demo run-bundle certs firmware flash update demo-local demo-build demo-dev demo-schema

help:
	@printf '%s\n' \
	  'make test        Rust tests (app, gate) and the UI type check + unit tests' \
	  'make check       test + fmt + clippy + production UI builds' \
	  'make run         API on http://127.0.0.1:8090 (state in api/.local/state)' \
	  'make web-dev     the board'"'"'s UI (Club House) on http://localhost:4200, proxying /api to :8090; APP=local for Classic' \
	  'make run-bundle  build the board'"'"'s UI and serve UI + API from :8090' \
	  'make site        build the companion site (ui/dist/companion)' \
	  'make demo        build the companion demo (ui/dist/demo)' \
	  '' \
	  'No board (the API is faked in the browser, data in localStorage; see DEMO.md):' \
	  'make demo-local  build Club House and the prototypes in demo mode and serve them on http://localhost:4300' \
	  'make demo-dev APP=chat   live-reload one UI in demo mode: clubhouse classic chat calendar deck terminal gazette' \
	  'make demo-schema refresh the demo copy of the wire schema (needs make run on :8090)' \
	  '' \
	  'Board (ESP32-S3 N16R8; see DEPLOY.md for which one):' \
	  'make certs       issue party.local from the household CA' \
	  'make firmware    build only; TRANSPORT=http|https|http2 (default http), GATE=1 for the Sprint 0 gate' \
	  'make flash PORT=COMn MAC=xx:..   FIRST INSTALL / REPAVE: erases the whole board' \
	  'make update PORT=COMn MAC=xx:..  app only; refuses unless the board already has our partition table'

test: test-rust test-web

test-rust:
	cd $(API) && $(CARGO) test
	cd $(API) && $(CARGO) test --features gate gate

DEMO_UIS := clubhouse chat calendar deck terminal gazette

test-web:
	cd $(UI) && npx tsc -p projects/local/tsconfig.app.json --noEmit && npx tsc -p projects/companion/tsconfig.app.json --noEmit
	cd $(UI) && for u in $(DEMO_UIS); do npx tsc -p projects/ui-$$u/tsconfig.app.json --noEmit || exit 1; done
	cd $(UI) && npx vitest run

check: test
	cd $(API) && $(CARGO) fmt --check && $(CARGO) clippy --all-targets -- -D warnings
	cd $(API) && $(CARGO) clippy --all-targets --features gate -- -D warnings
	cd $(UI) && npx ng build ui-clubhouse && npx ng build local && npx ng build companion && npx ng build companion --configuration demo

run:
	cd $(API) && $(CARGO) run

web-dev:
	cd $(UI) && npx ng serve $(or $(APP),ui-clubhouse) --port 4200

# The board serves Club House (ui-clubhouse); it includes the Classic app's
# admin, channels, invitation and Mastodon sign-in screens.
BOARD_UI ?= ui-clubhouse
web:
	cd $(UI) && npx ng build $(BOARD_UI)
	node $(MINIFRAMEWORK)/tools/bundle-web.mjs $(UI)/dist/$(BOARD_UI)/browser $(API)/.embuild/web

site:
	cd $(UI) && npx ng build companion

demo:
	cd $(UI) && npx ng build companion --configuration demo

# The local app and the five alternative UIs, each with the fake board
# (party-demo) swapped in, under one origin so they share the data.
# DEMO_BASE is where the bundle will be served, without the leading slash:
# empty locally, microcontroller/party/ on GitHub Pages (.github/workflows/
# pages.yml). No leading slash because Git Bash turns /x/ arguments into
# Windows paths; MSYS_NO_PATHCONV keeps it from doing so to --base-href.
DEMO_BASE ?=
demo-build:
	rm -rf $(UI)/dist/demo-local
	cd $(UI) && MSYS_NO_PATHCONV=1 npx ng build local --configuration demo --base-href "/$(DEMO_BASE)classic/"
	cd $(UI) && for u in $(DEMO_UIS); do MSYS_NO_PATHCONV=1 npx ng build ui-$$u --configuration demo --base-href "/$(DEMO_BASE)$$u/" || exit 1; done
	cp $(UI)/projects/party-demo/landing/index.html $(UI)/dist/demo-local/index.html
	node tools/demo-deep-links.mjs $(UI)/dist/demo-local

demo-local: demo-build
	node tools/serve-demo.mjs 4300

APP_PROJECT = $(if $(filter classic,$(APP)),local,ui-$(APP))
demo-dev:
	@[ -n "$(APP)" ] || { echo 'Pick one: make demo-dev APP=clubhouse (clubhouse classic chat calendar deck terminal gazette)' >&2; exit 2; }
	cd $(UI) && npx ng serve $(APP_PROJECT) --configuration demo

demo-schema:
	node tools/demo-schema.mjs http://127.0.0.1:8090

run-bundle: web
	cd $(API) && $(CARGO) run --features bundled-web

certs:
	bash $(MINIFRAMEWORK)/tools/certs.sh $(API) party

TRANSPORT ?= http
firmware: web
	@case "$(TRANSPORT)" in http|https|http2) ;; *) echo 'TRANSPORT must be http, https or http2' >&2; exit 2;; esac
	features="$(filter-out http,$(TRANSPORT))"; \
	if [ -n "$(GATE)" ]; then features="$${features:+$$features,}gate"; fi; \
	bash tools/build-s3.sh "$$features"

flash:
	@[ -n "$(PORT)" ] && [ -n "$(MAC)" ] || { echo 'Set PORT=COMn and MAC=<the board in DEPLOY.md>.' >&2; exit 2; }
	"$(ESP_PYTHON)" tools/deploy-s3.py --port "$(PORT)" --expected-mac "$(MAC)" --replace

update:
	@[ -n "$(PORT)" ] && [ -n "$(MAC)" ] || { echo 'Set PORT=COMn and MAC=<the board in DEPLOY.md>.' >&2; exit 2; }
	"$(ESP_PYTHON)" tools/deploy-s3.py --port "$(PORT)" --expected-mac "$(MAC)" --update
