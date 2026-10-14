import { run as defaultRun } from "./run.js";
export async function fetchPr(ref, run = defaultRun) {
    const repo = `${ref.owner}/${ref.repo}`;
    const [viewJson, filesJsonl] = await Promise.all([
        run("gh", ["pr", "view", String(ref.number), "-R", repo, "--json", "title,body,url,author,baseRefOid,headRefOid,baseRefName,headRefName"]),
        run("gh", ["api", "--paginate", `repos/${repo}/pulls/${ref.number}/files?per_page=100`, "--jq", ".[]"]),
    ]);
    const view = JSON.parse(viewJson);
    const files = filesJsonl.split("\n").filter(Boolean).map((line) => toPrFile(JSON.parse(line)));
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
function toPrFile(f) {
    return {
        path: f.filename,
        ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        ...(f.patch ? { patch: f.patch } : {}),
    };
}
export async function fetchFileAt(ref, path, sha, run = defaultRun) {
    return run("gh", ["api", "-H", "Accept: application/vnd.github.raw", `repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}?ref=${sha}`]);
}
