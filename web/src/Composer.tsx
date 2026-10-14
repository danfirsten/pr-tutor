import { useEffect, useRef, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { coachComment, type Coaching, type DraftComment, type Label } from "./api.ts";

const LABELS: Array<{ label: Label; hint: string }> = [
  { label: "blocker", hint: "Must change before merging" },
  { label: "suggestion", hint: "Would be better, author decides" },
  { label: "question", hint: "You want to understand something" },
  { label: "nit", hint: "Tiny, optional, taste" },
];

interface Props {
  prRef: PrRef;
  comment: DraftComment;
  onSave: (comment: DraftComment) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function lineRef(c: Pick<DraftComment, "line" | "side" | "start_line">) {
  return `${c.start_line ? `L${c.start_line}–${c.line}` : `L${c.line}`}${c.side === "LEFT" ? " (old)" : ""}`;
}

type CoachState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; coaching: Coaching } | { kind: "error"; message: string };

export function Composer({ prRef, comment, onSave, onCancel, onDelete }: Props) {
  const [body, setBody] = useState(comment.body);
  const [label, setLabel] = useState<Label>(comment.label);
  const [coach, setCoach] = useState<CoachState>({ kind: "idle" });
  const box = useRef<HTMLTextAreaElement>(null);

  const askCoach = () => {
    setCoach({ kind: "busy" });
    coachComment(prRef, { ...comment, body, label }).then(
      (coaching) => setCoach({ kind: "done", coaching }),
      (error: Error) => setCoach({ kind: "error", message: error.message }),
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => box.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  const save = () => body.trim() && onSave({ ...comment, body, label });
  const applyCoaching = (coaching: Coaching) => {
    setBody(coaching.rewrite);
    setLabel(coaching.label);
    setCoach({ kind: "idle" });
    box.current?.focus();
  };

  return (
    <div className="composer card">
      <div className="label">Comment on {lineRef(comment)}</div>
      <div className="chips" role="radiogroup" aria-label="Label">
        {LABELS.map((l, i) => (
          <button key={l.label} role="radio" aria-checked={label === l.label} aria-label={`${l.label}: ${l.hint}`} className={`chip ${label === l.label ? "on" : ""}`} onClick={() => setLabel(l.label)} title={l.hint}>
            {l.label} <span className="key">⌥{i + 1}</span>
          </button>
        ))}
      </div>
      <textarea
        ref={box}
        value={body}
        rows={4}
        placeholder="What did you notice? Say what and why, and suggest a fix if you have one."
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape" || (e.key === "." && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            onCancel();
          }
          if (!e.altKey) return;
          const digit = /^Digit([1-4])$/.exec(e.code);
          const action = digit
            ? () => setLabel(LABELS[Number(digit[1]) - 1].label)
            : {
                KeyC: () => body.trim() && coach.kind !== "busy" && askCoach(),
                KeyU: () => coach.kind === "done" && applyCoaching(coach.coaching),
                KeyK: () => setCoach({ kind: "idle" }),
                KeyD: () => onDelete?.(),
              }[e.code];
          if (!action) return;
          e.preventDefault();
          action();
        }}
      />
      <div className="row">
        <button className="pill solid" onClick={save} disabled={!body.trim()}>
          <span className="label">Save · ⌘↵</span>
        </button>
        <button className="pill" onClick={onCancel}>
          <span className="label">Cancel · Esc or ⌘.</span>
        </button>
        <button className="pill" onClick={askCoach} disabled={!body.trim() || coach.kind === "busy"} title="Claude suggests a clearer, kinder version and explains why">
          <span className="label">{coach.kind === "busy" ? "Coaching…" : "Coach this · ⌥C"}</span>
        </button>
        <span className="spacer" />
        {onDelete && (
          <button className="pill" onClick={onDelete}>
            <span className="label">Delete · ⌥D</span>
          </button>
        )}
      </div>
      {coach.kind === "error" && <p className="error">{coach.message}</p>}
      {coach.kind === "done" && (
        <CoachCard
          coaching={coach.coaching}
          unchanged={coach.coaching.rewrite.trim() === body.trim() && coach.coaching.label === label}
          onUse={() => applyCoaching(coach.coaching)}
          onDismiss={() => {
            setCoach({ kind: "idle" });
            box.current?.focus();
          }}
        />
      )}
    </div>
  );
}

const ACCURACY = { yes: "Holds up", unsure: "Not sure", no: "Doesn't hold up" };

function CoachCard({ coaching, unchanged, onUse, onDismiss }: { coaching: Coaching; unchanged: boolean; onUse: () => void; onDismiss: () => void }) {
  return (
    <div className="coach">
      <div className="row">
        <span className="label">Coach</span>
        <span className={`status ${coaching.accurate === "no" ? "blocker" : coaching.accurate === "unsure" ? "suggestion" : "ok"}`}>
          <span className="dot" />
          {ACCURACY[coaching.accurate]}
        </span>
      </div>
      <p className="muted">{coaching.accuracyNote}</p>
      {unchanged ? (
        <p>Your comment is already good. Nothing to change.</p>
      ) : (
        <>
          <div className="suggested">
            <span className={`status ${coaching.label}`}>
              <span className="dot" />
              {coaching.label}
            </span>
            <p>{coaching.rewrite}</p>
          </div>
          {coaching.tips.length > 0 && (
            <ul>
              {coaching.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="row">
        {!unchanged && (
          <button className="pill solid" onClick={onUse}>
            <span className="label">Use this · ⌥U</span>
          </button>
        )}
        <button className="pill" onClick={onDismiss}>
          <span className="label">{unchanged ? "Close" : "Keep mine"} · ⌥K</span>
        </button>
      </div>
    </div>
  );
}
