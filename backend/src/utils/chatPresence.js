const HUMAN_PRESENCE_TTL_MS = 90 * 1000;

function activeSince(now = new Date()) {
  return new Date(now.getTime() - HUMAN_PRESENCE_TTL_MS);
}

function isHumanPresent(state, now = new Date()) {
  return !!(state?.humanActive && state?.takenOverAt && new Date(state.takenOverAt) >= activeSince(now));
}

function humanPresentQuery(conversationId, now = new Date()) {
  return { conversationId, humanActive: true, takenOverAt: { $gte: activeSince(now) } };
}

module.exports = { HUMAN_PRESENCE_TTL_MS, activeSince, isHumanPresent, humanPresentQuery };
