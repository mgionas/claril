"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAutosaver, type Autosaver, type SaveState } from "@/lib/autosaver";

/**
 * Debounced autosave for a diagram editor. Returns the live save state, a
 * `schedule(content)` to call on every change, and `retry()` for failed saves.
 * Pending edits are flushed on unmount, and leaving the page with unsaved
 * changes prompts the browser's "leave site?" confirmation.
 */
export function useAutosave(save: (content: string) => Promise<unknown>, delayMs = 800) {
  const [state, setState] = useState<SaveState>("saved");
  const saveRef = useRef(save);
  saveRef.current = save;

  const saverRef = useRef<Autosaver | null>(null);
  if (!saverRef.current) {
    saverRef.current = createAutosaver({
      delayMs,
      save: (content) => saveRef.current(content),
      onState: setState,
    });
  }

  useEffect(() => {
    const saver = saverRef.current!;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!saver.isDirty()) return;
      saver.flush();
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      saver.flush(); // don't drop an edit made just before navigating away
    };
  }, []);

  const schedule = useCallback((content: string) => saverRef.current!.schedule(content), []);
  const retry = useCallback(() => saverRef.current!.retry(), []);

  return { saveState: state, schedule, retry };
}
