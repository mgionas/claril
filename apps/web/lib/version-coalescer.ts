export interface CoalescerOptions {
  /** Snapshot after this much idle time with no further changes. */
  idleMs: number;
  /** Hard cap: snapshot at most this long after the first un-flushed change. */
  capMs: number;
}

export interface VersionCoalescer {
  /** Record a change; (re)arms the idle timer and ensures the cap timer runs. */
  onChange(): void;
  /** Cancel any pending flush without firing (e.g. on unmount). */
  cancel(): void;
}

/**
 * Coalesces a burst of edits into a single snapshot: fires `flush` after
 * `idleMs` of quiet, or at `capMs` from the first un-flushed change — whichever
 * comes first. After firing, both timers reset and the next change starts a
 * fresh window. Timer-only; the caller decides what `flush` snapshots.
 */
export function createVersionCoalescer(
  flush: () => void,
  { idleMs, capMs }: CoalescerOptions,
): VersionCoalescer {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;

  function clear() {
    if (idleTimer) clearTimeout(idleTimer);
    if (capTimer) clearTimeout(capTimer);
    idleTimer = null;
    capTimer = null;
  }

  function fire() {
    clear();
    flush();
  }

  return {
    onChange() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(fire, idleMs);
      if (!capTimer) capTimer = setTimeout(fire, capMs);
    },
    cancel() {
      clear();
    },
  };
}
