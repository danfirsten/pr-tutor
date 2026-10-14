export interface PatchHunk {
  index: number;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  text: string;
}

const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function splitHunks(patch: string | undefined): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  let lines: string[] = [];

  const flush = () => {
    const match = lines.length ? HEADER.exec(lines[0]) : null;
    if (match) {
      hunks.push({
        index: hunks.length,
        header: lines[0],
        oldStart: Number(match[1]),
        oldLines: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newLines: match[4] === undefined ? 1 : Number(match[4]),
        text: lines.join("\n"),
      });
    }
    lines = [];
  };

  for (const line of (patch ?? "").split("\n")) {
    if (HEADER.test(line)) flush();
    lines.push(line);
  }
  flush();
  return hunks;
}

export function hunkPatch(path: string, hunk: PatchHunk, previousPath?: string): string {
  return `--- a/${previousPath ?? path}\n+++ b/${path}\n${hunk.text}\n`;
}

export function hunkFor(hunks: PatchHunk[], at: { line: number; side: "LEFT" | "RIGHT" }): PatchHunk | undefined {
  return hunks.find((h) => (at.side === "LEFT" ? h.oldStart <= at.line && at.line < h.oldStart + h.oldLines : h.newStart <= at.line && at.line < h.newStart + h.newLines));
}

export interface HunkRow {
  side: "LEFT" | "RIGHT";
  line: number;
  changed: boolean;
}

export function hunkRows(hunk: PatchHunk): HunkRow[] {
  const rows: HunkRow[] = [];
  let oldLine = hunk.oldStart;
  let newLine = hunk.newStart;
  for (const text of hunk.text.split("\n").slice(1)) {
    if (text.startsWith("\\")) continue;
    if (text.startsWith("-")) rows.push({ side: "LEFT", line: oldLine++, changed: true });
    else if (text.startsWith("+")) rows.push({ side: "RIGHT", line: newLine++, changed: true });
    else {
      rows.push({ side: "RIGHT", line: newLine++, changed: false });
      oldLine++;
    }
  }
  return rows;
}
