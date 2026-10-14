import { describe, expect, it } from "vitest";
import { hunkPatch, splitHunks } from "./patch.ts";

const twoHunks = [
  "@@ -1,3 +1,3 @@ function a() {",
  " one",
  "-two",
  "+TWO",
  " three",
  "@@ -20,2 +20,4 @@",
  " twenty",
  "+new 1",
  "+new 2",
  " twenty-one",
].join("\n");

describe("splitHunks", () => {
  it("splits a patch at each hunk header and reads its ranges", () => {
    const hunks = splitHunks(twoHunks);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ index: 0, oldStart: 1, oldLines: 3, newStart: 1, newLines: 3, header: "@@ -1,3 +1,3 @@ function a() {" });
    expect(hunks[1]).toMatchObject({ index: 1, oldStart: 20, oldLines: 2, newStart: 20, newLines: 4 });
    expect(hunks[1].text.split("\n")).toHaveLength(5);
  });

  it("treats a missing count as one line", () => {
    expect(splitHunks("@@ -5 +5 @@\n-a\n+b")[0]).toMatchObject({ oldStart: 5, oldLines: 1, newStart: 5, newLines: 1 });
  });

  it("handles a new file", () => {
    expect(splitHunks("@@ -0,0 +1,2 @@\n+a\n+b")[0]).toMatchObject({ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2 });
  });

  it("keeps the no-newline marker inside its hunk", () => {
    const hunks = splitHunks("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b");
    expect(hunks).toHaveLength(1);
    expect(hunks[0].text).toContain("\\ No newline at end of file");
  });

  it("returns nothing for a binary or empty patch", () => {
    expect(splitHunks(undefined)).toEqual([]);
    expect(splitHunks("")).toEqual([]);
  });
});

describe("hunkPatch", () => {
  it("wraps one hunk in file headers so a diff renderer can read it", () => {
    const [hunk] = splitHunks(twoHunks);
    expect(hunkPatch("src/a.ts", hunk)).toBe(`--- a/src/a.ts\n+++ b/src/a.ts\n${hunk.text}\n`);
  });

  it("uses the old path for a rename", () => {
    const [hunk] = splitHunks(twoHunks);
    expect(hunkPatch("src/b.ts", hunk, "src/a.ts").startsWith("--- a/src/a.ts\n+++ b/src/b.ts\n")).toBe(true);
  });
});
