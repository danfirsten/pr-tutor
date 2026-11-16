import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PrFile } from "../../server/types.ts";
import { fuzzyScore, groupConsecutive, nameOf, type Flag, type View } from "./nav.ts";

type Show = "all" | "todo" | "flagged";
const SHOWS: Array<{ id: Show; label: string }> = [
  { id: "all", label: "All" },
  { id: "todo", label: "Not reviewed" },
  { id: "flagged", label: "Has concerns" },
];

interface Props {
  read: PrFile[];
  skim: PrFile[];
  path: string | null;
  view: View;
  reviewed: Set<string>;
  hotspots: Set<string>;
  progress: (path: string) => { seen: number; total: number };
  flag: (path: string) => Flag | undefined;
  glyph: (path: string) => ReactNode;
  views: Array<{ view: View; label: string; extra?: ReactNode }>;
  folded: string[];
  onFold: (folder: string) => void;
  onOpen: (path: string) => void;
  onView: (view: View) => void;
}

export function Sidebar({ read, skim, path, view, reviewed, hotspots, progress, flag, glyph, views, folded, onFold, onOpen, onView }: Props) {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const nav = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  const keep = (f: PrFile) => fuzzyScore(query, f.path) !== null && (show === "all" || (show === "todo" ? !reviewed.has(f.path) : !!flag(f.path)));
  const sections = [
    { label: "Read", files: read.filter(keep), all: read.length },
    { label: "Skim", files: skim.filter(keep), all: skim.length },
  ].filter((s) => s.all > 0);
  const matches = sections.flatMap((s) => s.files);

  const measure = () => {
    const active = nav.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const next = active ? { top: active.offsetTop, height: active.offsetHeight } : null;
    setMarker((prev) => (prev?.top === next?.top && prev?.height === next?.height ? prev : next));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const observer = new ResizeObserver(() => measure());
    if (nav.current) observer.observe(nav.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  const row = (f: PrFile) => {
    const { seen, total } = progress(f.path);
    const done = reviewed.has(f.path);
    const at = query ? nameOf(f.path).toLowerCase().indexOf(query.toLowerCase()) : -1;
    const name = nameOf(f.path);
    return (
      <button key={f.path} className="file" aria-current={f.path === path} onClick={() => onOpen(f.path)} title={f.path}>
        <span className={`tick ${done ? "done" : ""}`} aria-label={done ? "reviewed" : "not reviewed"}>
          {done ? "✓" : "·"}
        </span>
        <span className="name">
          {at >= 0 ? (
            <>
              {name.slice(0, at)}
              <mark>{name.slice(at, at + query.length)}</mark>
              {name.slice(at + query.length)}
            </>
          ) : (
            name
          )}
        </span>
        <span className="counts">
          {hotspots.has(f.path) && <span className="core">core</span>}
          {glyph(f.path)}
          {flag(f.path) && <span className={`dot ${flag(f.path)}`} aria-label={flag(f.path)} />}
          {total > 1 ? (
            <span className="minibar" title={`${seen} of ${total} hunks seen`}>
              <span style={{ width: `${done ? 100 : (seen / total) * 100}%` }} />
            </span>
          ) : (
            <span className="add">+{f.additions}</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <nav className="files" aria-label="Changed files" ref={nav}>
      {marker && <span className="marker" style={{ transform: `translateY(${marker.top}px)`, height: marker.height }} />}
      <div className="filter">
        <label className="search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id="file-filter"
            aria-label="Filter files"
            placeholder="Filter files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
              if (e.key === "Enter" && matches[0]) {
                onOpen(matches[0].path);
                e.currentTarget.blur();
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                nav.current?.querySelector<HTMLElement>(".group-files .file")?.focus();
              }
            }}
          />
          <kbd>/</kbd>
        </label>
        <div className="chips">
          {SHOWS.map((s) => (
            <button key={s.id} className={`chip ${show === s.id ? "on" : ""}`} onClick={() => setShow(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {views.map((v) => (
        <button key={v.view} className="file view" aria-current={path === null && view === v.view} onClick={() => onView(v.view)}>
          <span className="tick" />
          <span className="name">{v.label}</span>
          <span className="counts">{v.extra}</span>
        </button>
      ))}
      {sections.map((s) => (
        <div key={s.label} className={`section ${s.label === "Skim" ? "skim" : ""}`}>
          <div className="label group">
            {s.label} · {s.files.length === s.all ? s.all : `${s.files.length} of ${s.all}`}
          </div>
          {groupConsecutive(s.files).map((g, i) => {
            const shut = folded.includes(g.folder) && !query;
            return (
              <div key={`${g.folder}-${i}`} className="group-files">
                {g.folder && (
                  <button className="folder" onClick={() => onFold(g.folder)} aria-expanded={!shut}>
                    <span className={`chev ${shut ? "shut" : ""}`}>▾</span>
                    <span className="name">{g.folder}</span>
                    <span>{g.files.length}</span>
                  </button>
                )}
                {!shut && g.files.map(row)}
              </div>
            );
          })}
        </div>
      ))}
      {matches.length === 0 && <p className="empty muted filter-empty">No files match.</p>}
    </nav>
  );
}
