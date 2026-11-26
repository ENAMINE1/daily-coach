# Daily Coach

A small Windows tray app that keeps me accountable to my six-month backend + After Effects roadmap: morning check-ins, a detailed daily checklist, weekly targets with full-screen fireworks, a 365-day contribution graph, and a local API that Claude Code uses to cheer me on (or scold me).

## How updates work

Installed apps check `app/manifest.json` on this repo's `main` branch at startup and every 4 hours (or via **Check for updates** in the tray or Settings). If the version is newer, the app downloads only the changed files, verifies every SHA-256 checksum, backs up the old files, swaps them in, and restarts itself. Progress data lives in `%APPDATA%\Daily Coach` and is never touched.

The Claude Code skill (`app/SKILL.md`) is synced to `~/.claude/skills/daily-coach/` on every launch.

## Releasing an update

```bash
# edit files in app/, then:
node tools/release.mjs patch "One line describing the change"   # or minor / major / 1.4.0
git add -A && git commit -m "Release x.y.z" && git push
```

`release.mjs` bumps `app/package.json` and regenerates `app/manifest.json`. Never edit the manifest by hand.

## Layout

| Path | What |
|---|---|
| `app/` | The Electron app files (copied into `resources/app` on install) |
| `app/data.js`, `app/daily.js` | Roadmap weeks and the day-by-day subtasks |
| `app/SKILL.md` | Claude Code skill for talking to the app's local API |
| `installer/` | Install / update / uninstall scripts for Windows |
| `tools/release.mjs` | Builds a release manifest |
