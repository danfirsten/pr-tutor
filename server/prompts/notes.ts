import type { PatchHunk } from "../patch.ts";
import type { Pr, PrFile } from "../types.ts";

export const NOTES_VERSION = 2;

export const SEVERITIES = ["blocker", "should-fix", "minor", "nit"] as const;
export type Severity = (typeof SEVERITIES)[number];

export interface Concern {
  line: number;
  side: "new" | "old";
  severity: Severity;
  text: string;
  why: string;
}

export interface HunkNote {
  hunkIndex: number;
  summary: string;
  checks: string[];
  concerns: Concern[];
  concept: { name: string; explanation: string } | null;
}

export interface FileNotes {
  hunks: HunkNote[];
}

export const notesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["hunks"],
  properties: {
    hunks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hunkIndex", "summary", "checks", "concerns", "concept"],
        properties: {
          hunkIndex: { type: "integer", minimum: 0 },
          summary: { type: "string" },
          checks: { type: "array", items: { type: "string" }, maxItems: 4 },
          concerns: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["line", "side", "severity", "text", "why"],
              properties: {
                line: { type: "integer", minimum: 1 },
                side: { type: "string", enum: ["new", "old"] },
                severity: { type: "string", enum: [...SEVERITIES] },
                text: { type: "string" },
                why: { type: "string" },
              },
            },
          },
          concept: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["name", "explanation"],
                properties: { name: { type: "string" }, explanation: { type: "string" } },
              },
            ],
          },
        },
      },
    },
  },
};

export const notesSystem = `You are a senior software engineer mentoring a junior developer who is learning to review pull requests. They are reading one hunk at a time, and your notes sit beside the code.

Your job is to teach them to see what you see. For every hunk, write:

summary: What the hunk does and why the author probably did it, in one to three plain sentences. Name the actual functions, variables and values. Never just restate the diff line by line.

checks: Up to four things a careful reviewer would verify in this hunk, phrased as something the reader can go and do ("Find the callers of parseDate and check none pass an empty string"). Draw on this checklist, using only the items that genuinely apply here: correctness and logic, edge cases (empty, null, zero, very large, unicode, concurrent), error handling and what happens on failure, tests (is the new behaviour covered, do the tests assert anything real), naming and readability, security (input validation, injection, secrets, auth), performance (loops over large data, repeated I/O, N+1 queries), concurrency and shared state, API or contract changes that could break callers, and design (is this the right place, is it duplicated elsewhere). For trivial hunks such as an import or a rename, give zero or one check.

concerns: Real problems only, each pinned to one line. Use the line number from the file: for an added or unchanged line use its new-file number and side "new"; for a removed line use its old-file number and side "old". Severity is blocker (wrong behaviour, data loss, security hole, crash), should-fix (likely bug, missing test for risky logic, confusing code that will cause bugs), minor (small improvement), or nit (style or taste). Write "text" as what is wrong, and "why" as what goes wrong in practice, with a concrete input or scenario. If you aren't sure, say what you'd check rather than asserting a bug. An empty list is the right answer for most hunks; never invent concerns to fill space.

concept: When the hunk touches an idea worth learning (a race condition, idempotency, an off-by-one, dependency injection, a database transaction, memoisation, a specific language feature), name it and explain it in two to four sentences, tied back to this code. Use null when there's nothing worth teaching.

Return one entry per hunk, with hunkIndex matching the numbers given. Write in plain, direct English with short sentences. No preamble, no praise, no hedging filler.`;

const MAX_FILE_LINES = 1500;
const MAX_BODY_CHARS = 4000;

export function notesPrompt(pr: Pr, file: PrFile, hunks: PatchHunk[], newContents: string | null): string {
  const parts = [
    `# Pull request: ${pr.title}`,
    pr.body ? `## Description\n${pr.body.slice(0, MAX_BODY_CHARS)}` : "## Description\n(none)",
    `## Every file this PR changes\n${pr.files.map((f) => `- ${f.path} (+${f.additions} −${f.deletions})`).join("\n")}`,
    `## The file you're annotating: ${file.path}${file.previousPath ? ` (renamed from ${file.previousPath})` : ""}, ${file.status}, +${file.additions} −${file.deletions}`,
    ...hunks.map((h) => `### Hunk ${h.index}\n\`\`\`diff\n${h.text}\n\`\`\``),
  ];
  if (newContents !== null) {
    const lines = newContents.split("\n");
    const shown = lines.slice(0, MAX_FILE_LINES).map((line, i) => `${String(i + 1).padStart(5)} ${line}`).join("\n");
    const cut = lines.length > MAX_FILE_LINES ? `\n(cut at ${MAX_FILE_LINES} of ${lines.length} lines)` : "";
    parts.push(`## The whole file after this PR, with line numbers, for context\n\`\`\`\n${shown}${cut}\n\`\`\``);
  }
  return parts.join("\n\n");
}
