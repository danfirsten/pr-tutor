import { useCallback, useEffect, useMemo, useState } from "react";
import { splitHunks } from "../../server/patch.ts";
import type { Pr } from "../../server/types.ts";
import { loadPr, loadState, prRefFromLocation, saveState } from "./api.ts";
import { DiffPanel } from "./DiffPanel.tsx";
import { KeyHelp } from "./KeyHelp.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { useNotes } from "./useNotes.ts";
import { useTheme } from "./theme.ts";
import { useKeys } from "./useKeys.ts";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; pr: Pr };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ref = prRefFromLocation();
    if (!ref) return setState({ kind: "error", message: "No PR in the address. Start pr-tutor from the terminal with a PR link." });
    loadPr(ref).then(
      (pr) => {
        setState({ kind: "ready", pr });
        document.title = `${pr.title} · pr-tutor`;
      },
      (error: Error) => setState({ kind: "error", message: error.message }),
    );
  }, []);

  if (state.kind === "loading") return <p className="center label">Loading pull request</p>;
  if (state.kind === "error") return <p className="center error">{state.message}</p>;
  return <Review pr={state.pr} />;
}

const DESCRIPTION = -1;

function Review({ pr }: { pr: Pr }) {
  const { theme, cycle } = useTheme();
  const [fileIndex, setFileIndex] = useState(DESCRIPTION);
  const [hunkIndex, setHunkIndex] = useState(0);
  const [fullFile, setFullFile] = useState(false);
  const [help, setHelp] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const hunksByFile = useMemo(() => pr.files.map((f) => splitHunks(f.patch)), [pr]);
  const file = fileIndex === DESCRIPTION ? null : pr.files[fileIndex];
  const hunks = fileIndex === DESCRIPTION ? [] : hunksByFile[fileIndex];
  const notes = useNotes(pr, file?.path ?? null);
  const concerns = (notes.notes?.hunks ?? []).filter((h) => fullFile || h.hunkIndex === hunkIndex).flatMap((h) => h.concerns);

  useEffect(() => {
    loadState(pr).then((s) => setReviewed(new Set(s.reviewed)), () => {});
  }, [pr]);

  const goToFile = useCallback(
    (index: number, atEnd = false) => {
      const clamped = Math.max(DESCRIPTION, Math.min(pr.files.length - 1, index));
      setFileIndex(clamped);
      setHunkIndex(atEnd && clamped >= 0 ? Math.max(0, hunksByFile[clamped].length - 1) : 0);
    },
    [pr, hunksByFile],
  );

  const nextHunk = () => (hunkIndex < hunks.length - 1 && !fullFile ? setHunkIndex(hunkIndex + 1) : goToFile(fileIndex + 1));
  const prevHunk = () => (hunkIndex > 0 && !fullFile ? setHunkIndex(hunkIndex - 1) : goToFile(fileIndex - 1, true));

  const toggleReviewed = () => {
    if (!file) return;
    const next = new Set(reviewed);
    if (next.has(file.path)) next.delete(file.path);
    else next.add(file.path);
    setReviewed(next);
    saveState(pr, { reviewed: [...next] }).catch(() => {});
  };

  const keys = useMemo(
    () => ({
      j: nextHunk,
      k: prevHunk,
      n: () => goToFile(fileIndex + 1),
      p: () => goToFile(fileIndex - 1),
      f: () => setFullFile((v) => !v),
      x: toggleReviewed,
      "?": () => setHelp((v) => !v),
      Escape: () => setHelp(false),
    }),
    [fileIndex, hunkIndex, hunks, fullFile, reviewed, goToFile],
  );
  useKeys(keys);

  return (
    <div className="shell">
      <header className="top">
        <h1>{pr.title}</h1>
        <a className="ref" href={pr.url} target="_blank" rel="noreferrer">
          {pr.owner}/{pr.repo}#{pr.number} ↗
        </a>
        <span className="ref branch">
          {pr.author} · {pr.headRef} → {pr.baseRef}
        </span>
        <span className="spacer" />
        <span className="ref">
          {reviewed.size}/{pr.files.length} reviewed
        </span>
        <button className="pill" onClick={() => setHelp(true)} title="Keyboard shortcuts">
          <span className="label">Keys ?</span>
        </button>
        <button className="pill" onClick={cycle} title="Theme">
          <span className="label">Theme · {theme}</span>
        </button>
      </header>
      <div className={file ? "body with-notes" : "body"}>
        <nav className="files" aria-label="Changed files">
          <button className="file" aria-current={fileIndex === DESCRIPTION} onClick={() => goToFile(DESCRIPTION)}>
            <span className="tick" />
            <span className="name">Description</span>
          </button>
          <div className="label">{pr.files.length} files</div>
          {pr.files.map((f, i) => (
            <button key={f.path} className="file" aria-current={i === fileIndex} onClick={() => goToFile(i)} title={f.path}>
              <span className="tick" aria-label={reviewed.has(f.path) ? "reviewed" : "not reviewed"}>
                {reviewed.has(f.path) ? "✓" : "·"}
              </span>
              <span className="name">{f.path}</span>
              <span className="counts">
                <NoteGlyph state={notes.status[f.path]?.state} /> <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
              </span>
            </button>
          ))}
        </nav>
        <main className="main">
          {file ? (
            <>
              <div className="filebar">
                <div>
                  <div className="path mono">{file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}</div>
                  <div className="label">
                    {fullFile ? "Full file" : hunks.length ? `Hunk ${hunkIndex + 1} of ${hunks.length}` : file.status}
                    {hunks[hunkIndex] && !fullFile ? ` · ${hunks[hunkIndex].header.replace(/^@@.*?@@\s*/, "") || "top level"}` : ""}
                  </div>
                </div>
                <span className="spacer" />
                <button className="pill" onClick={() => setFullFile((v) => !v)}>
                  <span className="label">{fullFile ? "Hunks" : "Full file"} · f</span>
                </button>
                <button className={reviewed.has(file.path) ? "pill solid" : "pill"} onClick={toggleReviewed}>
                  <span className="label">{reviewed.has(file.path) ? "Reviewed ✓" : "Mark reviewed"} · x</span>
                </button>
              </div>
              <DiffPanel prRef={pr} file={file} hunks={hunks} hunkIndex={hunkIndex} fullFile={fullFile} theme={theme} concerns={concerns} />
              <div className="nav">
                <button className="pill" onClick={prevHunk}>
                  <span className="label">← Previous · k</span>
                </button>
                <button className="pill" onClick={nextHunk}>
                  <span className="label">Next · j →</span>
                </button>
              </div>
            </>
          ) : (
            <div className="prose">
              <div className="label">Description</div>
              <h2>{pr.title}</h2>
              <pre>{pr.body || "No description."}</pre>
              <p className="hint">
                Press <kbd>j</kbd> to start with the first hunk, or <kbd>?</kbd> for every key.
              </p>
            </div>
          )}
        </main>
        {file && <NotesPanel state={notes.state} notes={notes.notes} hunkIndex={hunkIndex} fullFile={fullFile} onRetry={() => notes.retry(file.path)} />}
      </div>
      {help && <KeyHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function NoteGlyph({ state }: { state: string | undefined }) {
  if (state === "queued" || state === "running") return <span className="glyph pulse" title="Claude is writing notes">◐</span>;
  if (state === "error") return <span className="glyph del" title="Notes failed">!</span>;
  return null;
}
