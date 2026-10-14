import { useState } from "react";
import { blurOnEscape } from "./useKeys.ts";
import type { Take } from "./api.ts";

export function TakeForm({ onReveal, onSkip }: { onReveal: (take: string) => void; onSkip: () => void }) {
  const [take, setTake] = useState("");
  return (
    <div className="take">
      <h3>Your take first</h3>
      <p className="muted">
        Before you see Claude's notes, write what this hunk does and what could go wrong. A sentence or two is plenty. Press <kbd>i</kbd> to start typing and <kbd>Esc</kbd> to leave the box.
      </p>
      <textarea
        rows={5}
        value={take}
        placeholder="It changes… so that… I'd check… It could break if…"
        onChange={(e) => setTake(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && take.trim()) onReveal(take);
          if (e.altKey && e.code === "KeyS") {
            e.preventDefault();
            onSkip();
          }
          blurOnEscape(e);
        }}
      />
      <div className="row">
        <button className="pill solid" disabled={!take.trim()} onClick={() => onReveal(take)}>
          <span className="label">Reveal notes · ⌘↵</span>
        </button>
        <button className="textbtn" onClick={onSkip}>
          Skip this hunk · s
        </button>
      </div>
    </div>
  );
}

export function TakeResult({ take, pending }: { take: Take; pending: boolean }) {
  if (take.take === "(skipped)") return null;
  return (
    <section className="take-result">
      <div className="label">Your take</div>
      <blockquote>{take.take}</blockquote>
      {pending && <p className="muted pulse">Comparing with what a senior would see</p>}
      {take.error && <p className="muted">Couldn't compare this time: {take.error}</p>}
      {take.comparison && (
        <>
          <p>{take.comparison.line}</p>
          {take.comparison.caught.length > 0 && (
            <>
              <h3>You caught</h3>
              <ul>
                {take.comparison.caught.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {take.comparison.missed.length > 0 && (
            <>
              <h3>You missed</h3>
              <ul>
                {take.comparison.missed.map((m) => (
                  <li key={m.what}>
                    <span className="status">
                      <span className="dot" />
                      {m.category.replace("-", " ")}
                    </span>{" "}
                    {m.what}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
