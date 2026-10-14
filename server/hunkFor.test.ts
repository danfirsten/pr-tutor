import { describe, expect, it } from "vitest";
import { hunkFor, splitHunks } from "./patch.ts";

const hunks = splitHunks(["@@ -1,2 +1,2 @@", " a", "-b", "+B", "@@ -20,2 +20,3 @@", " t", "+u", " v"].join("\n"));

describe("hunkFor", () => {
  it("finds the hunk a new-side line is in", () => {
    expect(hunkFor(hunks, { line: 21, side: "RIGHT" })?.index).toBe(1);
  });

  it("finds the hunk an old-side line is in", () => {
    expect(hunkFor(hunks, { line: 2, side: "LEFT" })?.index).toBe(0);
  });

  it("returns undefined outside every hunk", () => {
    expect(hunkFor(hunks, { line: 99, side: "RIGHT" })).toBeUndefined();
  });
});
