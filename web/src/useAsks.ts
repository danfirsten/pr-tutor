import { useCallback, useEffect, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { askQuestion, loadAsks, type Question, type Thread } from "./api.ts";

export interface Pending {
  threadId?: string;
  question: string;
}

export function useAsks(pr: PrRef) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    loadAsks(pr).then(setThreads, () => {});
  }, [pr]);

  const ask = useCallback(
    async (q: Question): Promise<Thread | null> => {
      setPending({ threadId: "threadId" in q ? q.threadId : undefined, question: q.question });
      try {
        const thread = await askQuestion(pr, q);
        setThreads((all) => (all.some((t) => t.id === thread.id) ? all.map((t) => (t.id === thread.id ? thread : t)) : [...all, thread]));
        return thread;
      } catch {
        return null;
      } finally {
        setPending(null);
      }
    },
    [pr],
  );

  return { threads, pending, ask };
}
