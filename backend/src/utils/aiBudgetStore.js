const mongoose = require('mongoose');
const { DEFAULT_POLICY } = require('./aiBudgetPolicy');
// Native collections keep platform-wide spending independent from tenant query middleware.
// No prompt, response, original report, name or API credential is stored here.
function collection(name) {
  if (mongoose.connection.readyState !== 1) throw new Error('AI 用量数据库不可用');
  return mongoose.connection.db.collection(name);
}
async function ensure(name, id, defaults) {
  try { await collection(name).updateOne({ _id: id }, { $setOnInsert: defaults }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
}
let usageIndexes;
async function prepareUsageIndexes() {
  if (!usageIndexes) usageIndexes = Promise.all([
    collection('ai_usage').createIndex({ createdAt: -1, _id: -1 }),
    collection('ai_usage').createIndex({ reportId: 1, createdAt: -1, _id: -1 }),
    collection('ai_usage').createIndex({ business: 1, createdAt: -1, _id: -1 }),
    collection('ai_control_audit').createIndex({ at: -1 }),
  ]).catch(error => { usageIndexes = null; throw error; });
  return usageIndexes;
}
const store = {
  async policy() { return { ...DEFAULT_POLICY, ...(await collection('ai_control').findOne({ _id: 'policy' })) }; },
  async reserve(scope, tokens, micros) {
    await ensure('ai_budget_counters', scope.id, { tokens: 0, calls: 0, micros: 0, extraTokens: 0, extraCalls: 0 });
    const checks = [{ $lte: [{ $add: ['$tokens', tokens] }, { $add: [scope.tokens, '$extraTokens'] }] }];
    if (scope.calls) checks.push({ $lte: [{ $add: ['$calls', 1] }, { $add: [scope.calls, '$extraCalls'] }] });
    if (scope.micros) checks.push({ $lte: [{ $add: ['$micros', micros] }, scope.micros] });
    const result = await collection('ai_budget_counters').updateOne({ _id: scope.id, $expr: { $and: checks } }, { $inc: { tokens, calls: 1, micros }, $set: { updatedAt: new Date() } });
    return result.modifiedCount === 1;
  },
  async adjust(id, tokens, micros, calls = 0) {
    await collection('ai_budget_counters').updateOne({ _id: id }, { $inc: { tokens, micros, calls }, $set: { updatedAt: new Date() } });
  },
  async circuit(key) { return collection('ai_circuits').findOne({ _id: key }); },
  async outcome(key, failed, threshold) {
    await ensure('ai_circuits', key, { failures: 0, paused: false });
    if (failed) {
      await collection('ai_circuits').updateOne({ _id: key }, { $inc: { failures: 1 }, $set: { updatedAt: new Date() } });
      await collection('ai_circuits').updateOne({ _id: key, failures: { $gte: threshold } }, { $set: { paused: true } });
    } else {
      // A late successful in-flight response must never clear a tripped circuit.
      await collection('ai_circuits').updateOne({ _id: key, paused: false }, { $set: { failures: 0, updatedAt: new Date() } });
    }
  },
  async insert(entry) { await prepareUsageIndexes(); await collection('ai_usage').insertOne(entry); },
  async finish(id, update) { await collection('ai_usage').updateOne({ _id: id }, { $set: update }); },
};
module.exports = { store, collection, ensure };
