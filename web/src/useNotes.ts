import { useCallback, useEffect, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { loadNotes, noteStatus, retryNotes, startNotes, type FileNotes, type NoteState, type NoteStatus } from "./api.ts";

const BUSY = new Set(["queued", "running"]);

export function useNotes(pr: PrRef, path: string | null) {
  const [status, setStatus] = useState<NoteStatus>({});
  const [notes, setNotes] = useState<Record<string, FileNotes>>({});

  useEffect(() => {
    startNotes(pr).then(setStatus, () => {});
  }, [pr]);

  const busy = Object.values(status).some((s) => BUSY.has(s.state));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => noteStatus(pr).then(setStatus, () => {}), 2000);
    return () => clearInterval(timer);
  }, [pr, busy]);

  const current: NoteState | undefined = path ? status[path] : undefined;
  useEffect(() => {
    if (!path || notes[path] || current?.state === "error" || current?.state === "none") return;
    if (current && BUSY.has(current.state)) return;
    loadNotes(pr, path).then((result) => {
      if (result.notes) setNotes((all) => ({ ...all, [path]: result.notes! }));
      setStatus((all) => ({ ...all, [path]: result.notes ? { state: "done" } : result }));
    }, () => {});
  }, [pr, path, current?.state, notes]);

  const retry = useCallback((p: string) => retryNotes(pr, p).then(setStatus, () => {}), [pr]);

  return { status, notes: path ? notes[path] : undefined, state: current, retry };
}
