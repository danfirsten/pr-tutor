import { useEffect, useRef, useState } from "react";
import type { Thread } from "./api.ts";
import type { AskWhere } from "./askTarget.ts";
import { lineRef } from "./Composer.tsx";
import { SeverityPill } from "./NotesPanel.tsx";
import type { Pending } from "./useAsks.ts";

export type Asking = { where: AskWhere } | { threadId: string };

interface Props {
  threads: Thread[];
  headSha: string;
  asking: Asking | null;
  pending: Pending | null;
  onSend: (question: string) => void;
  onClose: () => void;
  onFollowUp: (threadId: string) => void;
}

export function AskPanel({ threads, headSha, asking, pending, onSend, onClose, onFollowUp }: Props) {
  if (!threads.length && !asking) return null;
  const box = <AskBox busy={!!pending} placeholder={asking && "threadId" in asking ? "Ask a follow-up" : "What does this do? Why is it written this way? Is the concern right?"} onSend={onSend} onClose={onClose} />;
  return (
    <section className="asks" aria-label="Your questions">
      <div className="label">Your questions</div>
      {threads.map((t) => (
        <article key={t.id} className="thread">
          <Where where={t} />
          {t.headSha !== headSha && <p className="muted fine-print">Asked about an older version of this PR.</p>}
          {t.turns.map((turn, i) => (
            <div key={i} className="turn">
              <p className="q">{turn.question}</p>
              {turn.answer && <p className="a">{turn.answer}</p>}
              {turn.error && <p className="error">Couldn't answer: {turn.error}</p>}
            </div>
          ))}
          {pending?.threadId === t.id && <PendingTurn question={pending.question} />}
          {asking && "threadId" in asking && asking.threadId === t.id ? (
            box
          ) : (
            <button className="textbtn" onClick={() => onFollowUp(t.id)}>
              Follow up
            </button>
          )}
        </article>
      ))}
      {asking && "where" in asking && (
        <article className="thread">
          <Where where={asking.where} />
          {pending && !pending.threadId && <PendingTurn question={pending.question} />}
          {box}
        </article>
      )}
    </section>
  );
}

function Where({ where }: { where: AskWhere }) {
  return (
    <div className="concern-head">
      {where.concern && <SeverityPill severity={where.concern.severity} />}
      <span className="mono muted">{lineRef(where)}</span>
      {where.concern && <span className="muted">{where.concern.text}</span>}
    </div>
  );
}

function PendingTurn({ question }: { question: string }) {
  return (
    <div className="turn">
      <p className="q">{question}</p>
      <p className="muted pulse">Claude is thinking</p>
    </div>
  );
}

function AskBox({ busy, placeholder, onSend, onClose }: { busy: boolean; placeholder: string; onSend: (question: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (!busy) box.current?.focus();
  }, [busy]);

  const send = () => {
    if (!text.trim() || busy) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <div className="askbox">
      <textarea
        ref={box}
        rows={3}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
          if (e.key === "Escape" || (e.key === "." && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <div className="row">
        <button className="pill solid" onClick={send} disabled={!text.trim() || busy}>
          <span className="label">{busy ? "Asking…" : "Ask · ⌘↵"}</span>
        </button>
        <button className="pill" onClick={onClose}>
          <span className="label">Close · Esc</span>
        </button>
      </div>
    </div>
  );
}
