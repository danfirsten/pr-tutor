import { describe, expect, it } from "vitest";
import type { HunkRow } from "../../server/patch.ts";
import type { Concern } from "../../server/prompts/notes.ts";
import { aboutConcern, aboutLines } from "./askTarget.ts";

const row = (side: HunkRow["side"], line: number, changed = true): HunkRow => ({ side, line, changed });

describe("aboutLines", () => {
  const rows = [row("RIGHT", 10, false), row("LEFT", 11), row("RIGHT", 11), row("RIGHT", 12), row("RIGHT", 13, false)];

  it("asks about the one cursor line", () => {
    expect(aboutLines("a.ts", rows, [3, 3])).toEqual({ path: "a.ts", line: 12, side: "RIGHT" });
  });

  it("asks about a stretch of lines, on the side the stretch ends on", () => {
    expect(aboutLines("a.ts", rows, [1, 3])).toEqual({ path: "a.ts", start_line: 11, line: 12, side: "RIGHT" });
  });

  it("asks about a removed line on the old side", () => {
    expect(aboutLines("a.ts", rows, [1, 1])).toEqual({ path: "a.ts", line: 11, side: "LEFT" });
  });

  it("asks about the whole hunk when there's no cursor", () => {
    expect(aboutLines("a.ts", rows, null)).toEqual({ path: "a.ts", start_line: 10, line: 13, side: "RIGHT" });
  });

  it("finds nothing to ask about in an empty hunk", () => {
    expect(aboutLines("a.ts", [], null)).toBeNull();
  });
});

describe("aboutConcern", () => {
  it("pins the question to the concern's line and keeps the concern", () => {
    const concern: Concern = { line: 4, side: "old", severity: "nit", text: "t", why: "w" };
    expect(aboutConcern("a.ts", concern)).toEqual({ path: "a.ts", line: 4, side: "LEFT", concern });
  });
});
