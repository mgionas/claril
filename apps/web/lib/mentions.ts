/** Pure mention parsing + notification fan-out (no DB). */

export interface MentionCandidate {
  id: string;
  name: string;
}

/**
 * Resolve `@Name` tokens in `body` to candidate user ids. Matches the longest
 * candidate name that follows an `@` (case-insensitive); returns deduped ids.
 * Only names present in `candidates` resolve — unknown @tokens are ignored.
 */
export function parseMentions(body: string, candidates: MentionCandidate[]): string[] {
  const found = new Set<string>();
  const sorted = [...candidates].sort((a, b) => b.name.length - a.name.length);
  const lower = body.toLowerCase();
  for (const c of sorted) {
    const needle = ("@" + c.name).toLowerCase();
    if (lower.includes(needle)) found.add(c.id);
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
