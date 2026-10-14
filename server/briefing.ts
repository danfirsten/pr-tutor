import { ClaudeLoginError, type Claude } from "./claude.ts";
import { refLabel } from "./prRef.ts";
import { BRIEFING_VERSION, briefingPrompt, briefingSchema, briefingSystem, cleanBriefing, type Briefing } from "./prompts/briefing.ts";
import type { Store } from "./store.ts";
import type { NoteState, Pr } from "./types.ts";

export type BriefingResult = NoteState & { briefing?: Briefing };

export function createBriefings({ claude, store }: { claude: Pick<Claude, "ask">; store: Store }) {
  const states = new Map<string, NoteState>();
  const keyOf = (pr: Pr) => `${refLabel(pr)}@${pr.headSha}`;
  const cacheName = (pr: Pr) => `cache/${pr.headSha}/briefing-v${BRIEFING_VERSION}.json`;

  async function generate(pr: Pr) {
    const key = keyOf(pr);
    states.set(key, { state: "running" });
    try {
      const raw = await claude.ask<Briefing>({ system: briefingSystem, prompt: briefingPrompt(pr), schema: briefingSchema });
      await store.writeReviewJson(pr, cacheName(pr), cleanBriefing(raw, pr));
      states.set(key, { state: "done" });
    } catch (error) {
      const e = error as Error;
      states.set(key, { state: "error", error: e.message, ...(e instanceof ClaudeLoginError ? { login: true } : {}) });
    }
  }

  return {
    async get(pr: Pr, retry = false): Promise<BriefingResult> {
      const cached = await store.readReviewJson<Briefing>(pr, cacheName(pr));
      if (cached) return { state: "done", briefing: cached };
      const state = states.get(keyOf(pr));
      if (!state || (retry && state.state === "error")) {
        void generate(pr);
        return { state: "running" };
      }
      return state;
    },
  };
}
