import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Ask } from "./claude.ts";
import { createNotes, isLargePr } from "./notes.ts";
import { createStore } from "./store.ts";
import type { Pr, PrFile } from "./types.ts";

const patch = "@@ -1,2 +1,2 @@\n a\n-b\n+B";
const file = (path: string, extra: Partial<PrFile> = {}): PrFile => ({ path, status: "modified", additions: 1, deletions: 1, patch, ...extra });

const pr = (files: PrFile[]): Pr => ({
  owner: "acme", repo: "widgets", number: 1, title: "t", body: "", url: "", author: "a",
  baseSha: "b", headSha: "h1", baseRef: "main", headRef: "x", files,
});

const note = { hunkIndex: 0, summary: "s", checks: [], concerns: [], concept: null };

async function setup(answer: (ask: Ask) => Promise<unknown> = async () => ({ hunks: [note] }), root?: string) {
  const asked: string[] = [];
  const storeRoot = root ?? (await mkdtemp(join(tmpdir(), "pr-tutor-")));
  const notes = createNotes({
    claude: { ask: async <T,>(a: Ask) => { asked.push(a.prompt); return (await answer(a)) as T; } },
    store: createStore(storeRoot),
    readNewFile: async () => "a\nB",
  });
  return { notes, asked, storeRoot };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("notes", () => {
  it("generates notes for every file with a patch, and caches them on disk", async () => {
    const { notes, asked, storeRoot } = await setup();
    const p = pr([file("a.ts"), file("b.ts"), file("logo.png", { patch: undefined })]);
    notes.start(p);
    await settle();

    expect(notes.status(p)).toEqual({ "a.ts": { state: "done" }, "b.ts": { state: "done" }, "logo.png": { state: "none" } });
    expect(asked).toHaveLength(2);

    const restarted = await setup(async () => { throw new Error("should use the cache"); }, storeRoot);
    expect((await restarted.notes.get(p, "a.ts")).notes).toEqual({ hunks: [note] });
    expect(restarted.asked).toHaveLength(0);
  });

  it("waits for the user to open files on a large PR", async () => {
    const { notes, asked } = await setup();
    const big = pr(Array.from({ length: 61 }, (_, i) => file(`f${i}.ts`)));
    expect(isLargePr(big)).toBe(true);
    notes.start(big);
    await settle();
    expect(asked).toHaveLength(0);

    await notes.get(big, "f7.ts");
    await settle();
    expect(asked).toHaveLength(1);
    expect(notes.status(big)["f7.ts"]).toEqual({ state: "done" });
  });

  it("records a failure and can retry it", async () => {
    let fail = true;
    const { notes } = await setup(async () => {
      if (fail) throw new Error("boom");
      return { hunks: [note] };
    });
    const p = pr([file("a.ts")]);
    notes.start(p);
    await settle();
    expect(notes.status(p)["a.ts"]).toEqual({ state: "error", error: "boom" });

    fail = false;
    notes.retry(p, "a.ts");
    await settle();
    expect(notes.status(p)["a.ts"]).toEqual({ state: "done" });
  });

  it("drops notes for hunks that don't exist", async () => {
    const { notes } = await setup(async () => ({ hunks: [note, { ...note, hunkIndex: 9 }] }));
    const p = pr([file("a.ts")]);
    notes.start(p);
    await settle();
    expect((await notes.get(p, "a.ts")).notes?.hunks.map((h) => h.hunkIndex)).toEqual([0]);
  });
});

