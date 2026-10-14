import type { Claude } from "./claude.ts";
import { hunkFor, splitHunks } from "./patch.ts";
import { coachPrompt, coachSchema, coachSystem, type Coaching } from "./prompts/coach.ts";
import type { DraftComment } from "./review.ts";
import type { Pr } from "./types.ts";

export function coach(claude: Pick<Claude, "ask">, pr: Pr, comment: DraftComment): Promise<Coaching> {
  const file = pr.files.find((f) => f.path === comment.path);
  const hunk = hunkFor(splitHunks(file?.patch), comment);
  return claude.ask<Coaching>({ system: coachSystem, prompt: coachPrompt(pr, comment, hunk), schema: coachSchema });
}
