# Spec: pr-tutor v1

**For:** a junior developer who reviews pull requests and wants to learn what a good reviewer looks for. They read a PR one hunk at a time with Claude's notes beside the code, write their own comments, and hand the finished draft to Claude Code to check and post.

## How it's used

```
pr-tutor https://github.com/<owner>/<repo>/pull/<n>
```

This opens a local page in the browser. The reviewer works through the PR there. When they're done they tell Claude Code "look over my review of <owner>/<repo>#<n> and post it", and Claude reads the draft from disk.

## Acceptance criteria

### Loading
- [ ] `pr-tutor <PR URL>` (or `pr-tutor <owner>/<repo>#<n>`) fetches the PR's title, body, base and head SHAs, files and patch through the `gh` CLI, using the user's existing `gh` login. No GitHub token config of its own.
- [ ] It works on any GitHub repo the user can read, public or private. No repo, language or company is hard-coded anywhere.
- [ ] It starts a server on localhost only and opens the page in the default browser.

### Briefing (before the diff)
- [ ] The page opens on a briefing: what the PR is trying to do in plain words, a suggested reading order for the files, and which files are noise (lockfiles, generated code, pure formatting, snapshots) and can be skimmed.
- [ ] The briefing names the two or three places where the real change lives.

### Walking the diff
- [ ] There's a file list on the side, in the suggested order, with a reviewed / not reviewed tick per file.
- [ ] The main view shows one hunk at a time with syntax highlighting. Keyboard keys move to the next and previous hunk and file (`j`/`k`, `n`/`p`, with a key cheat sheet on `?`).
- [ ] The full file is one key away, for context the hunk doesn't show.
- [ ] Beside each hunk Claude's notes appear straight away: what the hunk does, what a senior reviewer would check here, any real concerns (each with a severity), and the concept behind it when there's something worth learning (for example "why this lock matters" or "what a race condition is").
- [ ] Notes cite line numbers from the hunk, so the reviewer can find what Claude is talking about.
- [ ] Notes for a file are generated in the background while the reviewer reads the briefing, with a visible "generating" state per file. A file's notes are cached on disk keyed by head SHA, so reopening the PR doesn't call Claude again.
- [ ] If Claude fails or times out on a file, that file shows an error with a retry button and the rest of the PR stays usable.

### "Your take first" mode
- [ ] A toggle, off by default, remembered between sessions.
- [ ] When it's on, Claude's notes for a hunk stay hidden until the reviewer writes what they think the hunk does and what could go wrong, then presses Reveal.
- [ ] After the reveal, the reviewer's take and Claude's notes sit side by side, with a short line from Claude on what they caught and what they missed.

### Comments
- [ ] The reviewer can click a line (or drag across a range) to write a comment, choosing a label: blocker, suggestion, question or nit.
- [ ] A "coach this" button asks Claude to improve a draft comment: clearer, kinder, the right label, and a suggested fix when it's a blocker. The reviewer accepts, edits or ignores the suggestion; nothing is replaced without their say.
- [ ] The reviewer can write an overall summary and pick a verdict: approve, request changes or comment.
- [ ] Comments, the summary, the verdict and per-file reviewed state are saved to disk as the reviewer types, and survive a page reload or restart.

### Hand-off to Claude Code
- [ ] Each review lives in its own folder outside the reviewed repo, at `~/.pr-tutor/reviews/<owner>/<repo>/<n>/`, so drafts can never be committed to it by accident.
- [ ] That folder holds a `review.json` (machine-readable, in the shape GitHub's create-review API takes: path, line, side, body) and a `review.md` (the same review, readable by a person or Claude).
- [ ] Each comment records the head SHA it was written against, so stale comments can be spotted if the PR moves.
- [ ] The repo ships a Claude Code skill that, on "look over my review of X" or "post my review of X", reads the draft, gives feedback, and posts it to GitHub as one review through `gh api` only after the user says yes. It warns if the PR's head has moved since the comments were written.

### Learning log
- [ ] When "your take first" is used, each miss is tagged with a category (error handling, tests, edge cases, naming, security, performance, readability, design and so on) and appended to `~/.pr-tutor/learning-log.jsonl`.
- [ ] The page has a simple "what you tend to miss" view: counts per category over time, and the three most recent examples of each.
- [ ] The prompt that writes hunk notes is told the reviewer's top missed categories, so notes push harder on those.

### Design: Ink & Paper
- [ ] Every colour, font, radius and spacing value comes from the Ink & Paper tokens, kept as CSS variables in one `tokens.css` file. No other palette or typeface.
- [ ] Geist for interface text and Geist Mono for code, file paths, line numbers, SHAs and labels. The page follows the system light or dark theme and has a manual toggle.
- [ ] Black and white everywhere. The three status colours (`--ok`, `--warn`, `--crit`) appear only where they mean something, and always next to a word or a glyph.
- [ ] Added and removed lines get a faint `--ok` or `--crit` tint behind the line, plus the `+` or `-` in the gutter, so the diff still reads in greyscale.
- [ ] Comment and concern labels are Ink & Paper status pills: blocker uses `--crit`, suggestion uses `--warn`, and question and nit use a neutral `--mute` dot.
- [ ] Syntax highlighting is full colour, with a light and a dark theme that sit well on the Ink & Paper surfaces. It's the one deliberate exception to the black-and-white rule.
- [ ] Layout is file list, diff and notes side by side, using the full window because code needs the width. The briefing and note text are capped at about 68 characters a line. Below 900px the notes stack under the diff.
- [ ] Buttons are pills, cards have a 16px radius, code blocks have a 12px radius, and section labels are mono uppercase in `--mute`. Motion is limited to 200ms hovers and 280ms panel opens, and it switches off with reduced motion.

### Running it
- [ ] Runs on macOS and Windows with Node, `gh` and Claude Code installed.
- [ ] Claude is reached only by running the Claude Code CLI headless (`claude -p ... --output-format json --json-schema ...`) as a child process, so every call runs on the user's Claude subscription login. The app never calls the Anthropic API, never asks for an API key, removes `ANTHROPIC_API_KEY` from the child's environment so a stray key can't switch billing, and never passes `--bare` (which only accepts API keys).
- [ ] Each call has tools switched off, so Claude only reads the diff text it's given and can't touch files.
- [ ] If the CLI isn't logged in or its login has expired, the page says so in plain words and tells the user to run `claude` in a terminal and sign in, rather than showing a raw error.
- [ ] A README covers install, first run, and how the Claude Code skill is installed.

## Out of scope for v1

- A post button inside the page. Claude Code posts, after the user says yes.
- Reading or replying to other people's existing review threads.
- Hosting it anywhere, sharing it with a team, or accounts.
- GitLab, Bitbucket or local branches without a PR.
- Editing code or suggesting commits.
- Running the PR's tests or checking it out.
- Very large PRs: above about 60 files or 3,000 changed lines, notes are generated only for the files the user opens.

## Open decisions

None. Storage location, default mode and the hand-off model were settled in chat.

**Readiness:** ready-for-agent once the user confirms this scope.
