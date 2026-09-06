function isHumanPresent(state) {
  return !!state?.humanActive;
}

function humanPresentQuery(conversationId) {
  return { conversationId, humanActive: true };
}

module.exports = { isHumanPresent, humanPresentQuery };
