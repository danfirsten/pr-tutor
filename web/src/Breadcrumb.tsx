import { useEffect, useRef, useState } from "react";
import type { PatchHunk } from "../../server/patch.ts";
import { folderOf, hunkLabel, nameOf, type View } from "./nav.ts";

const VIEW_LABEL: Record<View, string> = { briefing: "Briefing", review: "Your review", misses: "What you tend to miss" };

interface Props {
  title: string;
  view: View;
  path: string | null;
  section: "Read" | "Skim" | null;
  siblings: string[];
  hunks: PatchHunk[];
  hunkIndex: number;
  fullFile: boolean;
  line: string | null;
  onOpen: (path: string) => void;
  onHunk: (index: number) => void;
}

export function Breadcrumb({ title, view, path, section, siblings, hunks, hunkIndex, fullFile, line, onOpen, onHunk }: Props) {
  return (
    <nav className="crumbs" aria-label="Where you are">
      <h1 title={title}>{title}</h1>
      {path === null ? (
        <>
          <span className="sep">›</span>
          <span className="crumb here">{VIEW_LABEL[view]}</span>
        </>
      ) : (
        <>
          {section && (
            <>
              <span className="sep">›</span>
              <span className="crumb plain">{section}</span>
            </>
          )}
          {folderOf(path) && (
            <>
              <span className="sep">›</span>
              <span className="crumb plain folder-crumb" title={folderOf(path)}>
                {folderOf(path)}
              </span>
            </>
          )}
          <span className="sep">›</span>
          <Menu label={nameOf(path)} items={siblings.map((p) => ({ key: p, label: nameOf(p), on: p === path, pick: () => onOpen(p) }))} />
          <span className="sep">›</span>
          {fullFile || hunks.length < 2 ? (
            <span className="crumb plain">{fullFile ? "Full file" : hunks.length ? "1 hunk" : "No diff"}</span>
          ) : (
            <Menu
              label={`Hunk ${hunkIndex + 1} of ${hunks.length}`}
              items={hunks.map((h, i) => ({ key: String(i), label: `${i + 1} · ${hunkLabel(h)}`, on: i === hunkIndex, pick: () => onHunk(i) }))}
            />
          )}
          {line && (
            <>
              <span className="sep">›</span>
              <span className="crumb here">{line}</span>
            </>
          )}
        </>
      )}
    </nav>
  );
}

function Menu({ label, items }: { label: string; items: Array<{ key: string; label: string; on: boolean; pick: () => void }> }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  if (items.length < 2) return <span className="crumb here">{label}</span>;
  return (
    <span className="menu-wrap" ref={box}>
      <button className="crumb here" aria-expanded={open} onClick={() => setOpen((v) => !v)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        {label} ▾
      </button>
      {open && (
        <span className="menu card" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              role="menuitem"
              className={`menu-item ${item.on ? "on" : ""}`}
              onClick={() => {
                setOpen(false);
                item.pick();
              }}
            >
              {item.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
