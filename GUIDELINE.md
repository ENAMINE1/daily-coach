# Make your own Daily Coach plan

Daily Coach is a desktop accountability app. Everything it shows comes from one **plan file**: what you're working towards, what each day looks like, the checklist for every task, the habits you count, the heatmaps you see, and how strict the coach sounds.

You don't write the plan by hand. You describe your goal to Claude (or any capable AI), give it this guide, and it writes the file. Then you load it in the app.

---

## 1. The 2-minute version

1. Copy the **prompt in section 2**, fill in the brackets, and paste it into Claude together with this whole file (and, ideally, `app/plan.schema.json`).
2. Save the answer as `my-plan.yaml` (or `.json`).
3. In Daily Coach, go to **History & settings → Your plan → Choose plan file**.
4. If anything is wrong, the app lists the exact problems. Paste them back to the AI and ask it to fix them.

Your progress is kept when you switch plans. Weeks are matched by track id and week number, so keep ids stable when you revise a plan.

---

## 2. The prompt to give an AI

```text
You are helping me create a plan file for the Daily Coach app. Follow GUIDELINE.md exactly
(it is attached below) and output ONE valid YAML document that passes every rule in section 7.

About me:
- Name: [your first name]
- Plan shape: [daily routine / weekly plan / multi-week program]
- Goal(s): [e.g. "get job-ready in backend Java in 6 months" / "run a half marathon" / "learn Spanish to B1"]
- Current level: [what you already know or can do]
- Time per day: [e.g. "2 hours on weekdays, 3 on Saturday, rest on Sunday"]
- Plan length: [e.g. 12 weeks, for programs only]
- Daily habits I want to count: [e.g. "1 LeetCode problem", "8 glasses of water", "20 pages"]
- Resources I like or already own: [books, courses, channels]
- Coach tone: [gentle / balanced / strict]

Requirements:
- For a multi-week program: every week gets a title, a limitQuestion and a 2–6 item checklist,
  and day-by-day subtasks (days.<taskId>) for the main tasks, 2–6 concrete steps each:
  what to read or watch (name the resource), what to do or build, and what to write down.
- For a daily routine or weekly plan: no tracks; put 2–6 concrete subtasks on each task, and use
  weeklyGoals for things that only need to happen a few times a week.
- The minutes on each task must add up to my daily time budget.
- Use stable, lowercase ids. Don't invent fields that the guide doesn't mention.
- If the plan is long, first output tracks with week titles only, and I'll ask for the
  days in batches of 4 weeks.

[Paste GUIDELINE.md here]
```

---

## 3. Pick a plan shape

Most people don't have a six-month program. Daily Coach supports three shapes, and you can mix them:

| Shape | Use it for | What to fill in |
|---|---|---|
| **Daily routine** | The same checklist every day (morning routine, focus block, habits) | `rhythm.daily` (and optionally `weekdays` / `weekend`), `habits` |
| **Weekly plan** | Goals for the week plus a different focus each day | `weeklyGoals`, `rhythm.mon`…`sun`, optional `dates` for one-off tasks |
| **Multi-week program** | A course or training plan that changes week by week | `tracks` (weeks with checklists and day-by-day subtasks) + `rhythm` |

A daily routine (from `examples/daily-routine.yaml`):

```yaml
schemaVersion: 1
meta: { title: "My daily routine", owner: Alex }
rhythm:
  daily:    [{ id: morning, label: Morning routine, minutes: 30, subtasks: ["Water", "10 min stretch", "Top 3 tasks"] }]
  weekdays: [{ id: focus, label: Deep work block, minutes: 90, subtasks: ["Phone away", "90 minutes on task #1"] }]
  weekend:  [{ id: outside, label: Get outside, minutes: 60 }]
habits:
  - { id: water, name: Water, unit: glass, target: 8 }
```

A weekly plan (from `examples/weekly-plan.yaml`):

```yaml
schemaVersion: 1
meta: { title: "Weekly plan", owner: Priya }
weeklyGoals: ["Ship the landing page", "3 gym sessions", "Call home twice"]
rhythm:
  mon: [{ id: work, label: "Landing page: layout", subtasks: ["Sketch sections", "Build hero"] }]
  tue: [{ id: gym, label: Gym, minutes: 60 }]
dates:
  "2026-11-28": [{ id: dentist, label: "Dentist at 4 pm" }]
```

Weekly goals reset every week. Ticking all of them fires the week celebration. For the AI prompt in section 2, just say which shape you want; you can skip the plan-length line for a routine.

---

## 4. How the app reads a plan

```
plan
├── meta          title, your name, optional start date
├── schedule      when the morning check-in pops up, when the evening nudge fires
├── weeklyGoals   a checklist that resets every week (weekly plans)
├── dates         one-off tasks on specific dates
├── tracks[]      optional: long-running areas (e.g. "Backend", "Spanish"), each a list of weeks
│    └── weeks[]  title · limitQuestion · checklist · days (subtasks per task, per day)
├── rhythm        the repeating week: mon..sun → list of tasks
├── habits[]      daily counters (problems solved, pages read, glasses of water)
├── heatmaps[]    365-day graphs fed by tasks or by a habit
├── coach         tone, message lines, which celebration fires when
└── ui            default heatmap animation (page | slide | flip)
```

**What a day looks like:** on, say, Wednesday the app takes `rhythm.daily` + `rhythm.weekdays` + `rhythm.wed` + any `dates` entry for that date, in that order. For each task there, it finds the task's **track**, works out which week of that track you're on (the first week whose checklist isn't complete), and takes that week's subtasks for the task. Ticking every subtask completes the task. Ticking every checklist item of a week completes the week and fires the week celebration.

### The occurrence rule (important)

`days.<taskId>` is a list of subtask lists, **one per time that task appears in the week**, in week order (starting Monday unless `weekStartsOn: sun`).

If `core` appears Mon–Fri, then `days.core` has 5 entries: `[ [Mon steps], [Tue steps], [Wed steps], [Thu steps], [Fri steps] ]`.
If `lift` appears Mon, Wed and Fri, then `days.lift` has 3 entries.

If an entry is missing, the app falls back to the task's own `subtasks` in `rhythm`, and if that's missing too, to the last entry in `days.<taskId>`.

### Templates

`label`, `detail` and `subtasks` text can include placeholders:

| Placeholder | Becomes |
|---|---|
| `{week.title}` | the current week's title for the task's track |
| `{week.number}` | the week number (1-based) |
| `{week.limitQuestion}` | the week's key question |
| `{week.anything}` | any extra text field you add to a week, e.g. `build: "Add login"` → `{week.build}` |
| `{track.name}` | the track's name |
| `{name}` | the person's name |

---

## 5. Field reference

### meta (required)
| Field | Required | Notes |
|---|---|---|
| `title` | yes | Shown under the greeting |
| `owner` | no | First name the coach uses |
| `description` | no | One or two sentences |
| `startDate` | no | `YYYY-MM-DD`. Calendar week 1 starts here. Defaults to install day |
| `weekStartsOn` | no | `mon` (default) or `sun` |

### schedule
`checkinFrom` (default `"05:00"`) and `nudgeAt` (default `"21:00"`), as 24-hour `"HH:MM"`, or `null` to turn either off.

### weeklyGoals
A list of text. A fresh, unticked copy every week (weeks start on `meta.weekStartsOn`).

### dates
Map of `YYYY-MM-DD` → list of tasks (same fields as rhythm tasks). They're added to that day only.

### tracks[] (optional, for multi-week programs)
| Field | Notes |
|---|---|
| `id` | lowercase, starts with a letter, ≤ 32 chars: letters, digits, `-`, `_` |
| `name` | e.g. "Backend" |
| `color` | optional hex colour |
| `weeks[]` | 1–104 weeks. Each: `title` (required), `goal`, `limitQuestion`, `checklist` (list of text), `days` (see the occurrence rule), plus any extra text fields for templates |

### rhythm
Keys: `mon tue wed thu fri sat sun`, plus shortcuts merged into each day: `daily` (every day), `weekdays` (Mon–Fri), `weekend` (Sat–Sun). Leave a day out for a rest day. Each value is a list of tasks:

| Field | Notes |
|---|---|
| `id` | lowercase. Reuse the same id for the same kind of task on different days. Don't repeat an id within one day |
| `label` | short name, e.g. "Core topic" |
| `detail` | one line under the label (templates allowed) |
| `track` | track id. Links the task to that track's weeks and `days` |
| `minutes` | 0–600 |
| `subtasks` | fallback checklist (templates allowed) |

### habits[]
Counters you tap **+1** on, with their own streak and an optional heatmap.

| Field | Default | Notes |
|---|---|---|
| `id`, `name` | | required |
| `unit` | `time` | singular: problem, page, glass, minute |
| `target` | 1 | count that keeps the streak alive |
| `great` | target + 1 | count for a "great day" celebration |
| `logItems` | false | show a box to log names (e.g. problem titles) |
| `itemPlaceholder` | | hint text for that box |
| `checkinQuestion` | | asked in the morning report |
| `nudge` | true | mentioned in the evening nudge if under target |
| `messages.target` / `messages.great` | | celebration text |

### heatmaps[]
Each heatmap counts **either** subtasks completed for some tasks (`tasks: [lift, mobility]`) **or** one habit (`habit: reading`). Each heatmap has its own colour scheme: set `palette` to `ocean` (blue), `grape` (violet), `sunset` (yellow → orange, GitHub's Halloween look), `forest` (GitHub green), `rose` or `teal`, or give 4 hex colours from low to high, e.g. `["#fff3a3", "#ffd23f", "#fb8c00", "#1a1a1a"]`. If you leave it out, heatmaps take the named schemes in order. The colour moves smoothly along the scheme with the share of that day's subtasks done (habits: the share of `great`). `levels`, e.g. `[1, 3, 6, 9]`, is a fallback: its last number counts as a full day when the app can't tell how many subtasks were planned. If you leave out `heatmaps`, you get one "All tasks" map plus one per habit. 3–5 heatmaps works best; they appear as pages you flip through.

### coach
- `tone`: `gentle`, `balanced` or `strict` (a hint for the AI when writing messages).
- `messages`: lists of lines, one picked at random. Groups: `good` (all done yesterday), `ok` (half done), `bad` (little or nothing), `start`, `dayDone`, `nudgeSoft`, `nudgeHard`, `boost`, `scold`, `praise`. `{name}` works here. Any group you leave out uses built-in lines.
- `celebrations`: `weekComplete`, `dayComplete`, `habitTarget`, each one of `fireworks`, `confetti`, `boost`, `message`, `none`.

---

## 6. A minimal valid plan

```yaml
schemaVersion: 1
meta: { title: "Read more", owner: Sam }
tracks:
  - id: books
    name: Books
    weeks:
      - { title: "Atomic Habits", checklist: ["Finish the book", "Write a 5-line summary"] }
rhythm:
  mon: [{ id: read, label: Read, track: books, minutes: 30, subtasks: ["Read 20 pages", "Note 1 idea"] }]
habits:
  - { id: pages, name: Pages, unit: page, target: 20 }
```

See `examples/fitness-and-reading.yaml` for a fuller example, and `app/plan.default.json` for a large one (26 + 24 weeks with day-by-day subtasks).

---

## 7. Rules the app enforces

The app refuses a plan that breaks any of these, and lists every problem:

- `schemaVersion` is `1`; `meta.title` is present.
- There's something to track: rhythm tasks, dates, weeklyGoals or habits.
- Tracks are optional; each one has a unique `id`, a `name` and 1–104 weeks; every week has a `title`.
- `checklist` and `subtasks` are lists of text; `days.<taskId>` is a list of lists of text.
- `rhythm` keys are only `mon`–`sun`, `daily`, `weekdays`, `weekend`; no task id twice on the same day once those are merged; `dates` keys are real dates.
- Every rhythm task has `id` and `label`; `track` must name an existing track; `minutes` is 0–600.
- Habit ids are unique and don't clash with task ids; `target` is a whole number ≥ 1.
- Each heatmap has exactly one of `tasks` or `habit`, pointing at ids that exist; `levels` is 4 ascending whole numbers.
- Times are `"HH:MM"` or `null`; celebrations use the allowed names.

Warnings (the plan still loads): a task with neither `subtasks` nor a `track`; unknown message groups.

---

## 8. What makes a plan actually work

- **Concrete subtasks.** "Read Effective Java items 10–11" beats "study equals". Name the chapter, video or exercise.
- **2–6 subtasks per task.** More than that, and nobody finishes the list.
- **Minutes that fit real life.** If the person has 2 hours, the day's tasks should add up to about 2 hours.
- **A key question every week.** If they can't answer it, the week isn't done.
- **One habit is plenty to start.** Habits are for small daily actions (1 problem, 20 pages). Bigger work belongs in the rhythm.
- **Rest days are fine.** Leave a weekday out of `rhythm`.
- **Long plans in batches.** For 20+ weeks, generate track and week titles first, then the `days` in batches, and merge.

## 9. Updating a plan later

Load the new file the same way. Keep track ids and the order of existing weeks the same, and progress lines up. You can add weeks at the end, rewrite subtasks or change the rhythm at any time. In Claude Code you can also install a plan directly:

```bash
curl -s -X POST http://127.0.0.1:47820/plan --data-binary @my-plan.yaml
```
