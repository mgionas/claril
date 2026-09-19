export type SaveState = "saved" | "saving" | "error";

export interface Autosaver {
  /** Record new content and (re)start the debounce. */
  schedule(content: string): void;
  /** Save any pending content now (unmount / page hide). */
  flush(): void;
  /** Re-send the content of a failed save. */
  retry(): void;
  /** True while there is content not yet confirmed saved. */
  isDirty(): boolean;
  /** Drop the debounce timer without saving. */
  cancel(): void;
}

/**
 * Debounced autosave with ordered status. Only the newest save may report
 * "saved"/"error" (a slow older save finishing late can't mask a newer pending
 * edit), a failed save keeps its content for retry, and flush() lets callers
 * persist a pending edit on unmount instead of dropping it.
 */
export function createAutosaver({
  save,
  onState,
  delayMs = 800,
}: {
  save: (content: string) => Promise<unknown>;
  onState: (state: SaveState) => void;
  delayMs?: number;
}): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null; // content not yet sent (or failed)
  let inFlight = 0;
  let seq = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function flush() {
    clearTimer();
    if (pending === null) return;
    const content = pending;
    pending = null;
    const mine = ++seq;
    inFlight++;
    onState("saving");
    save(content).then(
      () => {
        inFlight--;
        if (mine === seq && pending === null) onState("saved");
      },
      () => {
        inFlight--;
        if (mine !== seq) return; // superseded by a newer save
        pending ??= content; // keep newer edits if any, else retry this one
        clearTimer();
        onState("error");
      },
    );
  }

  return {
    schedule(content) {
      pending = content;
      onState("saving");
      clearTimer();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    retry: flush,
    isDirty: () => pending !== null || inFlight > 0,
    cancel: clearTimer,
  };
}
