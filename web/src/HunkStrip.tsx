import { hunkSize, type PatchHunk } from "../../server/patch.ts";
import { hunkLabel, type HunkMark } from "./nav.ts";

interface Props {
  hunks: PatchHunk[];
  marks: HunkMark[];
  current: number | null;
  seen: (index: number) => boolean;
  onPick: (index: number) => void;
}

export function HunkStrip({ hunks, marks, current, seen, onPick }: Props) {
  if (hunks.length < 2) return null;
  const sizes = hunks.map(hunkSize);
  const columns = sizes.map((s) => `minmax(44px, ${Math.max(1, Math.sqrt(s.additions + s.deletions)).toFixed(2)}fr)`).join(" ");
  return (
    <div className="hunkstrip" style={{ gridTemplateColumns: columns }} role="tablist" aria-label="Hunks in this file">
      {hunks.map((hunk, i) => {
        const mark = marks[i];
        const size = sizes[i];
        const state = i === current ? "on" : seen(i) ? "seen" : "";
        return (
          <button
            key={hunk.index}
            role="tab"
            aria-selected={i === current}
            className={`seg ${state}`}
            onClick={() => onPick(i)}
            title={`Hunk ${i + 1} · ${hunkLabel(hunk)} · g ${i + 1}`}
          >
            <span>{i + 1}</span>
            <span className="seg-meta">
              {mark?.flag && <span className={`dot ${mark.flag}`} aria-label={mark.flag} />}
              {mark?.comment && <span className="dot you" aria-label="your comment" />}
              <span className="seg-size">
                {size.additions ? `+${size.additions}` : ""}
                {size.additions && size.deletions ? " " : ""}
                {size.deletions ? `−${size.deletions}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
