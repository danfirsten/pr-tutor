import { useEffect, useLayoutEffect, useRef } from "react";

export type KeyHandlers = Record<string, ((event: KeyboardEvent) => void) | undefined>;

export function useKeys(handlers: KeyHandlers) {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if ((event.key === "Enter" || event.key === " ") && target.closest("button, a")) return;
      const handler = latest.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function blurOnEscape(event: { key: string; currentTarget: HTMLElement }) {
  if (event.key === "Escape") event.currentTarget.blur();
}
