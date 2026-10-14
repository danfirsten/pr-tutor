import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CATEGORIES, type Category, type CategorySummary, type Miss } from "./types.ts";

export { CATEGORIES, type Category, type CategorySummary, type Miss };

const FILE = "learning-log.jsonl";

export async function appendMisses(root: string, misses: Miss[]): Promise<void> {
  if (!misses.length) return;
  await mkdir(root, { recursive: true });
  await appendFile(join(root, FILE), misses.map((m) => JSON.stringify(m)).join("\n") + "\n");
}

export async function readMisses(root: string): Promise<Miss[]> {
  let text: string;
  try {
    text = await readFile(join(root, FILE), "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line) as Miss] : [];
    } catch {
      return [];
    }
  });
}

export function summarise(misses: Miss[]): CategorySummary[] {
  return [...Map.groupBy(misses, (m) => m.category)]
    .map(([category, all]) => ({ category, count: all.length, latest: all.toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, 3) }))
    .toSorted((a, b) => b.count - a.count);
}

export function topMisses(misses: Miss[], limit = 3): Category[] {
  return summarise(misses)
    .filter((s) => s.count >= 2)
    .slice(0, limit)
    .map((s) => s.category);
}
