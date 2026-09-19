// Staff forms submit content; retain compatibility with explicit execution clients.
// An explicitly empty content must not fall back to a stale executedContent.
function executionContent(body = {}) {
  return body.content !== undefined ? body.content : body.executedContent;
}
module.exports = { executionContent };
