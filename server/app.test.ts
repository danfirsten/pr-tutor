import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { createStore } from "./store.ts";
import type { Pr } from "./types.ts";

const pr: Pr = {
  owner: "acme", repo: "widgets", number: 42, title: "t", body: "", url: "", author: "sam",
  baseSha: "base", headSha: "head", baseRef: "main", headRef: "x",
  files: [
    { path: "src/a.ts", status: "modified", additions: 1, deletions: 1 },
    { path: "src/new.ts", status: "added", additions: 1, deletions: 0 },
  ],
};

let server: Server;
afterEach(() => server?.close());

async function start() {
  const reads: string[] = [];
  const fetched: string[] = [];
  const app = createApp({
    store: createStore(await mkdtemp(join(tmpdir(), "pr-tutor-"))),
    fetchPr: async (ref) => {
      fetched.push(ref.branch ?? String(ref.number));
      return ref.branch ? { ...pr, number: 0, branch: ref.branch, local: { dir: "/repo" } } : pr;
    },
    fetchFileAt: async (from, path, sha) => {
      reads.push(`${from.local ? "git" : "gh"}:${path}@${sha}`);
      return `${path} at ${sha}`;
    },
    notes: { start() {}, status: () => ({}), get: async () => ({ state: "none" as const }), retry() {} },
    briefings: { get: async () => ({ state: "none" as const }) },
    takes: { list: async () => ({}), submit: async () => { throw new Error("unused"); } },
    coach: async () => ({ rewrite: "", label: "nit" as const, tips: [], accurate: "yes" as const, accuracyNote: "" }),
    webDir: "/nonexistent",
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { base: `http://localhost:${port}`, reads, fetched };
}

const q = "owner=acme&repo=widgets&number=42";

describe("app", () => {
  it("returns both sides of a changed file, and only the new side of an added one", async () => {
    const { base, reads } = await start();
    expect(await (await fetch(`${base}/api/file?${q}&path=src/a.ts`)).json()).toEqual({ old: "src/a.ts at base", new: "src/a.ts at head" });
    expect(await (await fetch(`${base}/api/file?${q}&path=src/new.ts`)).json()).toEqual({ old: null, new: "src/new.ts at head" });
    expect(reads).not.toContain("gh:src/new.ts@base");
  });

  it("loads a local branch by name and reads its files through the snapshot", async () => {
    const { base, reads, fetched } = await start();
    const local = "owner=acme&repo=widgets&branch=feature%2Fx";
    expect(await (await fetch(`${base}/api/pr?${local}`)).json()).toMatchObject({ number: 0, branch: "feature/x" });
    await fetch(`${base}/api/file?${local}&path=src/a.ts`);
    expect(reads).toContain("git:src/a.ts@head");
    await fetch(`${base}/api/pr?${q}`);
    expect(fetched).toEqual(["feature/x", "42"]);
  });

  it("won't read a path that isn't in the PR", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/file?${q}&path=../../etc/passwd`)).status).toBe(404);
  });

  it("saves and returns reviewed files", async () => {
    const { base } = await start();
    expect(await (await fetch(`${base}/api/state?${q}`)).json()).toEqual({ reviewed: [] });
    await fetch(`${base}/api/state?${q}`, { method: "PUT", body: JSON.stringify({ reviewed: ["src/a.ts", 7] }) });
    expect(await (await fetch(`${base}/api/state?${q}`)).json()).toEqual({ reviewed: ["src/a.ts"] });
  });

  it("remembers the take-first setting and ignores anything else sent with it", async () => {
    const { base } = await start();
    expect(await (await fetch(`${base}/api/settings`)).json()).toEqual({});
    await fetch(`${base}/api/settings`, { method: "PUT", body: JSON.stringify({ takeFirst: true, model: "evil" }) });
    expect(await (await fetch(`${base}/api/settings`)).json()).toEqual({ takeFirst: true });
  });

  it("refuses requests from another site", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/health`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/health`, { headers: { origin: base } })).status).toBe(200);
  });
});
