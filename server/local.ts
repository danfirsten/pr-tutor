import { basename } from "node:path";
import { run as defaultRun, type Run } from "./run.ts";
import type { FileStatus, Pr, PrFile } from "./types.ts";

export interface LocalOptions {
  dir: string;
  base?: string;
  branch?: string;
}

const GITHUB_REMOTE = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

export function parseRemote(url: string): { owner: string; repo: string } | null {
  const match = GITHUB_REMOTE.exec(url.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

export function parseGitDiff(diff: string): PrFile[] {
  return diff
    .split(/^diff --git /m)
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const lines = chunk.replace(/\n$/, "").split("\n");
      const hunkAt = lines.findIndex((l) => l.startsWith("@@"));
      const meta = hunkAt === -1 ? lines : lines.slice(0, hunkAt);
      const value = (prefix: string) => meta.find((l) => l.startsWith(prefix))?.slice(prefix.length).replace(/\t$/, "");
      const renamedFrom = value("rename from ");
      const oldPath = value("--- a/");
      const newPath = value("+++ b/") ?? value("rename to ") ?? oldPath ?? headerPath(lines[0]);
      const status: FileStatus = meta.some((l) => l.startsWith("new file mode"))
        ? "added"
        : meta.some((l) => l.startsWith("deleted file mode"))
          ? "removed"
          : renamedFrom
            ? "renamed"
            : "modified";
      const patch = hunkAt === -1 ? undefined : lines.slice(hunkAt).join("\n");
      const body = patch?.split("\n") ?? [];
      return {
        path: newPath,
        ...(renamedFrom ? { previousPath: renamedFrom } : {}),
        status,
        additions: body.filter((l) => l.startsWith("+")).length,
        deletions: body.filter((l) => l.startsWith("-")).length,
        ...(patch ? { patch } : {}),
      };
    });
}

function headerPath(header: string): string {
  const length = (header.length - 5) / 2;
  return header.slice(2, 2 + length);
}

export async function loadLocal({ dir, base, branch }: LocalOptions, run: Run = defaultRun): Promise<Pr> {
  const git = (...args: string[]) => run("git", ["-C", dir, ...args]).then((out) => out.trim());
  const top = await git("rev-parse", "--show-toplevel").catch(() => {
    throw new Error("This isn't a git repo. Run pr-tutor --local inside the repo you want to review.");
  });
  const name =
    branch ??
    (await git("symbolic-ref", "--short", "-q", "HEAD").catch(() => {
      throw new Error("HEAD isn't on a branch. Check out the branch you want to review.");
    }));
  const baseRef = base ?? (await defaultBase(git));
  const headSha = await git("rev-parse", "--verify", `refs/heads/${name}^{commit}`);
  const baseSha = await git("merge-base", baseRef, headSha).catch(() => {
    throw new Error(`Couldn't find where ${name} branched from ${baseRef}. Check the --base you passed.`);
  });
  if (baseSha === headSha) throw new Error(`${name} has no commits that aren't already on ${baseRef}.`);

  const [diff, log, remote] = await Promise.all([
    run("git", ["-C", dir, "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "-M", baseSha, headSha]),
    git("log", "--format=%an%x1f%B%x1e", `${baseSha}..${headSha}`),
    git("remote", "get-url", "origin").catch(() => ""),
  ]);
  const commits = log
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [author, message] = entry.split("\x1f");
      return { author, message: message.trim() };
    });
  const latest = commits[0];

  return {
    ...(parseRemote(remote) ?? { owner: "local", repo: basename(top) }),
    number: 0,
    branch: name,
    title: latest.message.split("\n")[0],
    body: commits.toReversed().map((c) => c.message).join("\n\n"),
    url: "",
    author: latest.author,
    baseSha,
    headSha,
    baseRef,
    headRef: name,
    files: parseGitDiff(diff),
    local: { dir: top },
  };
}

async function defaultBase(git: (...args: string[]) => Promise<string>): Promise<string> {
  const remoteHead = await git("symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD").catch(() => "");
  if (remoteHead) return remoteHead;
  for (const candidate of ["main", "master"]) {
    if (await git("rev-parse", "--verify", "-q", `refs/heads/${candidate}`).then(() => true, () => false)) return candidate;
  }
  throw new Error("Couldn't tell which branch this one is based on. Pass it with --base, for example --base origin/main.");
}

export function readLocalFile(dir: string, path: string, sha: string, run: Run = defaultRun): Promise<string> {
  return run("git", ["-C", dir, "show", `${sha}:${path}`]);
}

export async function hasUncommittedChanges(dir: string, run: Run = defaultRun): Promise<boolean> {
  return (await run("git", ["-C", dir, "status", "--porcelain", "--untracked-files=no"])).trim() !== "";
}
