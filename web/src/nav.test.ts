import { describe, expect, it } from "vitest";
import { splitHunks } from "../../server/patch.ts";
import type { Concern, FileNotes } from "../../server/prompts/notes.ts";
import { decodePlace, encodePlace, fuzzyScore, groupConsecutive, hunkMarks } from "./nav.ts";

describe("places in the address", () => {
  it("round-trips a file, hunk, full-file flag and cursor line", () => {
    const place = { path: "server/a:b.ts", hunk: 1, full: true, line: 16, side: "LEFT" as const };
    expect(encodePlace(place)).toBe("server/a:b.ts:2f:L16");
    expect(decodePlace(encodePlace(place))).toEqual(place);
  });

  it("round-trips a plain hunk and a view", () => {
    expect(decodePlace("web/x.tsx:3")).toEqual({ path: "web/x.tsx", hunk: 2 });
    expect(decodePlace("review")).toEqual({ view: "review" });
  });

  it("rejects text that isn't a place", () => {
    expect(decodePlace("nonsense")).toBeNull();
    expect(decodePlace("a.ts:0")).toBeNull();
    expect(decodePlace(null)).toBeNull();
  });
});

describe("groupConsecutive", () => {
  it("groups neighbours in the same folder without reordering", () => {
    const files = ["a/x.ts", "a/y.ts", "b/z.ts", "a/w.ts", "root.md"].map((path) => ({ path }));
    expect(groupConsecutive(files).map((g) => [g.folder, g.files.length])).toEqual([["a/", 2], ["b/", 1], ["a/", 1], ["", 1]]);
  });
});

describe("fuzzyScore", () => {
  it("matches letters in order and ranks a plain substring first", () => {
    expect(fuzzyScore("sndts", "server/webhooks/send.ts")).not.toBeNull();
    expect(fuzzyScore("send", "server/webhooks/send.ts")!).toBeGreaterThan(fuzzyScore("sndts", "server/webhooks/send.ts")!);
    expect(fuzzyScore("zzz", "send.ts")).toBeNull();
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("hunkMarks", () => {
  const hunks = splitHunks(["@@ -1,1 +1,1 @@", "-a", "+A", "@@ -10,1 +10,1 @@", "-b", "+B"].join("\n"));
  const concern = (severity: Concern["severity"]): Concern => ({ line: 10, side: "new", severity, text: "t", why: "w" });

  it("flags the worst concern per hunk and where your comments are", () => {
    const notes = { hunks: [{ hunkIndex: 1, summary: "", checks: [], concerns: [concern("nit"), concern("should-fix")] }] } as unknown as FileNotes;
    expect(hunkMarks(hunks, notes, [{ line: 1, side: "RIGHT" }])).toEqual([{ comment: true }, { flag: "should-fix", comment: false }]);
  });

  it("ignores minor and nit concerns", () => {
    const notes = { hunks: [{ hunkIndex: 0, summary: "", checks: [], concerns: [concern("minor")] }] } as unknown as FileNotes;
    expect(hunkMarks(hunks, notes, [])[0]).toEqual({ comment: false });
  });
});
