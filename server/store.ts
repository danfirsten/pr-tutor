import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { PrRef } from "./types.ts";

export type Store = ReturnType<typeof createStore>;

export function createStore(root = join(homedir(), ".pr-tutor")) {
  const reviewDir = (ref: PrRef) =>
    ref.branch
      ? join(root, "reviews", ref.owner, ref.repo, "local", encodeURIComponent(ref.branch).replace(/^\./, "%2E"))
      : join(root, "reviews", ref.owner, ref.repo, String(ref.number));

  return {
    root,
    reviewDir,
    readReviewJson: <T>(ref: PrRef, name: string) => readJson<T>(join(reviewDir(ref), name)),
    writeReviewJson: (ref: PrRef, name: string, value: unknown) => writeJson(join(reviewDir(ref), name), value),
    writeReviewText: (ref: PrRef, name: string, text: string) => writeText(join(reviewDir(ref), name), text),
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
  await writeText(path, JSON.stringify(value, null, 2) + "\n");
}

let writes = 0;

export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${++writes}.tmp`;
  await writeFile(temp, text);
  await rename(temp, path);
}
