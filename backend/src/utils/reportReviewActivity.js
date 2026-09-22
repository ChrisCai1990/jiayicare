function reviewActivityEntry(activity, key, actorId, actorName, sequence, now = Date.now()) {
  const previous = activity?.[key];
  if (previous && sequence <= previous.sequence) return null;
  const lastActorAt = Math.max(0, ...Object.values(activity || {}).filter(entry => entry.actorId === actorId)
    .map(entry => new Date(entry.at).getTime()).filter(Number.isFinite));
  const elapsed = lastActorAt ? now - lastActorAt : 0;
  // Shared actor clock excludes overlapping browser tabs. Long gaps are not backfilled.
  const delta = previous && elapsed > 0 && elapsed <= 20000 ? elapsed : 0;
  return { actorId, actorName, sequence, at: new Date(now), durationMs: (previous?.durationMs || 0) + delta, startedAt: previous?.startedAt || new Date(now) };
}
module.exports = { reviewActivityEntry };
