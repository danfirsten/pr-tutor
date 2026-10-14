import { describe, expect, it } from "vitest";
import { cleanDraft, commentableLines, emptyDraft, renderMarkdown, type Draft } from "./review.ts";
import type { Pr } from "./types.ts";

const patch = ["@@ -10,4 +10,5 @@", " ten", "-eleven", "+ELEVEN", "+eleven-and-a-half", " twelve", " thirteen"].join("\n");

const pr = {
  owner: "acme", repo: "widgets", number: 7, title: "Fix it", headSha: "h1",
  files: [{ path: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch }, { path: "logo.png", status: "added", additions: 0, deletions: 0 }],
} as unknown as Pr;

const comment = (over: object) => ({ id: "c1", path: "src/a.ts", line: 11, side: "RIGHT", label: "nit", body: "x", headSha: "h1", ...over });

describe("commentableLines", () => {
  it("knows which lines each side of the diff shows", () => {
    const lines = commentableLines(patch);
    expect([...lines.RIGHT]).toEqual([10, 11, 12, 13, 14]);
    expect([...lines.LEFT]).toEqual([10, 11, 12, 13]);
  });
});

describe("cleanDraft", () => {
  it("keeps valid comments and drops ones GitHub would reject", () => {
    const draft: Draft = {
      ...emptyDraft(pr),
      comments: [
        comment({ id: "ok" }),
        comment({ id: "outside", line: 40 }),
        comment({ id: "wrong-file", path: "nope.ts" }),
        comment({ id: "bad-label", label: "rant" }),
        comment({ id: "empty", body: "   " }),
        comment({ id: "old-side", side: "LEFT", line: 11 }),
      ] as Draft["comments"],
    };
    expect(cleanDraft(pr, draft).comments.map((c) => c.id)).toEqual(["ok", "old-side"]);
  });

  it("keeps comments from an older head untouched, so a pushed PR never loses your work", () => {
    const old = comment({ id: "old", line: 99, headSha: "h0" });
    expect(cleanDraft(pr, { ...emptyDraft(pr), comments: [old] as Draft["comments"] }).comments).toEqual([old]);
  });

  it("keeps a range only when both ends are in the diff and in order", () => {
    const draft = { ...emptyDraft(pr), comments: [comment({ id: "r1", start_line: 10, start_side: "RIGHT", line: 12 }), comment({ id: "r2", start_line: 13, start_side: "RIGHT", line: 11 })] } as Draft;
    const out = cleanDraft(pr, draft).comments;
    expect(out.find((c) => c.id === "r1")).toMatchObject({ start_line: 10, line: 12 });
    expect(out.find((c) => c.id === "r2")?.start_line).toBeUndefined();
  });

  it("falls back to a plain comment for an unknown verdict", () => {
    expect(cleanDraft(pr, { ...emptyDraft(pr), event: "MERGE_IT" as Draft["event"] }).event).toBe("COMMENT");
  });
});

describe("renderMarkdown", () => {
  it("writes a readable review with labels, line refs and the verdict", () => {
    const draft: Draft = { ...emptyDraft(pr), event: "REQUEST_CHANGES", body: "Nice fix, one problem.", comments: [comment({ label: "blocker", body: "This drops the last item.", start_line: 10, start_side: "RIGHT" })] as Draft["comments"] };
    const md = renderMarkdown(pr, draft);
    expect(md).toContain("# Review of acme/widgets#7: Fix it");
    expect(md).toContain("Verdict: request changes");
    expect(md).toContain("Nice fix, one problem.");
    expect(md).toContain("### src/a.ts");
    expect(md).toContain("L10–11 (new) · blocker");
    expect(md).toContain("This drops the last item.");
  });
});
