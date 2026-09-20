// Internal capability, never accepted from an HTTP body or query option.
const QUEUE_WRITE = Symbol('report-plan-queue-write');
function queueWrite(query) { query[QUEUE_WRITE] = true; return query; }
function reportWriteFence(schema) {
  schema.pre('save', function () {
    if (!this.isNew) this.$where = { ...this.$where, 'planItemSync.status': { $ne: 'running' }, 'legacyReviewWrite.status': { $ne: 'running' } };
  });
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(op, { query: true, document: false }, function () {
      if (this[QUEUE_WRITE]) return;
      this.setQuery({ $and: [this.getFilter(), { 'planItemSync.status': { $ne: 'running' }, 'legacyReviewWrite.status': { $ne: 'running' } }] });
    });
  }
}
module.exports = { reportWriteFence, queueWrite };
