import { useCallback, useEffect, useRef, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { loadNotes, noteStatus, retryNotes, startNotes, type FileNotes, type NoteState, type NoteStatus } from "./api.ts";

const BUSY = new Set(["queued", "running"]);

export function useNotes(pr: PrRef, path: string | null) {
  const [status, setStatus] = useState<NoteStatus>({});
  const [notes, setNotes] = useState<Record<string, FileNotes>>({});
  const loading = useRef(new Set<string>());

  useEffect(() => {
    startNotes(pr).then(setStatus, () => {});
  }, [pr]);

  const busy = Object.values(status).some((s) => BUSY.has(s.state));
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => noteStatus(pr).then(setStatus, () => {}), 2000);
    return () => clearInterval(timer);
  }, [pr, busy]);

  const load = useCallback(
    (p: string) => {
      if (loading.current.has(p)) return;
      loading.current.add(p);
      loadNotes(pr, p)
        .then((result) => {
          if (result.notes) setNotes((all) => ({ ...all, [p]: result.notes! }));
          setStatus((all) => ({ ...all, [p]: result.notes ? { state: "done" } : result }));
        }, () => {})
        .finally(() => loading.current.delete(p));
    },
    [pr],
  );

  const current: NoteState | undefined = path ? status[path] : undefined;
  useEffect(() => {
    if (!path || notes[path] || current?.state === "error" || current?.state === "none") return;
    if (current && BUSY.has(current.state)) return;
    load(path);
  }, [path, current?.state, notes, load]);

  useEffect(() => {
    for (const [p, s] of Object.entries(status)) if (s.state === "done" && !notes[p]) load(p);
  }, [status, notes, load]);

  const retry = useCallback((p: string) => retryNotes(pr, p).then(setStatus, () => {}), [pr]);

  return { status, all: notes, notes: path ? notes[path] : undefined, state: current, retry };
}
