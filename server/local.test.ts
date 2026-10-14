import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadLocal, parseGitDiff, parseRemote, readLocalFile } from "./local.ts";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1 @@
+export {};
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 4444444..0000000
--- a/old.txt
+++ /dev/null
@@ -1 +0,0 @@
-gone
diff --git a/docs/before.md b/docs/after.md
similarity index 100%
rename from docs/before.md
rename to docs/after.md
diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..5555555
Binary files /dev/null and b/logo.png differ
`;

describe("parseGitDiff", () => {
  it("turns a git diff into files shaped like GitHub's", () => {
    expect(parseGitDiff(DIFF)).toEqual([
      { path: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;" },
      { path: "src/new.ts", status: "added", additions: 1, deletions: 0, patch: "@@ -0,0 +1 @@\n+export {};" },
      { path: "old.txt", status: "removed", additions: 0, deletions: 1, patch: "@@ -1 +0,0 @@\n-gone" },
      { path: "docs/after.md", previousPath: "docs/before.md", status: "renamed", additions: 0, deletions: 0 },
      { path: "logo.png", status: "added", additions: 0, deletions: 0 },
    ]);
  });

  it("returns nothing for an empty diff", () => {
    expect(parseGitDiff("")).toEqual([]);
  });
});

describe("parseRemote", () => {
  it("reads owner and repo from GitHub https and ssh remotes", () => {
    expect(parseRemote("https://github.com/acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseRemote("git@github.com:acme/widgets.git")).toEqual({ owner: "acme", repo: "widgets" });
    expect(parseRemote("ssh://git@github.com/acme/widgets")).toEqual({ owner: "acme", repo: "widgets" });
  });

  it("returns null for anything else", () => {
    expect(parseRemote("")).toBeNull();
    expect(parseRemote("/some/local/path")).toBeNull();
  });
});

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), "pr-tutor-local-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", dir, "-c", "user.name=Sam", "-c", "user.email=sam@example.com", ...args], { encoding: "utf8" });
  git("init", "-q", "-b", "main");
  await writeFile(join(dir, "a.txt"), "one\ntwo\n");
  await writeFile(join(dir, "gone.txt"), "bye\n");
  git("add", ".");
  git("commit", "-q", "-m", "Start");
  git("checkout", "-q", "-b", "feature/thing");
  await writeFile(join(dir, "a.txt"), "one\nTWO\n");
  await rm(join(dir, "gone.txt"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "new.ts"), "export {};\n");
  git("add", "-A");
  git("commit", "-q", "-m", "Change a and add new", "-m", "Because reasons.");
  await writeFile(join(dir, "a.txt"), "one\nTWO\nthree\n");
  git("commit", "-q", "-am", "Add three");
  return { dir, git };
}

describe("loadLocal", () => {
  it("builds a snapshot of the branch against its base", async () => {
    const { dir, git } = await repo();
    const pr = await loadLocal({ dir, base: "main" });

    expect(pr).toMatchObject({
      owner: "local",
      number: 0,
      branch: "feature/thing",
      title: "Add three",
      author: "Sam",
      url: "",
      baseRef: "main",
      headRef: "feature/thing",
      headSha: git("rev-parse", "HEAD").trim(),
      baseSha: git("rev-parse", "main").trim(),
    });
    expect(pr.local?.dir).toBe(git("rev-parse", "--show-toplevel").trim());
    expect(pr.body).toContain("Change a and add new");
    expect(pr.body).toContain("Because reasons.");
    expect(pr.files.map((f) => [f.path, f.status])).toEqual([
      ["a.txt", "modified"],
      ["gone.txt", "removed"],
      ["src/new.ts", "added"],
    ]);
  });

  it("reads the named branch even when another one is checked out", async () => {
    const { dir, git } = await repo();
    const head = git("rev-parse", "HEAD").trim();
    git("checkout", "-q", "main");
    const pr = await loadLocal({ dir, base: "main", branch: "feature/thing" });
    expect(pr.headSha).toBe(head);
    expect(pr.files).toHaveLength(3);
  });

  it("takes owner and repo from a GitHub origin", async () => {
    const { dir, git } = await repo();
    git("remote", "add", "origin", "git@github.com:acme/widgets.git");
    expect(await loadLocal({ dir, base: "main" })).toMatchObject({ owner: "acme", repo: "widgets" });
  });

  it("says so when the branch has nothing new", async () => {
    const { dir, git } = await repo();
    git("checkout", "-q", "main");
    await expect(loadLocal({ dir, base: "main" })).rejects.toThrow(/no commits/i);
  });

  it("asks for --base when it can't work one out", async () => {
    const { dir, git } = await repo();
    git("branch", "-q", "-m", "main", "trunk");
    await expect(loadLocal({ dir })).rejects.toThrow(/--base/);
  });

  it("reads a file as it was at a commit", async () => {
    const { dir, git } = await repo();
    expect(await readLocalFile(dir, "a.txt", git("rev-parse", "main").trim())).toBe("one\ntwo\n");
  });
});
