import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendMisses, readMisses, summarise, topMisses, type Miss } from "./learning.ts";

const miss = (category: Miss["category"], at: string, what = "x"): Miss => ({ at, owner: "o", repo: "r", number: 1, path: "a.ts", hunkIndex: 0, category, what });

describe("learning log", () => {
  it("appends misses as JSON lines and reads them back", async () => {
    const root = await mkdtemp(join(tmpdir(), "pr-tutor-"));
    await appendMisses(root, [miss("tests", "2026-10-01T00:00:00Z")]);
    await appendMisses(root, [miss("security", "2026-10-02T00:00:00Z")]);
    expect((await readFile(join(root, "learning-log.jsonl"), "utf8")).trim().split("\n")).toHaveLength(2);
    expect((await readMisses(root)).map((m) => m.category)).toEqual(["tests", "security"]);
  });

  it("reads an empty log when there isn't one, and skips broken lines", async () => {
    const root = await mkdtemp(join(tmpdir(), "pr-tutor-"));
    expect(await readMisses(root)).toEqual([]);
  });

  it("counts per category, most missed first, with the three latest examples", () => {
    const log = [
      miss("tests", "2026-10-01T00:00:00Z", "t1"),
      miss("tests", "2026-10-03T00:00:00Z", "t3"),
      miss("tests", "2026-10-02T00:00:00Z", "t2"),
      miss("tests", "2026-10-04T00:00:00Z", "t4"),
      miss("security", "2026-10-05T00:00:00Z", "s1"),
    ];
    const summary = summarise(log);
    expect(summary.map((s) => [s.category, s.count])).toEqual([["tests", 4], ["security", 1]]);
    expect(summary[0].latest.map((m) => m.what)).toEqual(["t4", "t3", "t2"]);
  });

  it("only treats a category as a habit after two misses", () => {
    expect(topMisses([miss("tests", "a"), miss("tests", "b"), miss("security", "c")])).toEqual(["tests"]);
  });
});
