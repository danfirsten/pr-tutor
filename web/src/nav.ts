import { hunkFor, type HunkRow, type PatchHunk } from "../../server/patch.ts";
import type { FileNotes } from "../../server/prompts/notes.ts";
import type { DraftComment } from "../../server/review.ts";

export type View = "briefing" | "review" | "misses";
export type Place = { view: View } | { path: string; hunk: number; full?: boolean; line?: number; side?: HunkRow["side"] };

const VIEWS: View[] = ["briefing", "review", "misses"];

export function encodePlace(place: Place): string {
  if ("view" in place) return place.view;
  const line = place.line ? `:${place.side === "LEFT" ? "L" : "R"}${place.line}` : "";
  return `${place.path}:${place.hunk + 1}${place.full ? "f" : ""}${line}`;
}

export function decodePlace(text: string | null): Place | null {
  if (!text) return null;
  if (VIEWS.includes(text as View)) return { view: text as View };
  const match = /^(.+):(\d+)(f?)(?::([LR])(\d+))?$/.exec(text);
  if (!match || Number(match[2]) < 1) return null;
  return {
    path: match[1],
    hunk: Number(match[2]) - 1,
    ...(match[3] ? { full: true } : {}),
    ...(match[5] ? { line: Number(match[5]), side: match[4] === "L" ? ("LEFT" as const) : ("RIGHT" as const) } : {}),
  };
}

export function samePlace(a: Place | null, b: Place | null) {
  return !!a && !!b && encodePlace(a) === encodePlace(b);
}

export function folderOf(path: string) {
  return path.slice(0, path.lastIndexOf("/") + 1);
}

export function nameOf(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function groupConsecutive<T extends { path: string }>(files: T[]): Array<{ folder: string; files: T[] }> {
  const groups: Array<{ folder: string; files: T[] }> = [];
  for (const file of files) {
    const folder = folderOf(file.path);
    const last = groups.at(-1);
    if (last && last.folder === folder) last.files.push(file);
    else groups.push({ folder, files: [file] });
  }
  return groups;
}

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at >= 0) return 1000 - at;
  let from = 0;
  let last = -2;
  let score = 0;
  for (const ch of q) {
    const hit = t.indexOf(ch, from);
    if (hit < 0) return null;
    score += hit === last + 1 ? 5 : /[/._\s-]/.test(t[hit - 1] ?? "/") ? 3 : 1;
    last = hit;
    from = hit + 1;
  }
  return score;
}

export type Flag = "blocker" | "should-fix";
export interface HunkMark {
  flag?: Flag;
  comment: boolean;
}

export function hunkMarks(hunks: PatchHunk[], notes: FileNotes | undefined, comments: Array<Pick<DraftComment, "line" | "side">>): HunkMark[] {
  return hunks.map((hunk) => {
    const severities = notes?.hunks.find((n) => n.hunkIndex === hunk.index)?.concerns.map((c) => c.severity) ?? [];
    const flag = severities.includes("blocker") ? "blocker" : severities.includes("should-fix") ? "should-fix" : undefined;
    return { ...(flag ? { flag } : {}), comment: comments.some((c) => hunkFor(hunks, c)?.index === hunk.index) };
  });
}

export function worstFlag(marks: HunkMark[]): Flag | undefined {
  return marks.some((m) => m.flag === "blocker") ? "blocker" : marks.some((m) => m.flag === "should-fix") ? "should-fix" : undefined;
}

export function hunkLabel(hunk: PatchHunk) {
  return hunk.header.replace(/^@@.*?@@\s*/, "") || "top level";
}
