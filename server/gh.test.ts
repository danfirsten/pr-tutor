import { describe, expect, it } from "vitest";
import { fetchPr } from "./gh.ts";
import type { Run } from "./run.ts";

const view = {
  title: "Fix the thing",
  body: "Because it broke",
  url: "https://github.com/acme/widgets/pull/42",
  author: { login: "sam" },
  baseRefOid: "base123",
  headRefOid: "head456",
  baseRefName: "main",
  headRefName: "fix-thing",
};

const files = [
  { filename: "src/a.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
  { filename: "src/new-name.ts", previous_filename: "src/old-name.ts", status: "renamed", additions: 0, deletions: 0 },
];

function fakeGh(calls: string[][]): Run {
  return async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "pr") return JSON.stringify(view);
    return files.map((f) => JSON.stringify(f)).join("\n") + "\n";
  };
}

describe("fetchPr", () => {
  it("maps gh output to a Pr", async () => {
    const calls: string[][] = [];
    const pr = await fetchPr({ owner: "acme", repo: "widgets", number: 42 }, fakeGh(calls));

    expect(pr).toMatchObject({ owner: "acme", repo: "widgets", number: 42, title: "Fix the thing", author: "sam", baseSha: "base123", headSha: "head456" });
    expect(pr.files).toEqual([
      { path: "src/a.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
      { path: "src/new-name.ts", previousPath: "src/old-name.ts", status: "renamed", additions: 0, deletions: 0 },
    ]);
  });

  it("asks gh for the right repo and pages through every file", async () => {
    const calls: string[][] = [];
    await fetchPr({ owner: "acme", repo: "widgets", number: 42 }, fakeGh(calls));

    expect(calls[0]).toContain("acme/widgets");
    expect(calls[1]).toEqual(expect.arrayContaining(["api", "--paginate", "repos/acme/widgets/pulls/42/files?per_page=100"]));
  });
});
