import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStore } from "./store.ts";

const ref = { owner: "acme", repo: "widgets", number: 42 };

describe("store", () => {
  it("keeps each review in its own owner/repo/number folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "pr-tutor-"));
    expect(createStore(root).reviewDir(ref)).toBe(join(root, "reviews", "acme", "widgets", "42"));
  });

  it("round-trips JSON and leaves no temp files behind", async () => {
    const root = await mkdtemp(join(tmpdir(), "pr-tutor-"));
    const store = createStore(root);
    await store.writeReviewJson(ref, "pr.json", { a: 1 });

    expect(await store.readReviewJson(ref, "pr.json")).toEqual({ a: 1 });
    expect(await readdir(store.reviewDir(ref))).toEqual(["pr.json"]);
    expect(JSON.parse(await readFile(join(store.reviewDir(ref), "pr.json"), "utf8"))).toEqual({ a: 1 });
  });

  it("returns null for a file that doesn't exist yet", async () => {
    const store = createStore(await mkdtemp(join(tmpdir(), "pr-tutor-")));
    expect(await store.readReviewJson(ref, "review.json")).toBeNull();
  });
});
