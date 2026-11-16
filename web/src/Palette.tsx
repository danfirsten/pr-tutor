import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore, type Flag } from "./nav.ts";

export type Group = "Recent" | "Files" | "Hunks" | "Claude's concerns" | "Your comments" | "Views" | "Commands";

export interface PaletteItem {
  id: string;
  group: Group;
  label: string;
  sub?: string;
  hint?: string;
  flag?: Flag;
  run: () => void;
}

const SCOPES: Array<{ prefix: string; group: Group; label: string }> = [
  { prefix: "@", group: "Files", label: "Files" },
  { prefix: "#", group: "Hunks", label: "Hunks" },
  { prefix: "!", group: "Claude's concerns", label: "Concerns" },
  { prefix: '"', group: "Your comments", label: "Comments" },
  { prefix: ">", group: "Commands", label: "Commands" },
];
const ORDER: Group[] = ["Recent", "Files", "Hunks", "Claude's concerns", "Your comments", "Views", "Commands"];

export function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const scope = SCOPES.find((s) => query.startsWith(s.prefix));
  const text = scope ? query.slice(1) : query;

  const hits = useMemo(() => {
    if (!scope && !text) return items.filter((i) => i.group === "Recent" || i.group === "Views");
    return items
      .filter((i) => i.group !== "Recent" && (scope ? i.group === scope.group : i.group !== "Commands"))
      .map((item) => ({ item, score: fuzzyScore(text, `${item.label} ${item.sub ?? ""}`) }))
      .filter((x): x is { item: PaletteItem; score: number } => x.score !== null)
      .sort((a, b) => ORDER.indexOf(a.item.group) - ORDER.indexOf(b.item.group) || b.score - a.score)
      .slice(0, 60)
      .map((x) => x.item);
  }, [items, scope, text]);

  const at = Math.min(selected, Math.max(0, hits.length - 1));
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  return (
    <div className="overlay palette-overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-label="Jump to" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            autoFocus
            aria-label="Jump to"
            placeholder="Jump to a file, hunk, concern or comment. > runs a command"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setSelected(Math.min(hits.length - 1, at + 1));
              else if (e.key === "ArrowUp") setSelected(Math.max(0, at - 1));
              else if (e.key === "Enter") choose(hits[at]);
              else if (e.key === "Escape" || ((e.metaKey || e.ctrlKey) && e.key === "k")) onClose();
              else return;
              e.preventDefault();
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="chips palette-scopes">
          {SCOPES.map((s) => (
            <button key={s.prefix} className={`chip ${scope === s ? "on" : ""}`} onClick={() => setQuery(scope === s ? text : s.prefix + text)}>
              {s.label} <span className="key">{s.prefix}</span>
            </button>
          ))}
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {hits.map((item, i) => (
            <div key={item.id}>
              {(i === 0 || hits[i - 1].group !== item.group) && <div className="label palette-group">{item.group}</div>}
              <button role="option" aria-selected={i === at} className="palette-row" onMouseMove={() => i !== at && setSelected(i)} onClick={() => choose(item)}>
                <span className={`dot ${item.flag ?? ""}`} />
                <span className="palette-text">
                  <span className="palette-label">{item.label}</span>
                  {item.sub && <span className="palette-sub">{item.sub}</span>}
                </span>
                {item.hint && <span className="label">{item.hint}</span>}
              </button>
            </div>
          ))}
          {hits.length === 0 && <p className="muted palette-empty">Nothing matches. Try part of a path, a function name or a word from a concern.</p>}
        </div>
        <div className="palette-foot label">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> go
          </span>
          <span>
            <kbd>@</kbd> <kbd>#</kbd> <kbd>!</kbd> <kbd>"</kbd> <kbd>&gt;</kbd> narrow
          </span>
        </div>
      </div>
    </div>
  );
}
