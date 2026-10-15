import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAsks } from "./asks.ts";
import type { Ask } from "./claude.ts";
import { createStore } from "./store.ts";
import type { Pr } from "./types.ts";

const pr = {
  owner: "acme", repo: "widgets", number: 3, title: "Add retries", body: "Retries flaky calls.", headSha: "h1",
  files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1,2 +1,2 @@\n keep()\n-old()\n+retry(3)" }],
} as unknown as Pr;

async function setup(answer: (call: Ask) => Promise<unknown>) {
  const calls: Ask[] = [];
  let n = 0;
  const asks = createAsks({
    claude: { ask: (async (call: Ask) => (calls.push(call), answer(call))) as never },
    store: createStore(await mkdtemp(join(tmpdir(), "pr-tutor-"))),
    readNewFile: async () => "keep()\nretry(3)\n",
    now: () => "2026-10-15T10:00:00Z",
    newId: () => `t${++n}`,
  });
  return { asks, calls };
}

const onLine = { path: "a.ts", line: 2, side: "RIGHT" as const };

describe("asks", () => {
  it("answers a question about a line and saves the thread", async () => {
    const { asks, calls } = await setup(async () => ({ answer: "It retries three times." }));
    const thread = await asks.submit(pr, { ...onLine, question: "What does retry(3) do?" });

    expect(thread).toMatchObject({ id: "t1", path: "a.ts", line: 2, side: "RIGHT", headSha: "h1", turns: [{ question: "What does retry(3) do?", answer: "It retries three times." }] });
    expect(await asks.list(pr)).toEqual([thread]);
    expect(calls[0].prompt).toContain("+retry(3)");
    expect(calls[0].prompt).toContain("line 2");
    expect(calls[0].prompt).toContain("Retries flaky calls.");
    expect(calls[0].prompt).toContain("2 | retry(3)");
  });

  it("includes the concern when the question is about one", async () => {
    const { asks, calls } = await setup(async () => ({ answer: "Because it can loop." }));
    const concern = { line: 2, side: "new" as const, severity: "should-fix" as const, text: "No backoff.", why: "Hammers the server." };
    const thread = await asks.submit(pr, { ...onLine, concern, question: "Why is that bad?" });

    expect(thread.concern).toEqual(concern);
    expect(calls[0].prompt).toContain("No backoff.");
    expect(calls[0].prompt).toContain("Hammers the server.");
  });

  it("adds a follow-up to the thread with the earlier turns as context", async () => {
    const { asks, calls } = await setup(async (call) => ({ answer: call.prompt.includes("And if it fails?") ? "It throws." : "It retries." }));
    const first = await asks.submit(pr, { ...onLine, question: "What does it do?" });
    const second = await asks.submit(pr, { threadId: first.id, question: "And if it fails?" });

    expect(second.id).toBe(first.id);
    expect(second.turns.map((t) => t.answer)).toEqual(["It retries.", "It throws."]);
    expect(calls[1].prompt).toContain("What does it do?");
    expect(calls[1].prompt).toContain("It retries.");
    expect(await asks.list(pr)).toHaveLength(1);
  });

  it("keeps the question when Claude fails", async () => {
    const { asks } = await setup(async () => {
      throw new Error("offline");
    });
    const thread = await asks.submit(pr, { ...onLine, question: "What?" });
    expect(thread.turns).toEqual([{ question: "What?", at: "2026-10-15T10:00:00Z", error: "offline" }]);
    expect((await asks.list(pr))[0].turns[0].error).toBe("offline");
  });

  it("refuses an empty question, an unknown file or an unknown thread", async () => {
    const { asks } = await setup(async () => ({ answer: "" }));
    await expect(asks.submit(pr, { ...onLine, question: "  " })).rejects.toThrow(/question/);
    await expect(asks.submit(pr, { ...onLine, path: "nope.ts", question: "x" })).rejects.toThrow(/file/);
    await expect(asks.submit(pr, { threadId: "missing", question: "x" })).rejects.toThrow(/thread/);
  });
});
