import type { Claude } from "./claude.ts";
import { appendMisses } from "./learning.ts";
import { splitHunks } from "./patch.ts";
import { comparePrompt, compareSchema, compareSystem, type Comparison } from "./prompts/compare.ts";
import type { FileNotes } from "./prompts/notes.ts";
import type { Store } from "./store.ts";
import type { Pr, Take } from "./types.ts";

export type { Take };

interface Deps {
  claude: Pick<Claude, "ask">;
  store: Store;
  notesFor: (pr: Pr, path: string) => Promise<FileNotes | null>;
  now?: () => string;
}

const FILE = "takes.json";

export function createTakes({ claude, store, notesFor, now = () => new Date().toISOString() }: Deps) {
  const all = async (pr: Pr) => (await store.readReviewJson<Take[]>(pr, FILE)) ?? [];

  async function save(pr: Pr, take: Take) {
    const others = (await all(pr)).filter((t) => !(t.headSha === take.headSha && t.path === take.path && t.hunkIndex === take.hunkIndex));
    await store.writeReviewJson(pr, FILE, [...others, take]);
  }

  return {
    async list(pr: Pr): Promise<Record<string, Take>> {
      return Object.fromEntries((await all(pr)).filter((t) => t.headSha === pr.headSha).map((t) => [`${t.path}#${t.hunkIndex}`, t]));
    },

    async submit(pr: Pr, path: string, hunkIndex: number, text: string): Promise<Take> {
      const hunk = splitHunks(pr.files.find((f) => f.path === path)?.patch)[hunkIndex];
      if (!hunk) throw new Error("That hunk isn't in this PR");
      const take: Take = { path, hunkIndex, headSha: pr.headSha, take: text, at: now() };
      await save(pr, take);

      try {
        const note = (await notesFor(pr, path))?.hunks.find((h) => h.hunkIndex === hunkIndex);
        const comparison = await claude.ask<Comparison>({ system: compareSystem, prompt: comparePrompt(pr, path, hunk, text, note), schema: compareSchema });
        const done = { ...take, comparison };
        await save(pr, done);
        await appendMisses(
          store.root,
          comparison.missed.map((m) => ({ at: take.at, owner: pr.owner, repo: pr.repo, number: pr.number, path, hunkIndex, category: m.category, what: m.what })),
        );
        return done;
      } catch (error) {
        const failed = { ...take, error: (error as Error).message };
        await save(pr, failed);
        return failed;
      }
    },
  };
}
