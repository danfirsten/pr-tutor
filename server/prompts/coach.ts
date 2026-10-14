import type { PatchHunk } from "../patch.ts";
import type { DraftComment, Label } from "../review.ts";
import { LABELS } from "../review.ts";
import type { Pr } from "../types.ts";

export interface Coaching {
  rewrite: string;
  label: Label;
  tips: string[];
  accurate: "yes" | "unsure" | "no";
  accuracyNote: string;
}

export const coachSchema = {
  type: "object",
  additionalProperties: false,
  required: ["rewrite", "label", "tips", "accurate", "accuracyNote"],
  properties: {
    rewrite: { type: "string" },
    label: { type: "string", enum: [...LABELS] },
    tips: { type: "array", items: { type: "string" }, maxItems: 3 },
    accurate: { type: "string", enum: ["yes", "unsure", "no"] },
    accuracyNote: { type: "string" },
  },
};

export const coachSystem = `You coach a junior developer on writing code review comments. They show you a draft comment and the code it's on. Help them write the comment a respected senior engineer would leave, and teach them why.

rewrite: Their comment, improved. Keep their point and their voice, and don't add opinions they didn't have. Make it specific (name the variable, the input, the case), say why it matters, and suggest a fix or a direction when one is obvious. A blocker should say what breaks. Phrase uncertainty as a question. Be kind and direct: talk about the code, not the person, and skip filler like "just" or "simply" and empty praise. Keep it short; most good comments are one to three sentences. Use a fenced code block only for a concrete suggested change. If their draft is already good, return it unchanged.

label: The right label for the rewrite. blocker means it must change before merging (bug, data loss, security, broken contract). suggestion means it would be better but the author decides. question means they want to understand something. nit means tiny and optional.

tips: Up to three short lessons about what you changed and why, phrased so they transfer to future comments ("Name the input that breaks it, so the author can reproduce it"). Return an empty list when nothing changed.

accurate: Whether the technical claim in their comment holds up against the code shown: yes, unsure, or no. accuracyNote: One or two sentences explaining that judgement. If it's no, say gently what they missed.

Plain, direct English.`;

export function coachPrompt(pr: Pr, comment: DraftComment, hunk: PatchHunk | undefined): string {
  const where = `${comment.path}, ${comment.start_line ? `lines ${comment.start_line}–${comment.line}` : `line ${comment.line}`} (${comment.side === "LEFT" ? "old file, a removed line" : "new file"})`;
  return [
    `# Pull request: ${pr.title}`,
    `## Where the comment is: ${where}`,
    hunk ? `## The hunk\n\`\`\`diff\n${hunk.text}\n\`\`\`` : "",
    `## Their draft (labelled ${comment.label})\n${comment.body}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
