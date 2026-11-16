import type { SelectedLineRange } from "@pierre/diffs";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { isNoise } from "../../server/noise.ts";
import { fullFileRows, hunkFor, hunkRows, hunkSize, lineCount, splitHunks, type HunkRow } from "../../server/patch.ts";
import type { FileContentsPair, Pr, PrFile } from "../../server/types.ts";
import { loadFile, loadPr, loadSettings, loadState, loadTakes, prRefFromLocation, saveSettings, saveState, submitTake, type Briefing, type DraftComment, type Take } from "./api.ts";
import { AskPanel, type Asking } from "./AskPanel.tsx";
import { aboutConcern, aboutLines } from "./askTarget.ts";
import { Breadcrumb } from "./Breadcrumb.tsx";
import { BriefingView } from "./BriefingView.tsx";
import { Composer, lineRef } from "./Composer.tsx";
import { commentFromConcern, concernAt } from "./concernComment.ts";
import { DiffPanel, type LineSide } from "./DiffPanel.tsx";
import { HunkStrip } from "./HunkStrip.tsx";
import { KeyHelp } from "./KeyHelp.tsx";
import { MissesView } from "./MissesView.tsx";
import { decodePlace, encodePlace, folderOf, hunkLabel, hunkMarks, nameOf, worstFlag, type HunkMark, type Place, type View } from "./nav.ts";
import { NotesPanel } from "./NotesPanel.tsx";
import { Palette, type PaletteItem } from "./Palette.tsx";
import { PrMap } from "./PrMap.tsx";
import { ReviewView } from "./ReviewView.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { ShellSkeleton } from "./Skeleton.tsx";
import { TakeForm, TakeResult } from "./TakePanel.tsx";
import { useAsks } from "./useAsks.ts";
import { useBriefing } from "./useBriefing.ts";
import { useKeys, type KeyHandlers } from "./useKeys.ts";
import { useNotes } from "./useNotes.ts";
import { useReview } from "./useReview.ts";
import { useStored } from "./useStored.ts";
import { useTheme } from "./theme.ts";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; pr: Pr };
type Target = { path: string; hunkIndex: number; line: number; side: HunkRow["side"] };
type Contents = FileContentsPair | { error: string } | null;

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

  if (state.kind === "loading") return <ShellSkeleton />;
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

function findRow(rows: HunkRow[], line: number, side: HunkRow["side"]) {
  const exact = rows.findIndex((r) => r.line === line && r.side === side);
  return exact >= 0 ? exact : rows.findIndex((r) => r.line === line);
}

const sideOf = (s: LineSide | undefined): HunkRow["side"] => (s === "deletions" ? "LEFT" : "RIGHT");

function useFileContents(pr: Pr, path: string | null, wanted: boolean): Contents {
  const [cache, setCache] = useState<Record<string, Contents>>({});
  useEffect(() => {
    if (!path || !wanted || cache[path]) return;
    loadFile(pr, path).then(
      (contents) => setCache((all) => ({ ...all, [path]: contents })),
      (e: Error) => setCache((all) => ({ ...all, [path]: { error: e.message } })),
    );
  }, [pr, path, wanted, cache]);
  return path ? (cache[path] ?? null) : null;
}

function Review({ pr }: { pr: Pr }) {
  const prKey = `${pr.owner}/${pr.repo}/${pr.branch ?? pr.number}`;
  const { theme, cycle } = useTheme();
  const briefing = useBriefing(pr);
  const [path, setPath] = useState<string | null>(null);
  const [view, setView] = useState<View>("briefing");
  const [takeFirst, setTakeFirst] = useState(false);
  const [takes, setTakes] = useState<Record<string, Take>>({});
  const [comparing, setComparing] = useState<Set<string>>(new Set());
  const review = useReview(pr);
  const [editing, setEditing] = useState<DraftComment | null>(null);
  const asks = useAsks(pr);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [hunkIndex, setHunkIndexRaw] = useState(0);
  const [cursor, setCursor] = useState<{ at: number; anchor: number } | null>(null);
  const [pending, setPending] = useState<{ line: number; side: HunkRow["side"] } | null>(null);
  const [fullFile, setFullFile] = useState(false);
  const [help, setHelp] = useState(false);
  const [palette, setPalette] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [seenList, setSeenList] = useStored<string[]>(`pr-tutor.seen.${prKey}`, []);
  const [folded, setFolded] = useStored<string[]>(`pr-tutor.folded.${prKey}`, []);
  const [sideWidth, setSideWidth] = useStored("pr-tutor.sidebar.width", 280);
  const [sideOpen, setSideOpen] = useStored("pr-tutor.sidebar.open", true);
  const [motion, setMotion] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [resumed, setResumed] = useState<string | null>(null);
  const lastHunk = useRef(new Map<string, number>());
  const jump = useRef(false);
  const gPressed = useRef(0);

  const seen = useMemo(() => new Set(seenList), [seenList]);
  const setHunkIndex = (index: number, quiet = false) => {
    setMotion(quiet || index === hunkIndex ? "" : index > hunkIndex ? "swap-fwd" : "swap-back");
    setHunkIndexRaw(index);
    setCursor(null);
    setAsking(null);
  };
  const jumped = () => {
    jump.current = true;
  };

  const { read, skim } = useMemo(() => orderFiles(pr, briefing.briefing), [pr, briefing.briefing]);
  const ordered = useMemo(() => [...read, ...skim], [read, skim]);
  const hotspots = useMemo(() => new Set(briefing.briefing?.hotspots.map((h) => h.path)), [briefing.briefing]);
  const hunksByPath = useMemo(() => new Map(pr.files.map((f) => [f.path, splitHunks(f.patch)])), [pr]);

  const fileIndex = path === null ? -1 : ordered.findIndex((f) => f.path === path);
  const file = fileIndex === -1 ? null : ordered[fileIndex];
  const hunks = file ? hunksByPath.get(file.path)! : [];
  const notes = useNotes(pr, file?.path ?? null);
  const contents = useFileContents(pr, file?.path ?? null, fullFile);
  const takeKey = file ? `${file.path}#${hunkIndex}` : "";
  const gated = takeFirst && !!file && !fullFile && hunks.length > 0 && !takes[takeKey];
  const concerns = gated ? [] : (notes.notes?.hunks ?? []).filter((h) => fullFile || h.hunkIndex === hunkIndex).flatMap((h) => h.concerns);
  const allComments = useMemo(() => review.draft?.comments ?? [], [review.draft]);

  const marksByPath = useMemo(
    () => new Map(pr.files.map((f) => [f.path, hunkMarks(hunksByPath.get(f.path)!, notes.all[f.path], allComments.filter((c) => c.path === f.path))])),
    [pr, hunksByPath, notes.all, allComments],
  );
  const marks = useCallback((p: string): HunkMark[] => marksByPath.get(p) ?? [], [marksByPath]);
  const hunkSeen = useCallback((p: string, i: number) => seen.has(`${p}#${i}`), [seen]);

  useEffect(() => {
    loadSettings().then((s) => setTakeFirst(!!s.takeFirst), () => {});
    loadTakes(pr).then(setTakes, () => {});
    loadState(pr).then((s) => setReviewed(new Set(s.reviewed)), () => {});
  }, [pr]);

  const rows = useMemo(() => {
    if (!file) return [];
    if (fullFile) return contents && !("error" in contents) ? fullFileRows(hunks, lineCount(contents.new)) : [];
    return hunks[hunkIndex] ? hunkRows(hunks[hunkIndex]) : [];
  }, [file, fullFile, contents, hunks, hunkIndex]);

  useEffect(() => {
    if (!pending || !rows.length) return;
    const at = findRow(rows, pending.line, pending.side);
    if (at >= 0) setCursor({ at, anchor: at });
    setPending(null);
  }, [pending, rows]);

  useEffect(() => {
    if (!file || gated) return;
    const keys = fullFile ? hunks.map((h) => `${file.path}#${h.index}`) : hunks.length ? [`${file.path}#${hunkIndex}`] : [];
    if (keys.some((k) => !seen.has(k))) setSeenList((all) => [...new Set([...all, ...keys])]);
    lastHunk.current.set(file.path, hunkIndex);
  }, [file, hunkIndex, fullFile, gated, hunks, seen, setSeenList]);

  useEffect(() => {
    if (path) setRecent((all) => [path, ...all.filter((p) => p !== path)].slice(0, 6));
  }, [path]);

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

  const fileComments = allComments.filter((c) => c.path === file?.path && c.id !== editing?.id);
  const span = cursor ? [Math.min(cursor.at, cursor.anchor), Math.max(cursor.at, cursor.anchor)] : null;
  const cursorRange: SelectedLineRange | null =
    span && rows[span[1]] ? { start: rows[span[0]].line, side: toSide(rows[span[0]].side), end: rows[span[1]].line, endSide: toSide(rows[span[1]].side) } : null;
  const cursorRow = cursor ? rows[cursor.at] : undefined;

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

  const clickLine = (line: number, side: LineSide, extend: boolean) => {
    const at = findRow(rows, line, sideOf(side));
    if (at < 0) return;
    setCursor((current) => ({ at, anchor: extend && current ? current.anchor : at }));
  };

  const selectRange = (range: SelectedLineRange) => {
    const anchor = findRow(rows, range.start, sideOf(range.side));
    const at = findRow(rows, range.end, sideOf(range.endSide ?? range.side));
    if (anchor >= 0 && at >= 0) setCursor({ at, anchor });
  };

  const commentAtCursor = () => {
    if (!file || !rows.length || gated) return;
    const [a, b] = span ?? Array(2).fill(Math.max(0, rows.findIndex((r) => r.changed)));
    if (!span) setCursor({ at: a, anchor: a });
    setEditing(newComment(file.path, rows[a], rows[b], pr.headSha));
  };

  const adoptConcern = (concern = concernAt(concerns, cursorRow ?? null)) => {
    if (!file || !concern || gated) return;
    const comment = commentFromConcern(concern, file.path, pr.headSha);
    const at = findRow(rows, comment.line, comment.side);
    if (at >= 0) setCursor({ at, anchor: at });
    setEditing(comment);
  };

  const asksHere = asks.threads.filter((t) => t.path === file?.path && (fullFile || hunkFor(hunks, t)?.index === hunkIndex));

  const askAboutLines = () => {
    if (!file || gated || (fullFile && !span)) return;
    const where = aboutLines(file.path, rows, span);
    if (where) setAsking({ where });
  };

  const askAboutConcern = (concern = concernAt(concerns, cursorRow ?? null)) => {
    if (!file || !concern || gated) return;
    setAsking({ where: aboutConcern(file.path, concern) });
  };

  const sendQuestion = async (question: string) => {
    if (!asking) return;
    if ("threadId" in asking) return void asks.ask({ threadId: asking.threadId, question });
    const thread = await asks.ask({ ...asking.where, question });
    if (thread) setAsking({ threadId: thread.id });
  };

  const editAtCursor = () => {
    const inView = fullFile ? fileComments : fileComments.filter((c) => hunkFor(hunks, c)?.index === hunkIndex);
    const atRow = cursorRow && inView.find((c) => c.side === cursorRow.side && (c.start_line ?? c.line) <= cursorRow.line && cursorRow.line <= c.line);
    const target = atRow ?? inView[0];
    if (target) setEditing(target);
  };

  const openAt = (t: Pick<Target, "path" | "line" | "side"> & { hunkIndex?: number }) => {
    const fileHunks = hunksByPath.get(t.path);
    if (!fileHunks) return;
    jumped();
    setEditing(null);
    setAsking(null);
    if (fullFile && t.path === path) return setPending({ line: t.line, side: t.side });
    const hunk = t.hunkIndex !== undefined ? fileHunks[t.hunkIndex] : (hunkFor(fileHunks, t) ?? fileHunks[0]);
    setPath(t.path);
    setFullFile(false);
    setMotion(t.path === path ? (hunk && hunk.index < hunkIndex ? "swap-back" : "swap-fwd") : "");
    setHunkIndexRaw(hunk?.index ?? 0);
    setCursor(null);
    setPending({ line: t.line, side: t.side });
  };
  const openComment = (c: DraftComment) => openAt(c);

  const jumpTo = (targets: Target[], direction: 1 | -1) => {
    const order = (p: string) => ordered.findIndex((f) => f.path === p);
    const keyOf = (fi: number, hi: number, line: number) => fi * 1e9 + hi * 1e6 + line;
    const hereHunk = fullFile && cursorRow && file ? (hunkFor(hunks, cursorRow)?.index ?? hunkIndex) : hunkIndex;
    const here = keyOf(fileIndex, hereHunk, cursorRow ? cursorRow.line : direction === 1 ? -1 : 1e6 - 1);
    const sorted = targets
      .map((t) => ({ t, key: keyOf(order(t.path), t.hunkIndex, t.line) }))
      .filter((x) => x.key >= 0)
      .sort((x, y) => x.key - y.key);
    const next = direction === 1 ? sorted.find((x) => x.key > here) : sorted.findLast((x) => x.key < here);
    if (next) openAt(next.t);
  };

  const commentTargets = (): Target[] => allComments.map((c) => ({ path: c.path, line: c.line, side: c.side, hunkIndex: hunkFor(hunksByPath.get(c.path) ?? [], c)?.index ?? 0 }));
  const concernTargets = (): Target[] =>
    Object.entries(notes.all).flatMap(([p, n]) => n.hunks.flatMap((h) => h.concerns.map((c) => ({ path: p, line: c.line, side: c.side === "old" ? ("LEFT" as const) : ("RIGHT" as const), hunkIndex: h.hunkIndex }))));

  const startComment = (range: SelectedLineRange) => {
    if (!file || gated) return;
    selectRange(range);
    const [first, last] = range.start <= range.end ? [range.start, range.end] : [range.end, range.start];
    setEditing({
      id: crypto.randomUUID(),
      path: file.path,
      line: last,
      side: sideOf(range.endSide ?? range.side),
      ...(first !== last ? { start_line: first, start_side: sideOf(range.side) } : {}),
      label: "suggestion",
      body: "",
      headSha: pr.headSha,
    });
  };

  const goToFile = useCallback(
    (index: number, at: "start" | "end" | "resume" = "start") => {
      const clamped = Math.max(-1, Math.min(ordered.length - 1, index));
      const target = clamped === -1 ? null : ordered[clamped];
      const count = target ? hunksByPath.get(target.path)!.length : 0;
      setPath(target?.path ?? null);
      setEditing(null);
      setCursor(null);
      setAsking(null);
      setMotion("");
      setHunkIndexRaw(!target ? 0 : at === "end" ? Math.max(0, count - 1) : at === "resume" ? Math.min(lastHunk.current.get(target.path) ?? 0, Math.max(0, count - 1)) : 0);
    },
    [ordered, hunksByPath],
  );
  const open = (p: string) => {
    jumped();
    goToFile(ordered.findIndex((f) => f.path === p), "resume");
  };

  const pickHunk = (index: number) => {
    if (!file || index < 0 || index >= hunks.length) return;
    jumped();
    setFullFile(false);
    setHunkIndex(index);
  };

  const nextHunk = (quiet = false) => (hunkIndex < hunks.length - 1 && !fullFile ? setHunkIndex(hunkIndex + 1, quiet) : goToFile(fileIndex + 1));
  const prevHunk = (quiet = false) => (hunkIndex > 0 && !fullFile ? setHunkIndex(hunkIndex - 1, quiet) : goToFile(fileIndex - 1, "end"));

  const toggleFullFile = () => {
    if (!file) return;
    if (cursorRow) setPending({ line: cursorRow.line, side: cursorRow.side });
    if (fullFile && cursorRow) setHunkIndexRaw(hunkFor(hunks, cursorRow)?.index ?? hunkIndex);
    setCursor(null);
    setMotion("");
    setFullFile((v) => !v);
  };

  const toggleReviewed = () => {
    if (!file) return;
    const next = new Set(reviewed);
    if (next.has(file.path)) next.delete(file.path);
    else next.add(file.path);
    setReviewed(next);
    saveState(pr, { reviewed: [...next] }).catch(() => {});
  };

  const showView = (v: View) => {
    jumped();
    goToFile(-1);
    setView(v);
  };

  const applyPlace = useCallback(
    (place: Place) => {
      setEditing(null);
      setAsking(null);
      setCursor(null);
      setMotion("");
      if ("view" in place) {
        setPath(null);
        setView(place.view);
        return;
      }
      const fileHunks = hunksByPath.get(place.path);
      if (!fileHunks) return;
      setPath(place.path);
      setFullFile(!!place.full);
      setHunkIndexRaw(Math.min(place.hunk, Math.max(0, fileHunks.length - 1)));
      setPending(place.line ? { line: place.line, side: place.side ?? "RIGHT" } : null);
    },
    [hunksByPath],
  );

  useEffect(() => {
    const place = decodePlace(new URLSearchParams(location.search).get("at"));
    if (!place) return;
    applyPlace(place);
    if (!("view" in place) && hunksByPath.has(place.path)) setResumed(`${nameOf(place.path)}, ${place.full ? "full file" : `hunk ${place.hunk + 1}`}`);
  }, [applyPlace, hunksByPath]);

  useEffect(() => {
    const onPop = () => {
      const place = decodePlace(new URLSearchParams(location.search).get("at"));
      applyPlace(place ?? { view: "briefing" });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyPlace]);

  useEffect(() => {
    if (!resumed) return;
    const timer = setTimeout(() => setResumed(null), 7000);
    return () => clearTimeout(timer);
  }, [resumed]);

  const place: Place = file ? { path: file.path, hunk: hunkIndex, ...(fullFile ? { full: true } : {}), ...(cursorRow ? { line: cursorRow.line, side: cursorRow.side } : {}) } : { view };
  const placeText = encodePlace(place);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("at") === placeText) return;
    params.set("at", placeText);
    const url = `${location.pathname}?${params.toString().replace(/%2F/g, "/").replace(/%3A/g, ":")}`;
    if (jump.current) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }, [placeText]);
  useEffect(() => {
    jump.current = false;
  });

  const scrollPane = (selector: string, by: number) => document.querySelector(selector)?.scrollBy({ top: by, behavior: "smooth" });
  const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus();
  const cycleVerdict = () => {
    if (pr.branch) return;
    review.update((d) => ({ ...d, event: d.event === "COMMENT" ? "APPROVE" : d.event === "APPROVE" ? "REQUEST_CHANGES" : "COMMENT" }));
  };
  const focusFilter = () => {
    setSideOpen(true);
    setTimeout(() => focus("#file-filter"), 0);
  };

  const digit = (n: number) => () => {
    if (Date.now() - gPressed.current > 1500) return;
    gPressed.current = 0;
    pickHunk(n - 1);
  };

  const keys: KeyHandlers = {
    j: (e) => nextHunk(e.repeat),
    k: (e) => prevHunk(e.repeat),
    n: () => goToFile(fileIndex + 1),
    p: () => goToFile(fileIndex - 1),
    ArrowDown: (e) => (file && rows.length ? moveCursor(1, e.shiftKey) : scrollPane(".main", 80)),
    ArrowUp: (e) => (file && rows.length ? moveCursor(-1, e.shiftKey) : scrollPane(".main", -80)),
    c: commentAtCursor,
    Enter: commentAtCursor,
    e: editAtCursor,
    a: () => adoptConcern(),
    q: askAboutLines,
    Q: () => askAboutConcern(),
    "]": () => jumpTo(commentTargets(), 1),
    "[": () => jumpTo(commentTargets(), -1),
    ".": () => jumpTo(concernTargets(), 1),
    ",": () => jumpTo(concernTargets(), -1),
    g: () => {
      gPressed.current = Date.now();
    },
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), digit(n)])),
    f: toggleFullFile,
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
    "/": focusFilter,
    "\\": () => setSideOpen((v) => !v),
    "?": () => setHelp((v) => !v),
    Escape: () => (help ? setHelp(false) : setCursor(null)),
  };
  useKeys(keys);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "[") {
        e.preventDefault();
        history.back();
      }
      if (e.key === "]") {
        e.preventDefault();
        history.forward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const progress = useCallback(
    (p: string) => {
      const total = hunksByPath.get(p)?.length ?? 0;
      let count = 0;
      for (let i = 0; i < total; i++) if (seen.has(`${p}#${i}`)) count++;
      return { seen: count, total };
    },
    [hunksByPath, seen],
  );

  const paletteItems = (): PaletteItem[] => {
    const fileSub = (f: PrFile) => {
      const { seen: s, total } = progress(f.path);
      return [`${total} hunk${total === 1 ? "" : "s"}`, reviewed.has(f.path) ? "reviewed" : total > 1 ? `${s}/${total} seen` : "", hotspots.has(f.path) ? "core" : ""].filter(Boolean).join(" · ");
    };
    return [
      ...recent.filter((p) => p !== path).map((p) => ({ id: `recent:${p}`, group: "Recent" as const, label: p, run: () => open(p) })),
      ...ordered.map((f) => ({ id: `file:${f.path}`, group: "Files" as const, label: f.path, sub: fileSub(f), hint: `+${f.additions} −${f.deletions}`, flag: worstFlag(marks(f.path)), run: () => open(f.path) })),
      ...ordered.flatMap((f) =>
        (hunksByPath.get(f.path) ?? []).map((h) => {
          const size = hunkSize(h);
          return {
            id: `hunk:${f.path}:${h.index}`,
            group: "Hunks" as const,
            label: hunkLabel(h),
            sub: `${f.path} · hunk ${h.index + 1}`,
            hint: `+${size.additions} −${size.deletions}`,
            flag: marks(f.path)[h.index]?.flag,
            run: () => {
              jumped();
              if (f.path !== path) goToFile(ordered.indexOf(f));
              setFullFile(false);
              setHunkIndexRaw(h.index);
            },
          };
        }),
      ),
      ...Object.entries(notes.all).flatMap(([p, n]) =>
        n.hunks.flatMap((h) =>
          h.concerns.map((c, i) => ({
            id: `concern:${p}:${h.hunkIndex}:${i}`,
            group: "Claude's concerns" as const,
            label: c.text,
            sub: `${nameOf(p)} L${c.line} · ${c.severity.replace("-", " ")}`,
            flag: c.severity === "blocker" || c.severity === "should-fix" ? c.severity : undefined,
            run: () => openAt({ path: p, line: c.line, side: c.side === "old" ? "LEFT" : "RIGHT", hunkIndex: h.hunkIndex }),
          })),
        ),
      ),
      ...allComments.map((c) => ({ id: `comment:${c.id}`, group: "Your comments" as const, label: c.body.slice(0, 120) || "(empty)", sub: `${nameOf(c.path)} ${lineRef(c)} · ${c.label}`, run: () => openComment(c) })),
      { id: "view:briefing", group: "Views" as const, label: "Briefing", hint: "b", run: () => showView("briefing") },
      { id: "view:review", group: "Views" as const, label: "Your review", sub: `${allComments.length} comments`, hint: "r", run: () => showView("review") },
      { id: "view:misses", group: "Views" as const, label: "What you tend to miss", hint: "m", run: () => showView("misses") },
      ...(file
        ? [
            { id: "cmd:full", group: "Commands" as const, label: fullFile ? "Back to hunks" : "Show the full file", hint: "f", run: toggleFullFile },
            { id: "cmd:reviewed", group: "Commands" as const, label: reviewed.has(file.path) ? "Unmark reviewed" : "Mark reviewed", hint: "x", run: toggleReviewed },
          ]
        : []),
      { id: "cmd:take", group: "Commands" as const, label: `Take first ${takeFirst ? "off" : "on"}`, hint: "t", run: toggleTakeFirst },
      { id: "cmd:side", group: "Commands" as const, label: sideOpen ? "Hide the file list" : "Show the file list", hint: "\\", run: () => setSideOpen(!sideOpen) },
      { id: "cmd:theme", group: "Commands" as const, label: `Theme: next after ${theme}`, hint: "T", run: cycle },
      { id: "cmd:keys", group: "Commands" as const, label: "Show every key", hint: "?", run: () => setHelp(true) },
    ];
  };

  const glyph = (p: string) => <NoteGlyph state={notes.status[p]?.state} />;
  const section = file ? (read.includes(file) ? "Read" : "Skim") : null;
  const siblings = file ? ordered.filter((f) => folderOf(f.path) === folderOf(file.path)).map((f) => f.path) : [];

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startW = sideWidth;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => setSideWidth(Math.round(Math.max(200, Math.min(520, startW + ev.clientX - startX))));
    const up = () => {
      document.body.classList.remove("resizing");
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="top-nav">
          <IconButton label={sideOpen ? "Hide the file list · \\" : "Show the file list · \\"} onClick={() => setSideOpen(!sideOpen)}>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </IconButton>
          <IconButton label="Back · ⌘[" onClick={() => history.back()}>
            <path d="M15 18l-6-6 6-6" />
          </IconButton>
          <IconButton label="Forward · ⌘]" onClick={() => history.forward()}>
            <path d="M9 18l6-6-6-6" />
          </IconButton>
        </div>
        <Breadcrumb
          title={pr.title}
          view={view}
          path={file?.path ?? null}
          section={section}
          siblings={siblings}
          hunks={hunks}
          hunkIndex={hunkIndex}
          fullFile={fullFile}
          line={cursorRow ? `L${cursorRow.line}${cursorRow.side === "LEFT" ? " (old)" : ""}` : null}
          onOpen={open}
          onHunk={pickHunk}
        />
        <button className="jump" onClick={() => setPalette(true)} title="Jump to anything · ⌘K">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <span className="jump-text">Jump to…</span>
          <kbd>⌘K</kbd>
        </button>
        <span className="progress" title={`${reviewed.size} of ${pr.files.length} files reviewed`}>
          <span className="ref">
            {reviewed.size}/{pr.files.length}
          </span>
          <span className="progress-bar">
            <span style={{ width: `${pr.files.length ? (reviewed.size / pr.files.length) * 100 : 0}%` }} />
          </span>
        </span>
        {pr.branch ? (
          <span className="ref">local, not pushed</span>
        ) : (
          <a className="ref" href={pr.url} target="_blank" rel="noreferrer" title={`${pr.author} · ${pr.headRef} → ${pr.baseRef}`}>
            #{pr.number} ↗
          </a>
        )}
        <button className={takeFirst ? "pill on" : "pill"} onClick={toggleTakeFirst} title="Write your own take on each hunk before Claude's notes appear · t">
          <span className="label">Take first · {takeFirst ? "on" : "off"}</span>
        </button>
        <button className="pill" onClick={() => setHelp(true)} title="Keyboard shortcuts">
          <span className="label">Keys ?</span>
        </button>
        <button className="pill" onClick={cycle} title="Theme · T">
          <span className="label">{theme}</span>
        </button>
      </header>
      <div className={`body ${file ? "with-notes" : ""} ${sideOpen ? "" : "side-shut"}`} style={{ "--side": `${sideOpen ? sideWidth : 0}px` } as CSSProperties}>
        <div className="side" inert={!sideOpen}>
          <Sidebar
            read={read}
            skim={skim}
            path={path}
            view={view}
            reviewed={reviewed}
            hotspots={hotspots}
            progress={progress}
            flag={(p) => worstFlag(marks(p))}
            glyph={glyph}
            views={[
              { view: "briefing", label: "Briefing", extra: <NoteGlyph state={briefing.state} /> },
              { view: "review", label: "Your review", extra: allComments.length || undefined },
              { view: "misses", label: "What you tend to miss" },
            ]}
            folded={folded}
            onFold={(folder) => setFolded((all) => (all.includes(folder) ? all.filter((f) => f !== folder) : [...all, folder]))}
            onOpen={open}
            onView={showView}
          />
          <div className="resize" onPointerDown={startResize} onDoubleClick={() => setSideWidth(280)} title="Drag to resize · double-click to reset" role="separator" aria-orientation="vertical" />
        </div>
        <main className="main">
          {file ? (
            <>
              <div className="filebar">
                <div className="filebar-path">
                  <div className="path mono">{file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}</div>
                  <div className="label">
                    {fullFile ? "Full file · click a line, then ↓ ↑" : hunks.length ? `Hunk ${hunkIndex + 1} of ${hunks.length}` : file.status}
                    {hunks[hunkIndex] && !fullFile ? ` · ${hunkLabel(hunks[hunkIndex])}` : ""}
                  </div>
                </div>
                <span className="spacer" />
                <button className="pill" onClick={toggleFullFile}>
                  <span className="label">{fullFile ? "Hunks" : "Full file"} · f</span>
                </button>
                <button className={reviewed.has(file.path) ? "pill solid" : "pill"} onClick={toggleReviewed}>
                  <span className="label">{reviewed.has(file.path) ? "Reviewed ✓" : "Mark reviewed"} · x</span>
                </button>
              </div>
              <HunkStrip hunks={hunks} marks={marks(file.path)} current={fullFile ? null : hunkIndex} seen={(i) => hunkSeen(file.path, i)} onPick={pickHunk} />
              <DiffPanel
                file={file}
                hunks={hunks}
                hunkIndex={hunkIndex}
                fullFile={fullFile}
                contents={contents}
                motion={motion}
                theme={theme}
                concerns={concerns}
                comments={fileComments}
                selected={editing ? commentRange(editing) : cursorRange}
                onClickLine={clickLine}
                onSelectRange={selectRange}
                onComment={startComment}
                onEdit={setEditing}
                onUseConcern={adoptConcern}
                onAskConcern={askAboutConcern}
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
                  onDelete={allComments.some((c) => c.id === editing.id) ? () => (review.deleteComment(editing.id), setEditing(null)) : undefined}
                />
              )}
              <div className="nav">
                <button className="pill" onClick={() => prevHunk()}>
                  <span className="label">← Previous · k</span>
                </button>
                <span className="label nav-hint">Click a line to put the cursor there · g 1–9 hunk · . next concern</span>
                <button className="pill" onClick={() => nextHunk()}>
                  <span className="label">Next · j →</span>
                </button>
              </div>
            </>
          ) : view === "misses" ? (
            <MissesView />
          ) : view === "review" && review.draft ? (
            <ReviewView pr={pr} draft={review.draft} saveState={review.saveState} onChange={review.update} onOpen={openComment} />
          ) : (
            <BriefingView pr={pr} result={briefing} onOpen={open} onRetry={briefing.retry} />
          )}
        </main>
        {file && (
          <PrMap
            read={read}
            skim={skim}
            hunksByPath={hunksByPath}
            marks={marks}
            current={{ path: file.path, hunk: fullFile ? null : hunkIndex }}
            seen={hunkSeen}
            reviewed={reviewed}
            onPick={(p, i) => {
              if (p === path && !fullFile) return pickHunk(i);
              jumped();
              if (p !== path) goToFile(ordered.findIndex((f) => f.path === p));
              setFullFile(false);
              setHunkIndexRaw(i);
            }}
          />
        )}
        {file && (
          <NotesPanel
            key={fullFile ? `${file.path}#full` : takeKey}
            state={notes.state}
            notes={notes.notes}
            hunkIndex={hunkIndex}
            fullFile={fullFile}
            onRetry={() => notes.retry(file.path)}
            gate={gated ? <TakeForm key={takeKey} onReveal={reveal} onSkip={() => reveal("(skipped)")} /> : undefined}
            before={
              <>
                {!fullFile && takes[takeKey] && <TakeResult take={takes[takeKey]} pending={comparing.has(takeKey)} />}
                <AskPanel threads={asksHere} headSha={pr.headSha} asking={asking} pending={asks.pending} onSend={sendQuestion} onClose={() => setAsking(null)} onFollowUp={(threadId) => setAsking({ threadId })} />
              </>
            }
          />
        )}
      </div>
      {resumed && (
        <div className="toast" role="status">
          <span>Picked up where you left off: {resumed}</span>
          <button
            className="toast-btn"
            onClick={() => {
              setResumed(null);
              showView("briefing");
            }}
          >
            Start over
          </button>
        </div>
      )}
      {palette && <Palette items={paletteItems()} onClose={() => setPalette(false)} />}
      {help && <KeyHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon" aria-label={label} title={label} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {children}
      </svg>
    </button>
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
