import { useEffect, useRef, useState } from "react";
import type { DraftComment, Label } from "./api.ts";

const LABELS: Array<{ label: Label; hint: string }> = [
  { label: "blocker", hint: "Must change before merging" },
  { label: "suggestion", hint: "Would be better, author decides" },
  { label: "question", hint: "You want to understand something" },
  { label: "nit", hint: "Tiny, optional, taste" },
];

interface Props {
  comment: DraftComment;
  onSave: (comment: DraftComment) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function lineRef(c: Pick<DraftComment, "line" | "side" | "start_line">) {
  return `${c.start_line ? `L${c.start_line}–${c.line}` : `L${c.line}`}${c.side === "LEFT" ? " (old)" : ""}`;
}

export function Composer({ comment, onSave, onCancel, onDelete }: Props) {
  const [body, setBody] = useState(comment.body);
  const [label, setLabel] = useState<Label>(comment.label);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => box.current?.focus(), []);

  const save = () => body.trim() && onSave({ ...comment, body, label });

  return (
    <div className="composer card">
      <div className="label">Comment on {lineRef(comment)}</div>
      <div className="chips" role="radiogroup" aria-label="Label">
        {LABELS.map((l) => (
          <button key={l.label} role="radio" aria-checked={label === l.label} aria-label={`${l.label}: ${l.hint}`} className={`chip ${label === l.label ? "on" : ""}`} onClick={() => setLabel(l.label)} title={l.hint}>
            {l.label}
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
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="row">
        <button className="pill solid" onClick={save} disabled={!body.trim()}>
          <span className="label">Save · ⌘↵</span>
        </button>
        <button className="pill" onClick={onCancel}>
          <span className="label">Cancel · Esc</span>
        </button>
        <span className="spacer" />
        {onDelete && (
          <button className="pill" onClick={onDelete}>
            <span className="label">Delete</span>
          </button>
        )}
      </div>
    </div>
  );
}
