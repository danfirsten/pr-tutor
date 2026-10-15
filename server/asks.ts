import type { Claude } from "./claude.ts";
import { hunkFor, splitHunks } from "./patch.ts";
import { askPrompt, askSchema, askSystem, type Question, type Thread } from "./prompts/ask.ts";
import type { Store } from "./store.ts";
import type { Pr, PrFile } from "./types.ts";

export type { Question, Thread, Turn } from "./prompts/ask.ts";

interface Deps {
  claude: Pick<Claude, "ask">;
  store: Store;
  readNewFile: (pr: Pr, file: PrFile) => Promise<string | null>;
  now?: () => string;
  newId?: () => string;
}

const FILE = "asks.json";

export function createAsks({ claude, store, readNewFile, now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }: Deps) {
  const all = async (pr: Pr) => (await store.readReviewJson<Thread[]>(pr, FILE)) ?? [];

  async function save(pr: Pr, thread: Thread) {
    const threads = await all(pr);
    const at = threads.findIndex((t) => t.id === thread.id);
    await store.writeReviewJson(pr, FILE, at === -1 ? [...threads, thread] : threads.with(at, thread));
  }

  async function startOrFind(pr: Pr, q: Question): Promise<Thread> {
    if ("threadId" in q) {
      const found = (await all(pr)).find((t) => t.id === q.threadId);
      if (!found) throw new Error("That thread isn't saved for this PR");
      return found;
    }
    if (!pr.files.some((f) => f.path === q.path)) throw new Error("That file isn't in this PR");
    const { question: _, ...where } = q;
    return { id: newId(), ...where, headSha: pr.headSha, turns: [] };
  }

  return {
    list: all,

    async submit(pr: Pr, q: Question): Promise<Thread> {
      const question = q.question?.trim();
      if (!question) throw new Error("Write a question first");
      const thread = await startOrFind(pr, q);
      const file = pr.files.find((f) => f.path === thread.path)!;
      const hunk = hunkFor(splitHunks(file.patch), thread);
      const newFile = file.status === "removed" ? null : await readNewFile(pr, file).catch(() => null);
      const prompt = askPrompt(pr, thread, hunk, newFile, question);
      const turn = { question, at: now() };

      try {
        const { answer } = await claude.ask<{ answer: string }>({ system: askSystem, prompt, schema: askSchema });
        const done = { ...thread, turns: [...thread.turns, { ...turn, answer }] };
        await save(pr, done);
        return done;
      } catch (error) {
        const failed = { ...thread, turns: [...thread.turns, { ...turn, error: (error as Error).message }] };
        await save(pr, failed);
        return failed;
      }
    },
  };
}
