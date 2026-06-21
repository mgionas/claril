/** Pure mention parsing + notification fan-out (no DB). */

export interface MentionCandidate {
  id: string;
  name: string;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9]/.test(ch);
}

/**
 * Resolve `@Name` tokens in `body` to candidate user ids (deduped).
 *
 * Matching rules — each prevents a wrong-recipient notification:
 * - An `@` only starts a mention at the start of the string or after a
 *   non-word char (so `a@example.com` does NOT mention `@example`).
 * - At each `@`, the LONGEST candidate name that matches wins, so
 *   `@Ada Lovelace` resolves only "Ada Lovelace", not also a separate "Ada".
 * - The match must end on a word boundary, so `@Annabel` does NOT mention a
 *   user named "Ann".
 * Only names present in `candidates` resolve; unknown @tokens are ignored.
 */
export function parseMentions(body: string, candidates: MentionCandidate[]): string[] {
  // Longest name first so a multi-word name wins over a prefix of it at the same `@`.
  const sorted = [...candidates]
    .filter((c) => c.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  const found = new Set<string>();
  const lower = body.toLowerCase();
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "@") continue;
    if (isWordChar(body[i - 1])) continue; // mid-word @ (e.g. an email) — not a mention
    const start = i + 1;
    for (const c of sorted) {
      const name = c.name.toLowerCase();
      const end = start + name.length;
      if (lower.startsWith(name, start) && !isWordChar(body[end])) {
        found.add(c.id);
        i = end - 1; // consume the matched span (the loop's i++ advances past it)
        break;
      }
    }
  }
  return [...found];
}

export interface NotifyInput {
  actorId: string;
  mentionedUserIds: string[];
  participantIds: string[];
}

/**
 * Compute who to notify. `mention` = mentioned users (minus the actor).
 * `reply` = thread participants who were not mentioned (minus the actor).
 * A mentioned participant is counted as a mention only.
 */
export function notifyTargets({ actorId, mentionedUserIds, participantIds }: NotifyInput): {
  mention: string[];
  reply: string[];
} {
  const mention = [...new Set(mentionedUserIds)].filter((id) => id !== actorId);
  const mentionSet = new Set(mention);
  const reply = [...new Set(participantIds)].filter((id) => id !== actorId && !mentionSet.has(id));
  return { mention, reply };
}
