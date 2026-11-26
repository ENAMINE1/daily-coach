# Daily Coach

A desktop accountability app for anyone working through a long plan: a morning check-in, a detailed daily checklist, weekly targets with full-screen fireworks, daily habit counters, GitHub-style 365-day heatmaps, and a local API so Claude Code can cheer you on (or scold you).

Phones already have plenty of habit trackers. Daily Coach lives on the laptop where the work actually happens: it starts with your computer, sits in the tray, and celebrates on top of whatever you're doing.

## Make it yours

Everything the app tracks comes from **one plan file** (YAML or JSON). You don't write it by hand: give [GUIDELINE.md](GUIDELINE.md) to Claude or another AI, describe your goal, and load the file it writes from **History & settings → Your plan**.

- [GUIDELINE.md](GUIDELINE.md): how plans work, plus a copy-paste prompt for an AI
- [app/plan.schema.json](app/plan.schema.json): JSON Schema, so editors and AIs can validate plans
- Plan shapes: a **daily routine** ([example](examples/daily-routine.yaml)), a **weekly plan** with goals that reset each week ([example](examples/weekly-plan.yaml)), or a **multi-week program** ([small](examples/fitness-and-reading.yaml), [large](app/plan.default.json))

## Updates

Installed apps check `app/manifest.json` on `main` at startup and every 4 hours. Newer versions download only the changed files, verify their SHA-256 checksums, back up the old files, swap them in, and restart. User data and plans live in the app's data folder and are never touched.

```bash
node tools/release.mjs patch "One line describing the change"   # or minor / major / x.y.z
git add -A && git commit -m "Release x.y.z" && git push
```

## Tech stack and direction

Today: Electron (one codebase for Windows, macOS and Linux), plain JavaScript with no build step, so the auto-updater can ship individual files. Data is a JSON file per user, and the plan is validated by `app/plan.js`.

Planned, in order:
1. **TypeScript + Vite + a component framework (Svelte or React)** for the renderer, once the number of widgets grows. The updater would then ship the built bundle.
2. **SQLite** (better-sqlite3) instead of one JSON file, for years of history, fast queries and safe concurrent writes.
3. **electron-builder installers with code signing and electron-updater** for Windows, macOS and Linux, so there are no SmartScreen warnings.
4. **Widget registry in the plan** (`ui.widgets`): timers/Pomodoro, notes, charts, reading lists, calendar sync. The plan's `schemaVersion` gates new features.
5. **Sync and accountability partners** (optional and opt-in): share streaks with a friend, a weekly email recap.

## Layout

| Path | What |
|---|---|
| `app/main.js` | Main process: plan engine, storage, tray, overlays, local API, auto-updater |
| `app/plan.js` | Plan parsing (JSON/YAML), validation and defaults |
| `app/renderer.js`, `index.html`, `app.css` | The UI |
| `app/overlay.html` | Full-screen celebrations (fireworks, confetti, boost, scold) |
| `app/SKILL.md` | Claude Code skill, synced to `~/.claude/skills/daily-coach/` on launch |
| `installer/` | Windows install / update / uninstall scripts |
| `tools/release.mjs` | Builds a release manifest |
