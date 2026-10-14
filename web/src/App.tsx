import type { SelectedLineRange } from "@pierre/diffs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isNoise } from "../../server/noise.ts";
import { hunkFor, hunkRows, splitHunks, type HunkRow } from "../../server/patch.ts";
import type { Pr, PrFile } from "../../server/types.ts";
import { loadPr, loadSettings, loadState, loadTakes, prRefFromLocation, saveSettings, saveState, submitTake, type Briefing, type DraftComment, type Take } from "./api.ts";
import { BriefingView } from "./BriefingView.tsx";
import { Composer } from "./Composer.tsx";
import { commentFromConcern, concernAt } from "./concernComment.ts";
import { DiffPanel } from "./DiffPanel.tsx";
import { KeyHelp } from "./KeyHelp.tsx";
import { MissesView } from "./MissesView.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { ReviewView } from "./ReviewView.tsx";
import { TakeForm, TakeResult } from "./TakePanel.tsx";
import { useBriefing } from "./useBriefing.ts";
import { useKeys, type KeyHandlers } from "./useKeys.ts";
import { useNotes } from "./useNotes.ts";
import { useReview } from "./useReview.ts";
import { useTheme } from "./theme.ts";

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
  const [view, setView] = useState<"briefing" | "review" | "misses">("briefing");
  const [takeFirst, setTakeFirst] = useState(false);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [comparing, setComparing] = useState<Set<string>>(new Set());
  const review = useReview(pr);
  const [editing, setEditing] = useState<DraftComment | null>(null);
  const [hunkIndex, setHunkIndexRaw] = useState(0);
  const [cursor, setCursor] = useState<{ at: number; anchor: number } | null>(null);
  const setHunkIndex = (index: number) => {
    setHunkIndexRaw(index);
    setCursor(null);
  };
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
  const takeKey = file ? `${file.path}#${hunkIndex}` : "";
  const gated = takeFirst && !!file && !fullFile && hunks.length > 0 && !takes[takeKey];
  const concerns = gated ? [] : (notes.notes?.hunks ?? []).filter((h) => fullFile || h.hunkIndex === hunkIndex).flatMap((h) => h.concerns);

  useEffect(() => {
    loadSettings().then((s) => setTakeFirst(!!s.takeFirst), () => {});
    loadTakes(pr).then(setTakes, () => {});
  }, [pr]);

  const toggleTakeFirst = () => {
    const next = !takeFirst;
    setTakeFirst(next);
    saveSettings({ takeFirst: next }).catch(() => {});
  };

  const reveal = (text: string) => {
    if (!file) return;
    const key = takeKey;
    const at = { path: file.path, hunkIndex };
    setTakes((all) => ({ ...all, [key]: { ...at, headSha: pr.headSha, take: text, at: new Date().toISOString() } }));
    if (text === "(skipped)") return;
    setComparing((all) => new Set(all).add(key));
    submitTake(pr, at.path, at.hunkIndex, text)
      .then((saved) => setTakes((all) => ({ ...all, [key]: saved })))
      .catch(() => {})
      .finally(() => setComparing((all) => new Set([...all].filter((k) => k !== key))));
  };
  const fileComments = (review.draft?.comments ?? []).filter((c) => c.path === file?.path && c.id !== editing?.id);
  const rows = !fullFile && hunks[hunkIndex] ? hunkRows(hunks[hunkIndex]) : [];
  const span = cursor ? [Math.min(cursor.at, cursor.anchor), Math.max(cursor.at, cursor.anchor)] : null;
  const cursorRange: SelectedLineRange | null = span && rows[span[1]] ? { start: rows[span[0]].line, side: toSide(rows[span[0]].side), end: rows[span[1]].line, endSide: toSide(rows[span[1]].side) } : null;

  const moveCursor = (delta: number, extend: boolean) => {
    if (!rows.length) return;
    setCursor((current) => {
      if (!current) {
        const first = Math.max(0, rows.findIndex((r) => r.changed));
        return { at: first, anchor: first };
      }
      const at = Math.max(0, Math.min(rows.length - 1, current.at + delta));
      return { at, anchor: extend ? current.anchor : at };
    });
  };

  const commentAtCursor = () => {
    if (!file || !rows.length || gated) return;
    const [a, b] = span ?? Array(2).fill(Math.max(0, rows.findIndex((r) => r.changed)));
    if (!span) setCursor({ at: a, anchor: a });
    setEditing(newComment(file.path, rows[a], rows[b], pr.headSha));
  };

  const adoptConcern = (concern = concernAt(concerns, cursor ? rows[cursor.at] : null)) => {
    if (!file || !concern || gated || fullFile) return;
    const comment = commentFromConcern(concern, file.path, pr.headSha);
    const at = rows.findIndex((r) => r.line === comment.line && r.side === comment.side);
    if (at >= 0) setCursor({ at, anchor: at });
    setEditing(comment);
  };

  const editAtCursor = () => {
    const inHunk = fileComments.filter((c) => hunkFor(hunks, c)?.index === hunkIndex);
    const row = cursor ? rows[cursor.at] : null;
    const atRow = row && inHunk.find((c) => c.side === row.side && (c.start_line ?? c.line) <= row.line && row.line <= c.line);
    const target = atRow ?? inHunk[0];
    if (target) setEditing(target);
  };

  const jumpComment = (direction: 1 | -1) => {
    const all = review.draft?.comments ?? [];
    const keyOf = (fi: number, hi: number, line: number) => fi * 1e9 + hi * 1e6 + line;
    const here = keyOf(fileIndex, hunkIndex, cursor ? rows[cursor.at].line : direction === 1 ? -1 : 1e6 - 1);
    const sorted = all
      .map((c) => {
        const fi = ordered.findIndex((f) => f.path === c.path);
        const hi = hunkFor(hunksByPath.get(c.path) ?? [], c)?.index ?? 0;
        return { c, key: keyOf(fi, hi, c.line) };
      })
      .filter((x) => x.key >= 0)
      .sort((x, y) => x.key - y.key);
    const next = direction === 1 ? sorted.find((x) => x.key > here) : sorted.findLast((x) => x.key < here);
    if (next) openComment(next.c);
  };

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
    const hunk = hunkFor(fileHunks, c) ?? fileHunks[0];
    setPath(c.path);
    setFullFile(false);
    setEditing(null);
    setHunkIndex(hunk?.index ?? 0);
    const at = hunk ? hunkRows(hunk).findIndex((r) => r.side === c.side && r.line === c.line) : -1;
    if (at >= 0) setCursor({ at, anchor: at });
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
      setCursor(null);
      setHunkIndexRaw(atEnd && target ? Math.max(0, hunksByPath.get(target.path)!.length - 1) : 0);
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

  const showView = (v: typeof view) => {
    goToFile(-1);
    setView(v);
  };
  const scrollPane = (selector: string, by: number) => document.querySelector(selector)?.scrollBy({ top: by, behavior: "smooth" });
  const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
  const cycleVerdict = () => {
    if (pr.branch) return;
    review.update((d) => ({ ...d, event: d.event === "COMMENT" ? "APPROVE" : d.event === "APPROVE" ? "REQUEST_CHANGES" : "COMMENT" }));
  };

  const keys: KeyHandlers = {
    j: nextHunk,
    k: prevHunk,
    n: () => goToFile(fileIndex + 1),
    p: () => goToFile(fileIndex - 1),
    ArrowDown: (e) => (file && !fullFile ? moveCursor(1, e.shiftKey) : scrollPane(".main", 80)),
    ArrowUp: (e) => (file && !fullFile ? moveCursor(-1, e.shiftKey) : scrollPane(".main", -80)),
    c: commentAtCursor,
    Enter: commentAtCursor,
    e: editAtCursor,
    a: () => adoptConcern(),
    "]": () => jumpComment(1),
    "[": () => jumpComment(-1),
    f: () => file && setFullFile((v) => !v),
    x: toggleReviewed,
    t: toggleTakeFirst,
    i: () => (gated ? focus(".take textarea") : view === "review" && !file ? focus("textarea.summary") : undefined),
    s: () => gated && reveal("(skipped)"),
    v: () => view === "review" && !file && cycleVerdict(),
    b: () => showView("briefing"),
    r: () => showView("review"),
    m: () => showView("misses"),
    R: () => (file ? notes.retry(file.path) : briefing.retry()),
    T: cycle,
    J: () => scrollPane(file ? ".notes" : ".main", 240),
    K: () => scrollPane(file ? ".notes" : ".main", -240),
    "?": () => setHelp((v) => !v),
    Escape: () => (help ? setHelp(false) : setCursor(null)),
  };
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
        {pr.branch ? (
          <span className="ref">{pr.owner}/{pr.repo} · local, not pushed</span>
        ) : (
          <a className="ref" href={pr.url} target="_blank" rel="noreferrer">
            {pr.owner}/{pr.repo}#{pr.number} ↗
          </a>
        )}
        <span className="ref branch">
          {pr.author} · {pr.headRef} → {pr.baseRef}
        </span>
        <span className="spacer" />
        <span className="ref">
          {reviewed.size}/{pr.files.length} reviewed
        </span>
        <button className={takeFirst ? "pill on" : "pill"} onClick={toggleTakeFirst} title="Write your own take on each hunk before Claude's notes appear">
          <span className="label">Take first · {takeFirst ? "on" : "off"}</span>
        </button>
        <button className="pill" onClick={() => setHelp(true)} title="Keyboard shortcuts">
          <span className="label">Keys ?</span>
        </button>
        <button className="pill" onClick={cycle} title="Theme">
          <span className="label">Theme · {theme}</span>
        </button>
      </header>
      <div className={file ? "body with-notes" : "body"}>
        <nav className="files" aria-label="Changed files">
          <button className="file" aria-current={path === null && view === "briefing"} onClick={() => showView("briefing")}>
            <span className="tick" />
            <span className="name">Briefing</span>
            <span className="counts">
              <NoteGlyph state={briefing.state} />
            </span>
          </button>
          <button className="file" aria-current={path === null && view === "review"} onClick={() => showView("review")}>
            <span className="tick" />
            <span className="name">Your review</span>
            <span className="counts">{review.draft?.comments.length ?? 0}</span>
          </button>
          <button className="file" aria-current={path === null && view === "misses"} onClick={() => showView("misses")}>
            <span className="tick" />
            <span className="name">What you tend to miss</span>
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
                selected={editing ? commentRange(editing) : cursorRange}
                onSelect={startComment}
                onEdit={setEditing}
                onUseConcern={adoptConcern}
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
            view === "misses" ? (
              <MissesView />
            ) : view === "review" && review.draft ? (
              <ReviewView pr={pr} draft={review.draft} saveState={review.saveState} onChange={review.update} onOpen={openComment} />
            ) : (
              <BriefingView pr={pr} result={briefing} onOpen={open} onRetry={briefing.retry} />
            )
          )}
        </main>
        {file && (
          <NotesPanel
            state={notes.state}
            notes={notes.notes}
            hunkIndex={hunkIndex}
            fullFile={fullFile}
            onRetry={() => notes.retry(file.path)}
            gate={gated ? <TakeForm key={takeKey} onReveal={reveal} onSkip={() => reveal("(skipped)")} /> : undefined}
            before={!fullFile && takes[takeKey] ? <TakeResult take={takes[takeKey]} pending={comparing.has(takeKey)} /> : undefined}
          />
        )}
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

const toSide = (side: HunkRow["side"]) => (side === "LEFT" ? ("deletions" as const) : ("additions" as const));

function commentRange(c: DraftComment): SelectedLineRange {
  return c.start_line
    ? { start: c.start_line, side: toSide(c.start_side ?? c.side), end: c.line, endSide: toSide(c.side) }
    : { start: c.line, side: toSide(c.side), end: c.line };
}

function newComment(path: string, first: HunkRow, last: HunkRow, headSha: string): DraftComment {
  return {
    id: crypto.randomUUID(),
    path,
    line: last.line,
    side: last.side,
    ...(first !== last ? { start_line: first.line, start_side: first.side } : {}),
    label: "suggestion",
    body: "",
    headSha,
  };
}
