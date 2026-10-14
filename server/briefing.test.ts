import { describe, expect, it } from "vitest";
import { briefingPrompt, cleanBriefing, type Briefing } from "./prompts/briefing.ts";
import type { Pr } from "./types.ts";

const pr = {
  title: "t", body: "b",
  files: [
    { path: "src/a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+a" },
    { path: "src/b.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+b" },
    { path: "package-lock.json", status: "modified", additions: 900, deletions: 800, patch: "@@ -1 +1 @@\n+x" },
  ],
} as unknown as Pr;

const base: Briefing = { purpose: "", approach: "", hotspots: [], readingOrder: [], skim: [], questions: [] };

describe("cleanBriefing", () => {
  it("drops paths that aren't in the PR and duplicates", () => {
    const out = cleanBriefing({ ...base, readingOrder: [{ path: "src/b.ts", why: "" }, { path: "nope.ts", why: "" }, { path: "src/b.ts", why: "" }], hotspots: [{ path: "made/up.ts", why: "" }] }, pr);
    expect(out.readingOrder.map((r) => r.path)).toEqual(["src/b.ts", "src/a.ts", "package-lock.json"]);
    expect(out.hotspots).toEqual([]);
  });

  it("puts every file somewhere exactly once, and skim wins", () => {
    const out = cleanBriefing({ ...base, readingOrder: [{ path: "package-lock.json", why: "" }, { path: "src/a.ts", why: "" }], skim: [{ path: "package-lock.json", why: "lockfile" }] }, pr);
    expect(out.readingOrder.map((r) => r.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(out.skim.map((s) => s.path)).toEqual(["package-lock.json"]);
  });
});

describe("briefingPrompt", () => {
  it("flags noise and leaves its patch out", () => {
    const prompt = briefingPrompt(pr);
    expect(prompt).toContain("package-lock.json, modified, +900 −800 [likely noise]");
    expect(prompt).not.toContain("+x");
    expect(prompt).toContain("+a");
  });
});
