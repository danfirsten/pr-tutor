import { splitHunks } from "./patch.ts";
import type { Pr } from "./types.ts";

export const LABELS = ["blocker", "suggestion", "question", "nit"] as const;
export const EVENTS = ["COMMENT", "APPROVE", "REQUEST_CHANGES"] as const;
export type Label = (typeof LABELS)[number];
export type Side = "LEFT" | "RIGHT";

export interface DraftComment {
  id: string;
  path: string;
  line: number;
  side: Side;
  start_line?: number;
  start_side?: Side;
  label: Label;
  body: string;
  headSha: string;
}

export interface Draft {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  event: (typeof EVENTS)[number];
  body: string;
  comments: DraftComment[];
}

export function emptyDraft(pr: Pr): Draft {
  return { owner: pr.owner, repo: pr.repo, number: pr.number, headSha: pr.headSha, event: "COMMENT", body: "", comments: [] };
}

export function commentableLines(patch: string | undefined): Record<Side, Set<number>> {
  const lines = { LEFT: new Set<number>(), RIGHT: new Set<number>() };
  for (const hunk of splitHunks(patch)) {
    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    for (const text of hunk.text.split("\n").slice(1)) {
      if (text.startsWith("-")) lines.LEFT.add(oldLine++);
      else if (text.startsWith("+")) lines.RIGHT.add(newLine++);
      else if (text.startsWith("\\")) continue;
      else {
        lines.LEFT.add(oldLine++);
        lines.RIGHT.add(newLine++);
      }
    }
  }
  return lines;
}

export function cleanDraft(pr: Pr, draft: Draft): Draft {
  const linesByPath = new Map(pr.files.map((f) => [f.path, commentableLines(f.patch)]));
  const comments = (Array.isArray(draft.comments) ? draft.comments : []).flatMap((c): DraftComment[] => {
    const lines = linesByPath.get(c.path);
    const side: Side = c.side === "LEFT" ? "LEFT" : "RIGHT";
    if (!LABELS.includes(c.label) || typeof c.body !== "string" || !c.body.trim()) return [];
    const stale = typeof c.headSha === "string" && c.headSha !== pr.headSha;
    if (stale) return [c];
    if (!lines || !lines[side].has(c.line)) return [];
    const base: DraftComment = { id: String(c.id), path: c.path, line: c.line, side, label: c.label, body: c.body, headSha: String(c.headSha ?? pr.headSha) };
    const startSide: Side = c.start_side === "LEFT" ? "LEFT" : "RIGHT";
    const rangeOk = typeof c.start_line === "number" && lines[startSide].has(c.start_line) && (startSide !== side || c.start_line < c.line);
    return [rangeOk ? { ...base, start_line: c.start_line, start_side: startSide } : base];
  });
  return {
    ...emptyDraft(pr),
    event: EVENTS.includes(draft.event) ? draft.event : "COMMENT",
    body: typeof draft.body === "string" ? draft.body : "",
    comments,
  };
}

const VERDICT: Record<Draft["event"], string> = { COMMENT: "comment only", APPROVE: "approve", REQUEST_CHANGES: "request changes" };

export function renderMarkdown(pr: Pr, draft: Draft): string {
  const out = [
    `# Review of ${pr.owner}/${pr.repo}#${pr.number}: ${pr.title}`,
    "",
    `Draft written against head ${draft.headSha.slice(0, 7)}. Verdict: ${VERDICT[draft.event]}.`,
    "",
    "## Summary",
    "",
    draft.body.trim() || "(no summary yet)",
  ];
  const byPath = Map.groupBy(draft.comments, (c) => c.path);
  out.push("", `## Comments (${draft.comments.length})`);
  for (const [path, comments] of byPath) {
    out.push("", `### ${path}`);
    for (const c of comments.toSorted((a, b) => a.line - b.line)) {
      const range = c.start_line ? `L${c.start_line}–${c.line}` : `L${c.line}`;
      out.push("", `- ${range} (${c.side === "LEFT" ? "old" : "new"}) · ${c.label}`, "", ...c.body.trim().split("\n").map((l) => `  ${l}`));
    }
  }
  return out.join("\n") + "\n";
}
