import type { HunkRow } from "../../server/patch.ts";
import type { Concern, Severity } from "../../server/prompts/notes.ts";
import type { DraftComment, Label } from "../../server/review.ts";

const LABEL_FOR: Record<Severity, Label> = { blocker: "blocker", "should-fix": "suggestion", minor: "suggestion", nit: "nit" };

const sideOf = (concern: Concern) => (concern.side === "old" ? "LEFT" : "RIGHT");

export function commentFromConcern(concern: Concern, path: string, headSha: string): DraftComment {
  return {
    id: crypto.randomUUID(),
    path,
    line: concern.line,
    side: sideOf(concern),
    label: LABEL_FOR[concern.severity],
    body: [concern.text, concern.why].map((s) => s.trim()).filter(Boolean).join(" "),
    headSha,
  };
}

export function concernAt(concerns: Concern[], row: Pick<HunkRow, "line" | "side"> | null): Concern | undefined {
  return (row && concerns.find((c) => c.line === row.line && sideOf(c) === row.side)) || concerns.toSorted((a, b) => a.line - b.line)[0];
}
