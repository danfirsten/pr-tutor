---
name: pr-tutor-review
description: Look over, coach and post a pull request review drafted in pr-tutor. Use when the user says "look over my review of owner/repo#123", "check my pr-tutor review", "post my review of …", or points at a folder under ~/.pr-tutor/reviews/. Reads the saved draft, gives mentor-style feedback on every comment, shows exactly what will be posted, and posts it to GitHub as one review only after the user says yes. Also use on "apply my pr-tutor review": when the PR is the user's own, it turns their comments into code changes instead of posting.
---

# pr-tutor review

The user is a developer learning to review code. They wrote a review in pr-tutor, which saved it as a draft. Your job is to be the senior engineer who looks over their shoulder before it goes out: check it, teach, then post it when they say so.

## 1. Find the draft

The draft lives at `~/.pr-tutor/reviews/<owner>/<repo>/<number>/`:

- `review.json` holds the review in GitHub's create-review shape, plus a `label` and the `headSha` each comment was written against
- `review.md` is the same review, readable
- `pr.json` is the PR snapshot the draft was written against

Accept `owner/repo#123` or a PR URL. If the user didn't say which PR, list the folders under `~/.pr-tutor/reviews/` and ask. If there's no `review.json`, or it has no comments and no summary, say so and stop.

## 2. Check it's still current

```bash
gh pr view <number> -R <owner>/<repo> --json state,headRefOid,author,title,url
```

- If the PR is merged or closed, say so and ask whether to continue.
- A comment whose `headSha` differs from the current `headRefOid` was written on an older version. Its line may have moved or gone. List these by file and line. Check each one against the current diff (`gh pr diff <number> -R <owner>/<repo>`), and recommend fixing them in pr-tutor or leaving them out. Never post them silently.
- If the PR's author is the user (`gh api user --jq .login`), this is a **self-review**. Skip steps 4 to 6 and go to step 7. Never post a self-review to GitHub.

## 3. Coach the review

Read the code each comment points at (in the diff, or `gh api repos/<owner>/<repo>/contents/<path>?ref=<headRefOid>` for more context). Then give feedback the way a good mentor would: specific, honest and kind. Lead with what they did well.

For each comment, check:

- **Is it right?** Verify the technical claim against the code. If it's wrong, explain what they missed so they learn from it. This matters most.
- **Is it clear?** Would the author know exactly what to change and why?
- **Is the label right?** A blocker means it must change before merging (a bug, data loss, security, a broken contract). A suggestion means the author decides. A question asks to understand. A nit is tiny and optional.
- **Is the tone good?** It should be about the code, not the person, without "just" or "obviously".

For the review as a whole, check:

- Does the summary say what works and name the one or two things that matter most?
- Does the verdict match the comments? Approving with an open blocker, or requesting changes over nits only, are both mismatches.
- Did they miss anything important? Read the diff yourself. If there's a real problem they didn't raise, mention it as a lesson ("one thing worth learning to spot here…"). Don't add it to their review unless they ask.

Offer concrete rewrites where they help. If they want changes, edit `review.json` for them (keep its shape, keep each comment's `id` and `headSha`), and tell them to reload pr-tutor if it's open. Or they can change it in pr-tutor and ask you again.

## 4. Show exactly what will be posted

Each comment's posted body is its label in bold, then the text, following Conventional Comments: `**nit:** Rename this to …`. Show the final review as it will appear: the verdict, the summary, then each comment with its file, line and posted body. Ask plainly: "Post this to <owner>/<repo>#<number>?" Only an explicit yes counts. Anything else means don't post.

## 5. Post it as one review

Build the payload in a temp file. Use the current head as `commit_id` only when every comment was written against it. Otherwise use the draft's `headSha`, or leave out the stale comments, as agreed in step 2.

```json
{
  "commit_id": "<sha>",
  "event": "COMMENT | APPROVE | REQUEST_CHANGES",
  "body": "<summary>",
  "comments": [
    { "path": "src/a.ts", "line": 42, "side": "RIGHT", "body": "**suggestion:** …" },
    { "path": "src/a.ts", "start_line": 40, "start_side": "RIGHT", "line": 42, "side": "RIGHT", "body": "**blocker:** …" }
  ]
}
```

Leave out `start_line` and `start_side` when a comment covers a single line. Then:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/reviews --method POST --input <payload.json>
```

If GitHub rejects it (usually a line that's no longer in the diff, error 422), show the error, work out which comment caused it, and ask before retrying without it.

## 6. Afterwards

Write `posted.json` next to the draft, holding the review's `id`, `html_url`, the time posted and the `commit_id`. Leave `review.json` where it is. Give the user the review link. Then end with one or two sentences on what they did well and the one habit to focus on next time.

## 7. Self-review: apply it

The user reviewed their own PR to catch problems before anyone else sees it. Treat each comment as a to-do item, not something to post.

- Coach it the same way as step 3, but briefly. If a comment is wrong, say why and leave that code alone.
- Work through blockers first, then suggestions. Answer questions in chat. Fix nits only if they're quick.
- Give a short plan (which comment, which file, what change) and wait for a yes before editing.
- After the edits, run the tests, commit with the repo's commit format and push. Then write `applied.json` next to the draft, listing which comments you fixed, which you skipped and why, and the new head SHA.
- Finish with one line on the habit the review shows. For example: "you caught two missing null checks, so check for them as you write."
