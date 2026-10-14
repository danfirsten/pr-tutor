import { useCallback, useEffect, useRef, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { loadReview, saveReview, type Draft, type DraftComment } from "./api.ts";

export type SaveState = "loading" | "saved" | "saving" | "error";

export function useReview(pr: PrRef) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    loadReview(pr).then(
      (d) => {
        setDraft(d);
        setSaveState("saved");
      },
      () => setSaveState("error"),
    );
  }, [pr]);

  const update = useCallback(
    (change: (d: Draft) => Draft) => {
      setDraft((current) => {
        if (!current) return current;
        const next = change(current);
        setSaveState("saving");
        clearTimeout(timer.current);
        timer.current = setTimeout(() => saveReview(pr, next).then(() => setSaveState("saved"), () => setSaveState("error")), 400);
        return next;
      });
    },
    [pr],
  );

  const upsertComment = (comment: DraftComment) =>
    update((d) => ({ ...d, comments: d.comments.some((c) => c.id === comment.id) ? d.comments.map((c) => (c.id === comment.id ? comment : c)) : [...d.comments, comment] }));
  const deleteComment = (id: string) => update((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== id) }));

  return { draft, saveState, update, upsertComment, deleteComment };
}
