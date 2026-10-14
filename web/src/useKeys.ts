import { useEffect } from "react";

export function useKeys(handlers: Record<string, () => void>) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      const handler = handlers[event.key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers]);
}
