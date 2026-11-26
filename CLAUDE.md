# Daily Coach repo: notes for Claude Code

- This is Rahul's personal accountability app (Electron, plain JS, no build step). Files in `app/` are shipped as-is.
- To change the app: edit files in `app/`, run `node --check` on any edited JS, then release:
  `node tools/release.mjs patch "<one-line note shown to Rahul in the update toast>"` and commit + push to `main`.
  Installed copies auto-update within 4 hours, or instantly via POST http://127.0.0.1:47820/update.
- Never edit `app/manifest.json` by hand; the release script writes it with checksums.
- Data compatibility: user data is in `%APPDATA%\Daily Coach\coach.json` (keys: days, weeks, startDate...). Only add new keys, never rename or remove existing ones.
- Roadmap content lives in `app/data.js` (week titles, limit questions) and `app/daily.js` (per-day subtasks). Keep array lengths: 26 backend weeks × 5 weekdays, 24 AE weeks × 4 days.
- Security: the local API binds to 127.0.0.1 and rejects requests with an Origin header. Keep it that way.
