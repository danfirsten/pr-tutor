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
  const app = createApp({
    store: createStore(await mkdtemp(join(tmpdir(), "pr-tutor-"))),
    fetchPr: async () => pr,
    fetchFileAt: async (_ref, path, sha) => {
      reads.push(`${path}@${sha}`);
      return `${path} at ${sha}`;
    },
    notes: { start() {}, status: () => ({}), get: async () => ({ state: "none" as const }), retry() {} },
    webDir: "/nonexistent",
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  return { base: `http://localhost:${port}`, reads };
}

const q = "owner=acme&repo=widgets&number=42";

describe("app", () => {
  it("returns both sides of a changed file, and only the new side of an added one", async () => {
    const { base, reads } = await start();
    expect(await (await fetch(`${base}/api/file?${q}&path=src/a.ts`)).json()).toEqual({ old: "src/a.ts at base", new: "src/a.ts at head" });
    expect(await (await fetch(`${base}/api/file?${q}&path=src/new.ts`)).json()).toEqual({ old: null, new: "src/new.ts at head" });
    expect(reads).not.toContain("src/new.ts@base");
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

  it("refuses requests from another site", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/api/health`, { headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/api/health`, { headers: { origin: base } })).status).toBe(200);
  });
});
