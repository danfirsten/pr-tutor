import { createHash } from "node:crypto";
import { ClaudeLoginError, type Claude } from "./claude.ts";
import { isNoise } from "./noise.ts";
import { splitHunks } from "./patch.ts";
import { NOTES_VERSION, notesPrompt, notesSchema, notesSystem, type FileNotes } from "./prompts/notes.ts";
import type { Store } from "./store.ts";
import type { NoteState, Pr, PrFile } from "./types.ts";

export type { NoteState };


interface Deps {
  claude: Pick<Claude, "ask">;
  store: Store;
  readNewFile: (pr: Pr, file: PrFile) => Promise<string | null>;
  focus?: () => Promise<string[]>;
}

const AT_ONCE = 3;

export function isLargePr(pr: Pr): boolean {
  const changed = pr.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  return pr.files.length > 60 || changed > 3000;
}

export function createNotes({ claude, store, readNewFile, focus = async () => [] }: Deps) {
  const states = new Map<string, NoteState>();
  const pending: Array<{ key: string; pr: Pr; file: PrFile }> = [];
  let running = 0;

  const keyOf = (pr: Pr, path: string) => `${pr.owner}/${pr.repo}#${pr.number}@${pr.headSha}:${path}`;
  const cacheName = (pr: Pr, path: string) => `cache/${pr.headSha}/notes-v${NOTES_VERSION}/${createHash("sha1").update(path).digest("hex").slice(0, 16)}.json`;

  const stateOf = (pr: Pr, file: PrFile): NoteState => (file.patch ? (states.get(keyOf(pr, file.path)) ?? { state: "idle" }) : { state: "none" });

  async function generate(pr: Pr, file: PrFile) {
    const hunks = splitHunks(file.patch);
    const newContents = file.status === "removed" ? null : await readNewFile(pr, file).catch(() => null);
    const habits = await focus().catch(() => []);
    const notes = await claude.ask<FileNotes>({ system: notesSystem, prompt: notesPrompt(pr, file, hunks, newContents, habits), schema: notesSchema });
    const clean: FileNotes = { hunks: notes.hunks.filter((h) => h.hunkIndex >= 0 && h.hunkIndex < hunks.length) };
    await store.writeReviewJson(pr, cacheName(pr, file.path), clean);
  }

  function pump() {
    while (running < AT_ONCE && pending.length) {
      const job = pending.shift()!;
      running++;
      states.set(job.key, { state: "running" });
      generate(job.pr, job.file)
        .then(
          () => states.set(job.key, { state: "done" }),
          (error: Error) => states.set(job.key, { state: "error", error: error.message, ...(error instanceof ClaudeLoginError ? { login: true } : {}) }),
        )
        .finally(() => {
          running--;
          pump();
        });
    }
  }

  async function enqueue(pr: Pr, file: PrFile, first = false) {
    const key = keyOf(pr, file.path);
    const current = stateOf(pr, file).state;
    if (current === "queued" && first) {
      const at = pending.findIndex((job) => job.key === key);
      if (at > 0) pending.unshift(...pending.splice(at, 1));
      return;
    }
    if (current !== "idle" && current !== "error") return;
    states.set(key, { state: "queued" });
    if (await store.readReviewJson(pr, cacheName(pr, file.path))) {
      states.set(key, { state: "done" });
      return;
    }
    if (first) pending.unshift({ key, pr, file });
    else pending.push({ key, pr, file });
    pump();
  }

  return {
    start(pr: Pr) {
      if (isLargePr(pr)) return;
      for (const file of pr.files) if (file.patch && !isNoise(file.path)) void enqueue(pr, file);
    },

    status(pr: Pr): Record<string, NoteState> {
      return Object.fromEntries(pr.files.map((f) => [f.path, stateOf(pr, f)]));
    },

    async get(pr: Pr, path: string): Promise<NoteState & { notes?: FileNotes }> {
      const file = pr.files.find((f) => f.path === path);
      if (!file?.patch) return { state: "none" };
      const cached = await store.readReviewJson<FileNotes>(pr, cacheName(pr, path));
      if (cached) {
        states.set(keyOf(pr, path), { state: "done" });
        return { state: "done", notes: cached };
      }
      await enqueue(pr, file, true);
      return stateOf(pr, file);
    },

    async cached(pr: Pr, path: string): Promise<FileNotes | null> {
      return store.readReviewJson<FileNotes>(pr, cacheName(pr, path));
    },

    retry(pr: Pr, path: string) {
      const file = pr.files.find((f) => f.path === path);
      if (file?.patch) void enqueue(pr, file, true);
    },
  };
}
