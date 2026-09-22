// One atomic update: initialize null/missing legacy jobs without discarding
// saved PDF/image checkpoints. Never use dotted writes against a null parent.
function reportParseJobUpdate(fields, extra = {}) {
  return [{ $set: { ...extra, parseJob: { $mergeObjects: [
    { $cond: [{ $eq: [{ $type: '$parseJob' }, 'object'] }, '$parseJob', {}] },
    { $literal: fields },
  ] } } }];
}
module.exports = { reportParseJobUpdate };
