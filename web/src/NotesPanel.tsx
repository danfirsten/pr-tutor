import type { ReactNode } from "react";
import type { Concern, FileNotes, HunkNote, NoteState } from "./api.ts";

interface Props {
  state: NoteState | undefined;
  notes: FileNotes | undefined;
  hunkIndex: number;
  fullFile: boolean;
  onRetry: () => void;
  gate?: ReactNode;
  before?: ReactNode;
}

export function NotesPanel({ state, notes, hunkIndex, fullFile, onRetry, gate, before }: Props) {
  return (
    <aside className="notes" aria-label="Claude's notes">
      {gate ?? (
        <>
          {before}
          <div className="label">Claude's notes</div>
          <Body state={state} notes={notes} hunkIndex={hunkIndex} fullFile={fullFile} onRetry={onRetry} />
        </>
      )}
      <p className="fine">Notes can be wrong. Check each one against the code before you repeat it.</p>
    </aside>
  );
}

function Body({ state, notes, hunkIndex, fullFile, onRetry }: Omit<Props, "gate" | "before">) {
  if (state?.state === "none") return <p className="muted">No text diff here, so there's nothing to annotate.</p>;
  if (state?.state === "error") {
    return (
      <div className="notice">
        <p className={state.login ? "" : "error"}>{state.error}</p>
        <button className="pill" onClick={onRetry}>
          <span className="label">Retry</span>
        </button>
      </div>
    );
  }
  if (!notes) {
    return <p className="muted pulse">{state?.state === "queued" ? "Waiting for its turn" : "Claude is reading this file"}</p>;
  }
  if (fullFile) {
    const concerns = notes.hunks.flatMap((h) => h.concerns);
    return concerns.length ? <Concerns concerns={concerns} /> : <p className="muted">No concerns in this file. Press f to go back to hunk notes.</p>;
  }
  const note = notes.hunks.find((h) => h.hunkIndex === hunkIndex);
  return note ? <Hunk note={note} /> : <p className="muted">Claude didn't write notes for this hunk.</p>;
}

function Hunk({ note }: { note: HunkNote }) {
  return (
    <>
      <section>
        <h3>What it does</h3>
        <p>{note.summary}</p>
      </section>
      {note.checks.length > 0 && (
        <section>
          <h3>What to check</h3>
          <ul>
            {note.checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3>Concerns</h3>
        {note.concerns.length ? <Concerns concerns={note.concerns} /> : <p className="muted">None found.</p>}
      </section>
      {note.concept && (
        <section className="concept">
          <div className="label">Concept · {note.concept.name}</div>
          <p>{note.concept.explanation}</p>
        </section>
      )}
    </>
  );
}

function Concerns({ concerns }: { concerns: Concern[] }) {
  return (
    <ul className="concerns">
      {concerns.map((c, i) => (
        <li key={i}>
          <div className="concern-head">
            <SeverityPill severity={c.severity} />
            <span className="mono muted">
              {c.side === "old" ? "old " : ""}L{c.line}
            </span>
          </div>
          <p>{c.text}</p>
          <p className="muted">{c.why}</p>
        </li>
      ))}
    </ul>
  );
}

export function SeverityPill({ severity }: { severity: Concern["severity"] }) {
  return (
    <span className={`status ${severity}`}>
      <span className="dot" />
      {severity.replace("-", " ")}
    </span>
  );
}
