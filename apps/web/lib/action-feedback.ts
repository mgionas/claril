import { toast } from "sonner";

/** Delay before a loading toast appears, so fast actions don't flash one. */
export const LOADING_TOAST_DELAY_MS = 400;

export interface Notifier {
  loading(msg: string): string | number;
  success(msg: string, opts?: { id?: string | number }): void;
  error(msg: string, opts?: { id?: string | number; description?: string }): void;
  dismiss(id: string | number): void;
}

const sonnerNotifier: Notifier = {
  loading: (msg) => toast.loading(msg),
  success: (msg, opts) => void toast.success(msg, opts),
  error: (msg, opts) => void toast.error(msg, opts),
  dismiss: (id) => void toast.dismiss(id),
};

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong.";
}

/**
 * Next.js signals redirect()/notFound() by throwing errors with a well-known
 * `digest`. They must propagate untouched (e.g. an expired session redirecting
 * to /sign-in), never be shown as a failure toast.
 */
export function isNextControlError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("digest" in err)) return false;
  const digest = (err as { digest: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") ||
      digest === "NEXT_NOT_FOUND")
  );
}

/**
 * Run a mutation with toast feedback: a loading toast if it takes longer than
 * LOADING_TOAST_DELAY_MS, then success (or dismissal) / error. Errors resolve to
 * `undefined` after being reported; Next control-flow errors are rethrown.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  msgs: { loading?: string; success?: string; error?: string } = {},
  notify: Notifier = sonnerNotifier,
): Promise<T | undefined> {
  let id: string | number | undefined;
  const loadingMsg = msgs.loading;
  const timer = loadingMsg
    ? setTimeout(() => {
        id = notify.loading(loadingMsg);
      }, LOADING_TOAST_DELAY_MS)
    : undefined;
  try {
    const result = await fn();
    clearTimeout(timer);
    if (msgs.success) notify.success(msgs.success, { id });
    else if (id !== undefined) notify.dismiss(id);
    return result;
  } catch (err) {
    clearTimeout(timer);
    if (isNextControlError(err)) {
      if (id !== undefined) notify.dismiss(id);
      throw err;
    }
    notify.error(msgs.error ?? "Something went wrong", { id, description: errorMessage(err) });
    return undefined;
  }
}
