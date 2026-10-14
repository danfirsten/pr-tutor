import { useCallback, useEffect, useState } from "react";
import type { PrRef } from "../../server/types.ts";
import { loadBriefing, type BriefingResult } from "./api.ts";

export function useBriefing(pr: PrRef) {
  const [result, setResult] = useState<BriefingResult>({ state: "running" });

  useEffect(() => {
    if (result.state !== "running" && result.state !== "queued") return;
    let stopped = false;
    const poll = () =>
      loadBriefing(pr).then(
        (next) => !stopped && setResult(next),
        (error: Error) => !stopped && setResult({ state: "error", error: error.message }),
      );
    void poll();
    const timer = setInterval(poll, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pr, result.state]);

  const retry = useCallback(() => {
    loadBriefing(pr, true).then(setResult, () => {});
  }, [pr]);

  return { ...result, retry };
}
