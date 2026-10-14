# pr-tutor

Local web app for learning to review GitHub PRs. Spec: `docs/SPEC.md`. Plan: `docs/PLAN.md`.

- Keep it generic. Never name an employer, company product or private repo anywhere in code, docs, prompts, tests or fixtures.
- Claude is called only through `server/claude.ts`, which runs `claude -p` with `ANTHROPIC_API_KEY` removed. Never call the Anthropic API, never pass `--bare`.
- GitHub is read only through the `gh` CLI. The app never posts; the `pr-tutor-review` skill does, after the user says yes.
- Every colour, font and radius comes from `web/src/tokens.css` (Ink & Paper). Syntax highlighting is the one place colour is free.
- Branches are `slice-<n>-<slug>`; commit messages start with `slice-<n>`. PRs are squash-merged.
- `npm test` runs Vitest. `npm run check` type-checks.
