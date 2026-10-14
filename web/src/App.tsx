import { useCallback, useEffect, useMemo, useState } from "react";
import { hunkFor, splitHunks } from "../../server/patch.ts";
import { isNoise } from "../../server/noise.ts";
import type { Pr, PrFile } from "../../server/types.ts";
import type { Briefing } from "./api.ts";
import { BriefingView } from "./BriefingView.tsx";
import { useBriefing } from "./useBriefing.ts";
import type { SelectedLineRange } from "@pierre/diffs";
import type { DraftComment } from "./api.ts";
import { Composer } from "./Composer.tsx";
import { ReviewView } from "./ReviewView.tsx";
import { useReview } from "./useReview.ts";
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

function orderFiles(pr: Pr, briefing: Briefing | undefined) {
  const byPath = new Map(pr.files.map((f) => [f.path, f]));
  if (briefing) {
    return {
      read: briefing.readingOrder.map((r) => byPath.get(r.path)!).filter(Boolean),
      skim: briefing.skim.map((r) => byPath.get(r.path)!).filter(Boolean),
    };
  }
  return { read: pr.files.filter((f) => !isNoise(f.path)), skim: pr.files.filter((f) => isNoise(f.path)) };
}

function Review({ pr }: { pr: Pr }) {
  const { theme, cycle } = useTheme();
  const briefing = useBriefing(pr);
  const [path, setPath] = useState<string | null>(null);
  const [view, setView] = useState<"briefing" | "review">("briefing");
  const review = useReview(pr);
  const [editing, setEditing] = useState<DraftComment | null>(null);
  const [hunkIndex, setHunkIndex] = useState(0);
  const [fullFile, setFullFile] = useState(false);
  const [help, setHelp] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());

  const { read, skim } = useMemo(() => orderFiles(pr, briefing.briefing), [pr, briefing.briefing]);
  const ordered = useMemo(() => [...read, ...skim], [read, skim]);
  const hotspots = new Set(briefing.briefing?.hotspots.map((h) => h.path));
  const hunksByPath = useMemo(() => new Map(pr.files.map((f) => [f.path, splitHunks(f.patch)])), [pr]);

  const fileIndex = path === null ? -1 : ordered.findIndex((f) => f.path === path);
  const file = fileIndex === -1 ? null : ordered[fileIndex];
  const hunks = file ? hunksByPath.get(file.path)! : [];
  const notes = useNotes(pr, file?.path ?? null);
  const concerns = (notes.notes?.hunks ?? []).filter((h) => fullFile || h.hunkIndex === hunkIndex).flatMap((h) => h.concerns);
  const fileComments = (review.draft?.comments ?? []).filter((c) => c.path === file?.path && c.id !== editing?.id);

  const startComment = (range: SelectedLineRange | null) => {
    if (!range || !file) return;
    const side = (s: string | undefined) => (s === "deletions" ? ("LEFT" as const) : ("RIGHT" as const));
    const [first, last] = range.start <= range.end ? [range.start, range.end] : [range.end, range.start];
    setEditing({
      id: crypto.randomUUID(),
      path: file.path,
      line: last,
      side: side(range.endSide ?? range.side),
      ...(first !== last ? { start_line: first, start_side: side(range.side) } : {}),
      label: "suggestion",
      body: "",
      headSha: pr.headSha,
    });
  };

  const openComment = (c: DraftComment) => {
    const fileHunks = hunksByPath.get(c.path);
    if (!fileHunks) return;
    setPath(c.path);
    setFullFile(false);
    setEditing(null);
    setHunkIndex(hunkFor(fileHunks, c)?.index ?? 0);
  };

  useEffect(() => {
    loadState(pr).then((s) => setReviewed(new Set(s.reviewed)), () => {});
  }, [pr]);

  const goToFile = useCallback(
    (index: number, atEnd = false) => {
      const clamped = Math.max(-1, Math.min(ordered.length - 1, index));
      const target = clamped === -1 ? null : ordered[clamped];
      setPath(target?.path ?? null);
      setEditing(null);
      setHunkIndex(atEnd && target ? Math.max(0, hunksByPath.get(target.path)!.length - 1) : 0);
    },
    [ordered, hunksByPath],
  );
  const open = (p: string) => goToFile(ordered.findIndex((f) => f.path === p));

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

  const fileButton = (f: PrFile) => (
    <button key={f.path} className="file" aria-current={f.path === path} onClick={() => open(f.path)} title={f.path}>
      <span className="tick" aria-label={reviewed.has(f.path) ? "reviewed" : "not reviewed"}>
        {reviewed.has(f.path) ? "✓" : "·"}
      </span>
      <span className="name">{f.path}</span>
      <span className="counts">
        {hotspots.has(f.path) && <span className="core">core </span>}
        <NoteGlyph state={notes.status[f.path]?.state} /> <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
      </span>
    </button>
  );

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
          <button className="file" aria-current={path === null && view === "briefing"} onClick={() => (goToFile(-1), setView("briefing"))}>
            <span className="tick" />
            <span className="name">Briefing</span>
            <span className="counts">
              <NoteGlyph state={briefing.state} />
            </span>
          </button>
          <button className="file" aria-current={path === null && view === "review"} onClick={() => (goToFile(-1), setView("review"))}>
            <span className="tick" />
            <span className="name">Your review</span>
            <span className="counts">{review.draft?.comments.length ?? 0}</span>
          </button>
          <div className="label group">Read · {read.length}</div>
          {read.map(fileButton)}
          {skim.length > 0 && <div className="label group">Skim · {skim.length}</div>}
          {skim.map(fileButton)}
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
              <DiffPanel
                prRef={pr}
                file={file}
                hunks={hunks}
                hunkIndex={hunkIndex}
                fullFile={fullFile}
                theme={theme}
                concerns={concerns}
                comments={fileComments}
                selected={editing}
                onSelect={startComment}
                onEdit={setEditing}
              />
              {editing && editing.path === file.path && (
                <Composer
                  key={editing.id}
                  prRef={pr}
                  comment={editing}
                  onSave={(c) => {
                    review.upsertComment(c);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                  onDelete={review.draft?.comments.some((c) => c.id === editing.id) ? () => (review.deleteComment(editing.id), setEditing(null)) : undefined}
                />
              )}
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
            view === "review" && review.draft ? (
              <ReviewView pr={pr} draft={review.draft} saveState={review.saveState} onChange={review.update} onOpen={openComment} />
            ) : (
              <BriefingView pr={pr} result={briefing} onOpen={open} onRetry={briefing.retry} />
            )
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
