import type { PatchHunk } from "../patch.ts";
import { CATEGORIES, type Comparison, type Pr } from "../types.ts";

export type { Comparison };
import type { HunkNote } from "./notes.ts";

export const compareSchema = {
  type: "object",
  additionalProperties: false,
  required: ["line", "caught", "missed"],
  properties: {
    line: { type: "string" },
    caught: { type: "array", items: { type: "string" }, maxItems: 4 },
    missed: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "what"],
        properties: { category: { type: "string", enum: [...CATEGORIES] }, what: { type: "string" } },
      },
    },
  },
};

export const compareSystem = `A junior developer is practising code review. Before seeing any notes, they wrote their own take on one diff hunk: what it does and what could go wrong. Compare their take with what a senior reviewer would see, and give them honest, encouraging feedback.

line: One sentence summing up how they did, warm but honest. No empty praise.

caught: Things they got right, briefly, in their own terms. Include a correct reading of what the hunk does.

missed: Things that matter that they didn't mention, each with a category and a short, specific note on what to notice next time. Use "understanding" when they misread what the code does. Only list misses that matter for this hunk: a trivial hunk with a correct take has no misses. Don't count style nits as misses.

Plain, direct English, short sentences.`;

export function comparePrompt(pr: Pr, path: string, hunk: PatchHunk, take: string, note: HunkNote | undefined): string {
  return [
    `# Pull request: ${pr.title}`,
    `## File: ${path}`,
    `## The hunk\n\`\`\`diff\n${hunk.text}\n\`\`\``,
    note ? `## A senior reviewer's notes on this hunk\n${JSON.stringify({ summary: note.summary, checks: note.checks, concerns: note.concerns }, null, 2)}` : "",
    `## The junior's take\n${take}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
