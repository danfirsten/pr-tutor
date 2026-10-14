import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PrRef } from "./types.ts";

export type Store = ReturnType<typeof createStore>;

export function createStore(root = join(homedir(), ".pr-tutor")) {
  const reviewDir = (ref: PrRef) => join(root, "reviews", ref.owner, ref.repo, String(ref.number));

  return {
    root,
    reviewDir,
    readReviewJson: <T>(ref: PrRef, name: string) => readJson<T>(join(reviewDir(ref), name)),
    writeReviewJson: (ref: PrRef, name: string, value: unknown) => writeJson(join(reviewDir(ref), name), value),
  };
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n");
  await rename(temp, path);
}
