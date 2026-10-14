import { run as defaultRun, type Run } from "./run.ts";
import type { FileStatus, Pr, PrFile, PrRef } from "./types.ts";

interface GhView {
  title: string;
  body: string;
  url: string;
  author: { login: string };
  baseRefOid: string;
  headRefOid: string;
  baseRefName: string;
  headRefName: string;
}

interface GhFile {
  filename: string;
  previous_filename?: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  patch?: string | null;
}

export async function fetchPr(ref: PrRef, run: Run = defaultRun): Promise<Pr> {
  const repo = `${ref.owner}/${ref.repo}`;
  const [viewJson, filesJsonl] = await Promise.all([
    run("gh", ["pr", "view", String(ref.number), "-R", repo, "--json", "title,body,url,author,baseRefOid,headRefOid,baseRefName,headRefName"]),
    run("gh", ["api", "--paginate", `repos/${repo}/pulls/${ref.number}/files?per_page=100`, "--jq", ".[]"]),
  ]);
  const view = JSON.parse(viewJson) as GhView;
  const files = filesJsonl.split("\n").filter(Boolean).map((line) => toPrFile(JSON.parse(line) as GhFile));

  return {
    ...ref,
    title: view.title,
    body: view.body,
    url: view.url,
    author: view.author.login,
    baseSha: view.baseRefOid,
    headSha: view.headRefOid,
    baseRef: view.baseRefName,
    headRef: view.headRefName,
    files,
  };
}

function toPrFile(f: GhFile): PrFile {
  return {
    path: f.filename,
    ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    ...(f.patch ? { patch: f.patch } : {}),
  };
}

export async function fetchFileAt(ref: PrRef, path: string, sha: string, run: Run = defaultRun): Promise<string> {
  return run("gh", ["api", "-H", "Accept: application/vnd.github.raw", `repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}?ref=${sha}`]);
}
