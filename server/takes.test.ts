import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMisses } from "./learning.ts";
import { createStore } from "./store.ts";
import { createTakes } from "./takes.ts";
import type { Pr } from "./types.ts";

const pr = {
  owner: "acme", repo: "widgets", number: 3, title: "t", headSha: "h1",
  files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }],
} as unknown as Pr;

async function setup(ask: () => Promise<unknown>) {
  const root = await mkdtemp(join(tmpdir(), "pr-tutor-"));
  const takes = createTakes({
    claude: { ask: ask as never },
    store: createStore(root),
    notesFor: async () => null,
    now: () => "2026-10-14T10:00:00Z",
  });
  return { root, takes };
}

describe("takes", () => {
  it("saves the take with Claude's comparison and logs each miss", async () => {
    const { root, takes } = await setup(async () => ({ line: "Close.", caught: ["Reads the rename right"], missed: [{ category: "tests", what: "No test for b" }] }));
    const take = await takes.submit(pr, "a.ts", 0, "Renames a to b");

    expect(take).toMatchObject({ take: "Renames a to b", comparison: { line: "Close." } });
    expect(await takes.list(pr)).toEqual({ "a.ts#0": take });
    expect(await readMisses(root)).toEqual([{ at: "2026-10-14T10:00:00Z", owner: "acme", repo: "widgets", number: 3, path: "a.ts", hunkIndex: 0, category: "tests", what: "No test for b" }]);
  });

  it("keeps the take when the comparison fails", async () => {
    const { takes } = await setup(async () => {
      throw new Error("offline");
    });
    const take = await takes.submit(pr, "a.ts", 0, "My guess");
    expect(take).toMatchObject({ take: "My guess", error: "offline" });
    expect((await takes.list(pr))["a.ts#0"].take).toBe("My guess");
  });

  it("refuses a hunk that doesn't exist", async () => {
    const { takes } = await setup(async () => ({}));
    await expect(takes.submit(pr, "a.ts", 5, "x")).rejects.toThrow(/hunk/);
  });
});
