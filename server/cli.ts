#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { cp } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { fetchFileAt, fetchPr } from "./gh.ts";
import { hasUncommittedChanges, loadLocal, readLocalFile } from "./local.ts";
import { parsePrRef, refLabel } from "./prRef.ts";
import { run } from "./run.ts";
import { createClaude } from "./claude.ts";
import { createNotes } from "./notes.ts";
import { createBriefings } from "./briefing.ts";
import { coach } from "./coach.ts";
import { readMisses, topMisses } from "./learning.ts";
import { createTakes } from "./takes.ts";
import { createAsks } from "./asks.ts";
import { createStore, readJson, type Store } from "./store.ts";
import type { Pr, PrRef } from "./types.ts";

const FIRST_PORT = Number(process.env.PR_TUTOR_PORT ?? 4517);
const here = dirname(fileURLToPath(import.meta.url));
const webDir = [join(here, "..", "dist", "web"), join(here, "..", "web")].find((dir) => existsSync(join(dir, "index.html")));

async function installSkill() {
  const from = [join(here, "..", "skills"), join(here, "..", "..", "skills")].find((dir) => existsSync(dir));
  if (!from) throw new Error("Couldn't find the skills folder next to pr-tutor.");
  const to = join(homedir(), ".claude", "skills");
  await cp(from, to, { recursive: true });
  console.log(`Installed the pr-tutor-review skill to ${join(to, "pr-tutor-review")}.\nIn Claude Code, say "look over my review of owner/repo#123".`);
}

const USAGE = `Usage: pr-tutor <https://github.com/owner/repo/pull/123 | owner/repo#123>
       pr-tutor --local [--base <branch>]   review the current branch before pushing it
       pr-tutor install-skill`;

function argAfter(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function loadLocalRef(store: Store): Promise<PrRef> {
  const dir = process.cwd();
  const pr = await loadLocal({ dir, base: argAfter("--base") });
  await store.writeReviewJson(pr, "pr.json", pr);
  if (await hasUncommittedChanges(dir)) console.warn("Uncommitted changes aren't in the review. Commit them first to include them.");
  return pr;
}

async function reloadLocal(store: Store, ref: PrRef): Promise<Pr> {
  const saved = await store.readReviewJson<Pr>(ref, "pr.json");
  if (!saved?.local) throw new Error(`No local review for ${refLabel(ref)}. Run pr-tutor --local in that repo.`);
  return loadLocal({ dir: saved.local.dir, base: saved.baseRef, branch: ref.branch });
}

async function main() {
  if (process.argv[2] === "install-skill") return installSkill();
  const local = process.argv.includes("--local");
  const store = createStore();
  if (!webDir) {
    console.error("The page hasn't been built. Run `npm run build` in the pr-tutor folder.");
    process.exit(1);
  }
  let ref: PrRef | null;
  if (local) {
    ref = await loadLocalRef(store);
  } else {
    ref = parsePrRef(process.argv[2] ?? "");
    if (!ref) {
      console.error(USAGE);
      process.exit(1);
    }
    try {
      await run("gh", ["auth", "status"]);
    } catch (error) {
      console.error(`gh isn't ready: ${error instanceof Error ? error.message : error}\nInstall the GitHub CLI and run \`gh auth login\`.`);
      process.exit(1);
    }
  }

  const settings = (await readJson<{ model?: string }>(join(store.root, "settings.json"))) ?? {};
  const claude = createClaude({ cwd: tmpdir(), model: settings.model });
  const notes = createNotes({
    claude,
    store,
    readNewFile: (pr, file) => fileAt(pr, file.path, pr.headSha),
    focus: async () => topMisses(await readMisses(store.root)),
  });
  const takes = createTakes({ claude, store, notesFor: notes.cached });
  const asks = createAsks({ claude, store, readNewFile: (pr, file) => fileAt(pr, file.path, pr.headSha) });
  const briefings = createBriefings({ claude, store });
  const port = await listen(createApp({ store, fetchPr: (r) => (r.branch ? reloadLocal(store, r) : fetchPr(r)), fetchFileAt: fileAt, notes, briefings, coach: (pr, comment) => coach(claude, pr, comment), takes, asks, webDir }));
  const url = `http://localhost:${port}/?${ref.branch ? `local=${ref.owner}/${ref.repo}/${encodeURIComponent(ref.branch)}` : `pr=${ref.owner}/${ref.repo}/${ref.number}`}`;
  console.log(`pr-tutor: ${url}`);
  if (!process.argv.includes("--no-open")) openBrowser(url);
}

function fileAt(pr: Pr, path: string, sha: string): Promise<string> {
  return pr.local ? readLocalFile(pr.local.dir, path, sha) : fetchFileAt(pr, path, sha);
}

async function listen(handler: ReturnType<typeof createApp>): Promise<number> {
  for (let port = FIRST_PORT; port < FIRST_PORT + 10; port++) {
    if (await isPrTutor(port)) return port;
    const bound = await new Promise<boolean>((resolve) => {
      const server = createServer(handler);
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => resolve(true));
    });
    if (bound) return port;
  }
  throw new Error(`No free port between ${FIRST_PORT} and ${FIRST_PORT + 9}`);
}

async function isPrTutor(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(500) });
    return ((await res.json()) as { app?: string }).app === "pr-tutor";
  } catch {
    return false;
  }
}

function openBrowser(url: string) {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd, args, () => {});
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
