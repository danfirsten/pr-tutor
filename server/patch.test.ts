import { describe, expect, it } from "vitest";
import { fullFileRows, hunkPatch, hunkRows, hunkSize, lineCount, splitHunks } from "./patch.ts";

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

describe("hunkRows", () => {
  it("lists every line a cursor can land on, with the side and number GitHub expects", () => {
    const [hunk] = splitHunks("@@ -10,3 +10,3 @@\n ten\n-eleven\n+ELEVEN\n\\ No newline at end of file\n twelve");
    expect(hunkRows(hunk)).toEqual([
      { side: "RIGHT", line: 10, changed: false },
      { side: "LEFT", line: 11, changed: true },
      { side: "RIGHT", line: 11, changed: true },
      { side: "RIGHT", line: 12, changed: false },
    ]);
  });
});

describe("fullFileRows", () => {
  const hunks = splitHunks(["@@ -2,2 +2,3 @@", " b", "-c", "+C", "+D", "@@ -9,1 +10,1 @@", "-x", "+X"].join("\n"));

  it("fills unchanged lines around and between hunks, keeping removed lines in place", () => {
    const rows = fullFileRows(hunks, 11);
    expect(rows.map((r) => `${r.side === "LEFT" ? "-" : r.changed ? "+" : " "}${r.line}`)).toEqual([
      " 1", " 2", "-3", "+3", "+4", " 5", " 6", " 7", " 8", " 9", "-9", "+10", " 11",
    ]);
  });

  it("is just the hunk rows for a deleted file", () => {
    const deleted = splitHunks(["@@ -1,2 +0,0 @@", "-a", "-b"].join("\n"));
    expect(fullFileRows(deleted, 0)).toEqual([
      { side: "LEFT", line: 1, changed: true },
      { side: "LEFT", line: 2, changed: true },
    ]);
  });
});

describe("lineCount", () => {
  it("ignores the trailing newline", () => {
    expect(lineCount("a\nb\n")).toBe(2);
    expect(lineCount("a\nb")).toBe(2);
    expect(lineCount(null)).toBe(0);
  });
});

describe("hunkSize", () => {
  it("counts added and removed lines", () => {
    expect(hunkSize(splitHunks("@@ -1,2 +1,2 @@\n a\n-b\n+B\n+C")[0])).toEqual({ additions: 2, deletions: 1 });
  });
});
