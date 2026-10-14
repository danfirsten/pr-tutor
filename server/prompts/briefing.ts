import { isNoise } from "../noise.ts";
import type { Pr } from "../types.ts";

export const BRIEFING_VERSION = 1;

export interface Briefing {
  purpose: string;
  approach: string;
  hotspots: Array<{ path: string; why: string }>;
  readingOrder: Array<{ path: string; why: string }>;
  skim: Array<{ path: string; why: string }>;
  questions: string[];
}

const pathWhy = {
  type: "array",
  items: { type: "object", additionalProperties: false, required: ["path", "why"], properties: { path: { type: "string" }, why: { type: "string" } } },
};

export const briefingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["purpose", "approach", "hotspots", "readingOrder", "skim", "questions"],
  properties: {
    purpose: { type: "string" },
    approach: { type: "string" },
    hotspots: { ...pathWhy, maxItems: 3 },
    readingOrder: pathWhy,
    skim: pathWhy,
    questions: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
};

export const briefingSystem = `You are a senior engineer helping a junior developer get oriented before they review a pull request. They haven't read the code yet. Give them the map.

purpose: What problem this PR solves and for whom, in two or three plain sentences. Use the description, but check it against the diff, and say so if they disagree.

approach: How the change works, in two to four sentences: the main moving parts and how they connect. Name real files and functions.

hotspots: The two or three places where the real change lives, the ones that deserve the most careful reading, each with one line on why. Use exact paths from the file list.

readingOrder: Every file that isn't in skim, in the order a reviewer should read them so each one makes sense. Usually that's types and contracts first, then core logic, then callers and wiring, then tests. Give one short line per file on what to look at in it.

skim: Files a reviewer can glance at: lockfiles, generated code, snapshots, pure formatting, simple renames, version bumps. Give one short line each on why it's safe to skim. Files marked [likely noise] usually belong here, but use your judgement.

questions: Up to four questions a thoughtful reviewer might ask the author, about intent, trade-offs or missing pieces, that the PR doesn't answer. Leave it empty when there's nothing real to ask.

Every path you return must appear exactly in the file list. Plain, direct English, short sentences, no filler.`;

const MAX_PATCH_LINES_PER_FILE = 80;
const MAX_TOTAL_PATCH_LINES = 2500;

export function briefingPrompt(pr: Pr): string {
  let budget = MAX_TOTAL_PATCH_LINES;
  const files = pr.files.map((f) => {
    const label = `- ${f.path}${f.previousPath ? ` (renamed from ${f.previousPath})` : ""}, ${f.status}, +${f.additions} −${f.deletions}${isNoise(f.path) ? " [likely noise]" : ""}`;
    if (!f.patch || isNoise(f.path) || budget <= 0) return label;
    const lines = f.patch.split("\n");
    const take = Math.min(lines.length, MAX_PATCH_LINES_PER_FILE, budget);
    budget -= take;
    const more = lines.length > take ? `\n… ${lines.length - take} more lines` : "";
    return `${label}\n\`\`\`diff\n${lines.slice(0, take).join("\n")}${more}\n\`\`\``;
  });
  return [`# ${pr.title}`, `## Description\n${pr.body?.slice(0, 6000) || "(none)"}`, `## Files (${pr.files.length})`, ...files].join("\n\n");
}

export function cleanBriefing(briefing: Briefing, pr: Pr): Briefing {
  const known = new Set(pr.files.map((f) => f.path));
  const keep = (items: Briefing["readingOrder"]) => items.filter((item, i, all) => known.has(item.path) && all.findIndex((x) => x.path === item.path) === i);
  const skim = keep(briefing.skim);
  const skimmed = new Set(skim.map((s) => s.path));
  const readingOrder = keep(briefing.readingOrder).filter((r) => !skimmed.has(r.path));
  const placed = new Set([...readingOrder, ...skim].map((x) => x.path));
  const missing = pr.files.filter((f) => !placed.has(f.path)).map((f) => ({ path: f.path, why: "" }));
  return { ...briefing, hotspots: keep(briefing.hotspots), readingOrder: [...readingOrder, ...missing], skim };
}
