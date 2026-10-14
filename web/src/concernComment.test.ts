import { describe, expect, it } from "vitest";
import type { Concern } from "../../server/prompts/notes.ts";
import { commentFromConcern, concernAt } from "./concernComment.ts";

const concern = (over: Partial<Concern> = {}): Concern => ({ line: 12, side: "new", severity: "should-fix", text: "This can be null.", why: "An empty list crashes the render.", ...over });

describe("commentFromConcern", () => {
  it("prefills the text and the reason on the concern's line", () => {
    const c = commentFromConcern(concern(), "src/a.ts", "abc");
    expect(c).toMatchObject({ path: "src/a.ts", line: 12, side: "RIGHT", body: "This can be null. An empty list crashes the render.", headSha: "abc" });
    expect(c.start_line).toBeUndefined();
  });

  it("puts a removed-line concern on the old side", () => {
    expect(commentFromConcern(concern({ side: "old" }), "a", "s").side).toBe("LEFT");
  });

  it.each([
    ["blocker", "blocker"],
    ["should-fix", "suggestion"],
    ["minor", "suggestion"],
    ["nit", "nit"],
  ] as const)("labels %s as %s", (severity, label) => {
    expect(commentFromConcern(concern({ severity }), "a", "s").label).toBe(label);
  });

  it("leaves out an empty reason", () => {
    expect(commentFromConcern(concern({ why: " " }), "a", "s").body).toBe("This can be null.");
  });
});

describe("concernAt", () => {
  const first = concern({ line: 3 });
  const second = concern({ line: 9 });
  const removed = concern({ line: 9, side: "old" });

  it("picks the concern on the cursor line and side", () => {
    expect(concernAt([first, removed, second], { line: 9, side: "RIGHT" })).toBe(second);
    expect(concernAt([first, second, removed], { line: 9, side: "LEFT" })).toBe(removed);
  });

  it("falls back to the concern highest up the file when the cursor isn't on one", () => {
    expect(concernAt([second, first], { line: 5, side: "RIGHT" })).toBe(first);
    expect(concernAt([second, first], null)).toBe(first);
  });

  it("finds nothing when there are no concerns", () => {
    expect(concernAt([], null)).toBeUndefined();
  });
});
