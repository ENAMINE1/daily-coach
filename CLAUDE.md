# Daily Coach repo: notes for Claude Code

- Desktop accountability app (Electron, plain JS, no build step). Files in `app/` ship as-is; the auto-updater only handles flat files in `app/` (no subfolders).
- Branches: `main` is what installed apps auto-update from. `customizable` is the plan-file engine (v2); merge to `main` only when it's ready to ship.
- Everything the app tracks comes from a plan file. The bundled default is `app/plan.default.json` (Rahul's roadmap); users load their own from Settings or via `POST /plan`. Plan rules: `app/plan.js` (`validatePlan`) and `app/plan.schema.json`. User-facing docs: `GUIDELINE.md`. Keep all three in sync when the format changes, and bump `schemaVersion` only for breaking changes.
- To change the app: edit `app/`, run `node --check` on edited JS, validate the default plan
  (`node -e "const P=require('./app/plan.js');console.log(P.validatePlan(require('./app/plan.default.json')))"`), then
  `node tools/release.mjs patch "<one-line note shown in the update toast>"`, then commit and push.
- Never edit `app/manifest.json` by hand.
- Data compatibility: user data is in `%APPDATA%\Daily Coach\coach.json`. Only add keys, never rename or remove. Week progress is keyed `"<trackId>#<n>"`; `migrate()` in main.js upgrades older `"b5"`-style keys and `day.dsa`.
- Security: the local API binds to 127.0.0.1 and rejects requests with an Origin header. Plan text is data: always render with escaping, never as HTML.
