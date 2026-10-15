import type { HunkRow } from "../../server/patch.ts";
import type { Concern } from "../../server/prompts/notes.ts";

export interface AskWhere {
  path: string;
  line: number;
  side: HunkRow["side"];
  start_line?: number;
  concern?: Concern;
}

export function aboutLines(path: string, rows: HunkRow[], span: number[] | null): AskWhere | null {
  const [from, to] = span ?? [0, rows.length - 1];
  const picked = rows.slice(from, to + 1);
  const last = picked.at(-1);
  if (!last) return null;
  const first = picked.find((r) => r.side === last.side)!;
  return { path, ...(first.line !== last.line ? { start_line: first.line } : {}), line: last.line, side: last.side };
}

export function aboutConcern(path: string, concern: Concern): AskWhere {
  return { path, line: concern.line, side: concern.side === "old" ? "LEFT" : "RIGHT", concern };
}
