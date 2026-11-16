import { useState } from "react";
import { hunkSize, type PatchHunk } from "../../server/patch.ts";
import type { PrFile } from "../../server/types.ts";
import { hunkLabel, type HunkMark } from "./nav.ts";

interface Props {
  read: PrFile[];
  skim: PrFile[];
  hunksByPath: Map<string, PatchHunk[]>;
  marks: (path: string) => HunkMark[];
  current: { path: string; hunk: number | null } | null;
  seen: (path: string, index: number) => boolean;
  reviewed: Set<string>;
  onPick: (path: string, index: number) => void;
}

type Tip = { path: string; index: number; top: number; right: number };

export function PrMap({ read, skim, hunksByPath, marks, current, seen, reviewed, onPick }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);

  const file = (f: PrFile) => {
    const hunks = hunksByPath.get(f.path) ?? [];
    const fileMarks = marks(f.path);
    const slices = hunks.length ? hunks : [null];
    return (
      <div key={f.path} className="map-file">
        {slices.map((hunk, i) => {
          const size = hunk ? hunkSize(hunk) : { additions: f.additions, deletions: f.deletions };
          const on = current?.path === f.path && (current.hunk === null || current.hunk === i);
          const state = on ? "on" : reviewed.has(f.path) || seen(f.path, i) ? "seen" : "";
          const mark = fileMarks[i];
          return (
            <button
              key={i}
              className={`map-hunk ${state}`}
              style={{ flexGrow: Math.max(1, Math.sqrt(size.additions + size.deletions)) }}
              aria-label={`${f.path}, hunk ${i + 1}`}
              onClick={() => onPick(f.path, i)}
              onMouseEnter={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setTip({ path: f.path, index: i, top: box.top + box.height / 2, right: window.innerWidth - box.left + 10 });
              }}
              onMouseLeave={() => setTip(null)}
            >
              {mark?.flag && <span className={`map-flag dot ${mark.flag}`} />}
              {mark?.comment && <span className="map-you" />}
            </button>
          );
        })}
      </div>
    );
  };

  const tipHunk = tip ? hunksByPath.get(tip.path)?.[tip.index] : undefined;
  const tipMark = tip ? marks(tip.path)[tip.index] : undefined;

  return (
    <div className="map" aria-label="Map of the whole PR">
      {read.map(file)}
      {skim.length > 0 && <div className="map-rule" />}
      <div className="map-skim">{skim.map(file)}</div>
      {tip && (
        <div className="map-tip card" style={{ top: tip.top, right: tip.right }}>
          <div className="label map-tip-path">
            {tip.path}
            {tipHunk ? ` · hunk ${tip.index + 1}` : ""}
          </div>
          {tipHunk && <div className="mono muted">{hunkLabel(tipHunk)}</div>}
          {tipMark?.flag && (
            <div className="row">
              <span className={`dot ${tipMark.flag}`} />
              {tipMark.flag.replace("-", " ")}
            </div>
          )}
          {tipMark?.comment && <div className="muted">Your comment is here</div>}
        </div>
      )}
    </div>
  );
}
