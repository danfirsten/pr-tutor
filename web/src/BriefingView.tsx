import type { Pr } from "../../server/types.ts";
import type { BriefingResult } from "./api.ts";

interface Props {
  pr: Pr;
  result: BriefingResult;
  onOpen: (path: string) => void;
  onRetry: () => void;
}

export function BriefingView({ pr, result, onOpen, onRetry }: Props) {
  const b = result.briefing;
  return (
    <div className="prose briefing">
      <div className="label">Briefing</div>
      <h2>{pr.title}</h2>

      {result.state === "error" && (
        <div className="notice">
          <p className={result.login ? "" : "error"}>{result.error}</p>
          <button className="pill" onClick={onRetry}>
            <span className="label">Retry</span>
          </button>
        </div>
      )}
      {!b && result.state !== "error" && <p className="lede muted pulse">Claude is reading the whole PR to give you the map.</p>}

      {b && (
        <>
          <p className="lede">{b.purpose}</p>
          <section>
            <h3>How it works</h3>
            <p>{b.approach}</p>
          </section>
          {b.hotspots.length > 0 && (
            <section>
              <h3>Where the real change is</h3>
              <ul className="paths">
                {b.hotspots.map((h) => (
                  <PathItem key={h.path} path={h.path} why={h.why} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3>Reading order</h3>
            <ol className="paths">
              {b.readingOrder.map((r) => (
                <PathItem key={r.path} path={r.path} why={r.why} onOpen={onOpen} />
              ))}
            </ol>
          </section>
          {b.skim.length > 0 && (
            <section>
              <h3>Safe to skim</h3>
              <ul className="paths">
                {b.skim.map((s) => (
                  <PathItem key={s.path} path={s.path} why={s.why} onOpen={onOpen} />
                ))}
              </ul>
            </section>
          )}
          {b.questions.length > 0 && (
            <section>
              <h3>Questions you could ask the author</h3>
              <ul>
                {b.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <section>
        <h3>The author's description</h3>
        <pre>{pr.body || "No description."}</pre>
      </section>
      <p className="hint">
        Press <kbd>j</kbd> to start with the first hunk, <kbd>↓</kbd> to move through its lines, <kbd>c</kbd> to comment, or <kbd>?</kbd> for every key.
      </p>
    </div>
  );
}

function PathItem({ path, why, onOpen }: { path: string; why: string; onOpen: (path: string) => void }) {
  return (
    <li>
      <button className="link mono" onClick={() => onOpen(path)}>
        {path}
      </button>
      {why && <span className="muted"> · {why}</span>}
    </li>
  );
}
