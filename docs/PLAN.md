# Build plan: pr-tutor v1

Builds what [SPEC.md](SPEC.md) describes. Seven pull requests, each one usable on its own.

Blast radius: none to map. It's a new repo with no callers, no shared contracts and no other repos. The only outside things it touches are the `gh` and `claude` CLIs, which it calls read-only, plus its own folder at `~/.pr-tutor/`.

## Shape

```
pr-tutor <PR>            CLI: parse the PR ref, start the server, open the browser
  └─ server (Node)       localhost only. Serves the built page and a small JSON API
       ├─ gh             PR metadata, patch, file contents at head SHA
       ├─ claude -p      notes, briefing, coaching, take comparison
       └─ ~/.pr-tutor/   cache, drafts, settings, learning log
  └─ page (React)        briefing, file list, hunk view, notes, comments
skills/pr-tutor-review/      Claude Code skill: look over the draft and post it
```

## Stack and why

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | One language for server and page. Node 23.6+ runs `.ts` directly, so the server needs no build step. |
| Server | `node:http` | Five or six JSON routes, static files and one event stream. A framework would add a dependency for about 40 lines. |
| Page | React 19 + Vite | `@pierre/diffs` ships React components, and Vite gives the build. |
| Diff view | `@pierre/diffs` 1.5.2 (Apache-2.0) | Checked in its type definitions: `parsePatchFiles`, `getSingularPatch`, `lineAnnotations` + `renderAnnotation` (notes beside lines), `enableLineSelection` + `selectedLines` + `onLineClick` (comments on a line or range), Shiki highlighting with registerable light and dark themes. Hunk is built on it. |
| Tests | Vitest | Same config as Vite. |
| GitHub | `gh` CLI via `child_process.execFile` | Reuses the user's login. No token handling. |
| Claude | `claude -p` via `execFile` | Subscription only. See "Calling Claude". |

Considered and dropped for the diff view: `react-diff-view` (MIT, last release March 2026, no highlighting of its own) and hand-rolling Shiki plus our own line model (several hundred lines to get selection and annotations right). `@pierre/diffs` already has both.

Distribution: clone, `npm install` (its `prepare` script builds), then `npm install -g .`. Installing straight from GitHub with `npm install -g github:…` was tried and fails, because npm doesn't install the build tools for a git dependency. No npm publish in v1.

## Calling Claude

One module, `server/claude.ts`, owns every call:

- `execFile("claude", ["-p", prompt, "--output-format", "json", "--json-schema", schema, "--tools", "", "--model", model])`
- The child's environment is a copy of `process.env` with `ANTHROPIC_API_KEY` deleted. `--bare` is never passed.
- It reads `structured_output` from the JSON result. When `is_error` is true and the message mentions authentication or an expired login, it throws a typed `ClaudeLoginError`, which the page shows as "Claude Code isn't signed in. Run `claude` in a terminal and use /login." Observed output from a real run on 2026-10-14: `is_error: true`, `result: "Failed to authenticate. API Error: 401 OAuth access token has expired..."`.
- A queue runs at most 3 calls at once, with a 120-second timeout each.
- The model defaults to `sonnet` to go easy on subscription limits. It can be changed in `~/.pr-tutor/settings.json`.

The prompts are where the teaching lives, so each one is a separate file in `server/prompts/` and easy to tune. The note prompt works through a fixed reviewer's checklist: correctness, edge cases, error handling, tests, naming and readability, security, performance, concurrency, API and contract changes, and design. It reports only the items that apply to the hunk in front of it.

Hunk notes schema, one call per file:

```json
{ "hunks": [ {
    "hunkIndex": 0,
    "summary": "what this hunk does",
    "checks": ["what a senior would look at here"],
    "concerns": [ { "line": 42, "side": "new", "severity": "blocker|should-fix|minor|nit", "text": "...", "why": "..." } ],
    "concept": { "name": "Race condition", "explanation": "..." }
} ] }
```

Each call gets the PR title and body, that file's patch, and the file's full contents at the head SHA (cut at 1,500 lines), so Claude sees the context around each hunk.

## Storage

```
~/.pr-tutor/
  settings.json                 takeFirst, theme, model
  learning-log.jsonl            one line per miss
  reviews/<owner>/<repo>/<n>/
    pr.json                     PR snapshot: metadata, files, patches
    cache/<headSha>/briefing.json
    cache/<headSha>/notes/<path-hash>.json
    takes.json                  your takes and the comparisons
    review.json                 draft in GitHub create-review shape
    review.md                   the same, readable
```

`review.json`:

```json
{ "owner": "...", "repo": "...", "number": 12, "headSha": "...",
  "event": "COMMENT|APPROVE|REQUEST_CHANGES", "body": "summary",
  "comments": [ { "path": "...", "line": 42, "side": "RIGHT", "start_line": 40, "start_side": "RIGHT",
                  "label": "blocker|suggestion|question|nit", "body": "...", "headSha": "..." } ] }
```

Writes are atomic (write to a temp file, then rename), so a crash never leaves half a draft. Comments can only be placed on lines inside the diff, because GitHub rejects review comments anywhere else. The full-file view is read-only for that reason.

## Screens

```
┌ PR title · owner/repo#12 ─────────────────── [Take first ○] [◐] [?] ┐
│ FILES (reading order)  │  src/foo.ts · hunk 2 of 4      │  NOTES       │
│ ✓ src/foo.ts      core │  @@ -40,7 +40,9 @@              │  What it does│
│   src/bar.ts           │   40  const x = …               │  Check       │
│   package-lock   noise │ + 41  if (x >= 0) return;  [+]  │  Concerns    │
│                        │                                 │  Concept     │
│ MISSES  BRIEFING       │  [ f  full file ]               │  [Coach]     │
└──────────────────────────────────────────────────────────────────────┘
```

Keys: `j`/`k` next and previous hunk, `n`/`p` next and previous file, `f` full file, `c` comment on the selected line, `x` mark the file reviewed, `?` cheat sheet. Before slice 2's code, I'll publish this as a clickable Ink & Paper mockup for your OK (the `/design` step).

## Tests (written first for the logic)

| Module | Cases |
|---|---|
| `parsePrRef` | full URL, `owner/repo#n`, URL with `/files` suffix, junk input |
| `splitHunks` | multi-hunk patch, new file, deleted file, binary or no patch, rename only |
| `noiseRules` | lockfiles, `dist/`, `*.min.js`, `__snapshots__`, `*.g.cs`/`*.designer.cs`, generated headers |
| `claude.ts` | env has no API key, no `--bare`, parses `structured_output`, maps 401 to `ClaudeLoginError`, timeout, queue limit of 3 (fake `execFile`) |
| `reviewStore` | atomic write, round trip, `review.md` rendering, a range comment sets `start_line` |
| `learningLog` | append, counts per category, three latest per category |

The page gets checked in the browser pane against a real public PR for every slice, with screenshots in the PR body.

## PR slices

Each slice branches from `main` after the one before it merges. Source line counts exclude tests, prompts and docs.

| # | Branch | What it delivers | Size | Safe alone because |
|---|---|---|---|---|
| 0 | `main` | LICENSE, README stub, the spec and this plan. Creates `main` so PRs have a base. | docs | Docs only |
| 1 | `slice-1-scaffold` | CLI, `gh` loader, server, storage paths, `tokens.css`, theme toggle. The page shows the PR title and file list. | ~350 | Read-only viewer, no Claude |
| 2 | `slice-2-diff-walk` | Hunk view with `@pierre/diffs`, keys, full-file toggle, reviewed ticks saved | ~350 | Still no Claude |
| 3 | `slice-3-notes` | `claude.ts`, notes prompt, background generation, cache by SHA, progress stream, notes panel, retry, login error | ~400 | Notes are additive. Failures leave the diff usable |
| 4 | `slice-4-briefing` | Briefing prompt and screen, reading order and noise flags feed the file list | ~250 | Falls back to GitHub's file order |
| 5 | `slice-5-comments` | Line and range comments, labels, summary and verdict, autosave, `review.json`/`review.md` | ~400 | Writes only under `~/.pr-tutor` |
| 6 | `slice-6-coach-skill` | "Coach this", the `pr-tutor-review` Claude Code skill, README install steps | ~250 | Skill posts only after a yes |
| 7 | `slice-7-take-first` | Take-first toggle, reveal and compare, learning log, misses view, notes prompt reads top misses | ~400 | Off by default |

Added after v1:

| # | Branch | What it delivers | Safe alone because |
|---|---|---|---|
| 8 | `slice-8-keyboard` | Keyboard control for every action | Keys only |
| 9 | `slice-9-local` | `pr-tutor --local`: review an unpushed branch from git, keyed by repo + branch + head SHA, checklist instead of a post | Reads git only; PR mode untouched apart from passing the snapshot to the file reader |

Local reviews reuse `Pr` with `number: 0` and a `branch`, plus `local.dir` so the server can reload the snapshot and read files with `git show`, even when an already-running server opened it. `refLabel` (`owner/repo#n` or `owner/repo@branch`) keys the in-memory caches.

From slice 3 on, you can review each PR with pr-tutor itself. That's good practice, and it's the best test the tool will get.

## Risks

- `claude -p` takes a few seconds to start, so a 30-file PR takes a minute or two to annotate in full. That's why notes generate in the background, beginning with the first files in reading order.
- On Windows, `execFile("claude")` finds `claude.exe` from the native installer but not an npm `.cmd` shim. Slice 3 checks for this and shows a clear message. I can't test on Windows from this Mac, so that gets a manual check on your laptop.
- `@pierre/diffs` renders inside a shadow root, so Ink & Paper reaches it through its CSS variables and a registered theme, not plain CSS. If a token can't be reached that way, I'll flag it in slice 2 rather than hack around it.
- Notes can be wrong. The page says so once, and every concern cites a line, so you can check it yourself.

## Questions before I start

1. Licence: MIT?
2. This repo has no tickets, so the commit-format rule can't take a ticket from the branch. Can the repo's `CLAUDE.md` say branches are `slice-<n>-<slug>` and commits start with `slice-<n>`?
3. Slice 0 is a commit straight to `main`, which is the only way to create the default branch. OK for that one commit?
4. Copilot review on this repo's PRs: yes or no?
