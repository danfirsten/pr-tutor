import type { PatchHunk } from "../patch.ts";
import type { Pr } from "../types.ts";
import type { Concern } from "./notes.ts";

export interface Turn {
  question: string;
  at: string;
  answer?: string;
  error?: string;
}

export interface Thread {
  id: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  start_line?: number;
  concern?: Concern;
  headSha: string;
  turns: Turn[];
}

export type Question =
  | { threadId: string; question: string }
  | { path: string; line: number; side: "LEFT" | "RIGHT"; start_line?: number; concern?: Concern; question: string };

export const askSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
};

export const askSystem = `You are a patient senior engineer sitting next to a junior developer while they review a pull request. They point at some code, or at a concern a reviewer raised about it, and ask you a question.

Answer the question they asked, directly, in the first sentence. Then add only what helps them understand: what the code does, why it's written that way, what would break, or the concept behind it. Use the names in the code, and a concrete input or scenario when it makes things clearer. If they ask about a concern, say whether it holds up against the code and why; don't defend it if it's wrong. If the code shown isn't enough to be sure, say what you'd check.

Keep it short: usually two to five sentences, or a few short paragraphs for a big question. Plain text, no headings or bullet lists; wrap code in backticks, and use a fenced block only for a few lines of example code. Plain, direct English, no filler.`;

const MAX_FILE_LINES = 1500;

export function askPrompt(pr: Pr, thread: Thread, hunk: PatchHunk | undefined, newFile: string | null, question: string): string {
  const lines = thread.start_line ? `lines ${thread.start_line}–${thread.line}` : `line ${thread.line}`;
  const where = `${thread.path}, ${lines} (${thread.side === "LEFT" ? "old file, removed code" : "new file"})`;
  const numbered = newFile
    ?.split("\n")
    .slice(0, MAX_FILE_LINES)
    .map((text, i) => `${i + 1} | ${text}`)
    .join("\n");
  const concern = thread.concern && `## The concern they're asking about (${thread.concern.severity}, line ${thread.concern.line})\n${thread.concern.text}\n${thread.concern.why}`;
  const earlier = thread.turns
    .filter((t) => t.answer)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join("\n\n");
  return [
    `# Pull request: ${pr.title}`,
    pr.body?.trim() && `## Description\n${pr.body.trim()}`,
    `## Where they're pointing: ${where}`,
    hunk && `## The hunk\n\`\`\`diff\n${hunk.text}\n\`\`\``,
    numbered && `## The whole new file, numbered\n\`\`\`\n${numbered}\n\`\`\``,
    concern,
    earlier && `## The conversation so far\n${earlier}`,
    `## Their question\n${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
