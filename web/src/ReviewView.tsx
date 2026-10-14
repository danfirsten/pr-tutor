import type { Pr } from "../../server/types.ts";
import type { Draft, DraftComment } from "./api.ts";
import { lineRef } from "./Composer.tsx";
import { blurOnEscape } from "./useKeys.ts";
import type { SaveState } from "./useReview.ts";

const VERDICTS: Array<{ event: Draft["event"]; label: string; hint: string }> = [
  { event: "COMMENT", label: "Comment", hint: "Feedback without a decision" },
  { event: "APPROVE", label: "Approve", hint: "Good to merge as it is, or after nits" },
  { event: "REQUEST_CHANGES", label: "Request changes", hint: "At least one blocker must be fixed first" },
];

interface Props {
  pr: Pr;
  draft: Draft;
  saveState: SaveState;
  onChange: (change: (d: Draft) => Draft) => void;
  onOpen: (comment: DraftComment) => void;
}

export function ReviewView({ pr, draft, saveState, onChange, onOpen }: Props) {
  const byPath = Map.groupBy(draft.comments, (c) => c.path);
  const blockers = draft.comments.filter((c) => c.label === "blocker").length;
  const stale = draft.comments.filter((c) => c.headSha !== pr.headSha).length;
  const local = Boolean(pr.branch);

  return (
    <div className="prose review">
      <div className="label">Your review · {saveLabel(saveState)}</div>
      <h2>Wrap up</h2>
      <p className="lede">
        {draft.comments.length} comment{draft.comments.length === 1 ? "" : "s"}
        {blockers ? `, ${blockers} blocker${blockers === 1 ? "" : "s"}` : ""}.{" "}
        {local ? "This branch isn't pushed, so nothing gets posted. Treat the comments as a checklist to fix before you open the PR." : "When you're happy, ask Claude Code to look it over and post it."}
      </p>

      {!local && (
        <section>
          <h3>
            Verdict <span className="label">· v to change</span>
          </h3>
          <div className="chips" role="radiogroup" aria-label="Verdict">
            {VERDICTS.map((v) => (
              <button key={v.event} role="radio" aria-checked={draft.event === v.event} className={`chip ${draft.event === v.event ? "on" : ""}`} title={v.hint} onClick={() => onChange((d) => ({ ...d, event: v.event }))}>
                {v.label}
              </button>
            ))}
          </div>
          {draft.event === "APPROVE" && blockers > 0 && <p className="warn-text">You're approving with {blockers} blocker{blockers === 1 ? "" : "s"} open. Usually that means request changes.</p>}
        </section>
      )}

      <section>
        <h3>
          Summary <span className="label">· i to type, Esc to leave</span>
        </h3>
        <textarea
          className="summary"
          rows={5}
          value={draft.body}
          placeholder="Start with what works. Then the one or two things that matter most. Keep it short; the line comments carry the detail."
          onChange={(e) => {
            const body = e.target.value;
            onChange((d) => ({ ...d, body }));
          }}
          onKeyDown={blurOnEscape}
        />
      </section>

      <section>
        <h3>Comments</h3>
        {draft.comments.length === 0 && <p className="muted">None yet. Select a line number in the diff to comment on it.</p>}
        {stale > 0 && <p className="warn-text">{stale} comment{stale === 1 ? " was" : "s were"} written on an older version of this {local ? "branch" : "PR"}. Check they still apply.</p>}
        {[...byPath].map(([path, comments]) => (
          <div key={path} className="comment-group">
            <div className="mono path">{path}</div>
            <ul className="concerns">
              {comments.toSorted((a, b) => a.line - b.line).map((c) => (
                <li key={c.id}>
                  <div className="concern-head">
                    <span className={`status ${c.label}`}>
                      <span className="dot" />
                      {c.label}
                    </span>
                    <button className="link mono" onClick={() => onOpen(c)}>
                      {lineRef(c)}
                    </button>
                  </div>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {local ? (
        <section>
          <h3>Your checklist</h3>
          <p>It's saved as you type. Work through it, commit, and run pr-tutor --local again to check the fixes:</p>
          <pre className="code">~/.pr-tutor/reviews/{pr.owner}/{pr.repo}/local/{encodeURIComponent(pr.branch ?? "")}/review.md</pre>
        </section>
      ) : (
        <section>
          <h3>Hand it to Claude Code</h3>
          <p>Your draft is saved as you type, in a folder Claude Code can read:</p>
          <pre className="code">~/.pr-tutor/reviews/{pr.owner}/{pr.repo}/{pr.number}/review.md</pre>
          <p>In a Claude Code chat, say:</p>
          <pre className="code">
            look over my review of {pr.owner}/{pr.repo}#{pr.number}
          </pre>
        </section>
      )}
    </div>
  );
}

function saveLabel(state: SaveState) {
  return { loading: "loading", saved: "saved", saving: "saving", error: "not saved, check the terminal" }[state];
}
