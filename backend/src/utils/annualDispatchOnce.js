const { createHash } = require('crypto');
const verifiedIndexes = new WeakMap();
async function requireDispatchIndex(Model) {
  if (!verifiedIndexes.has(Model)) verifiedIndexes.set(Model, (async () => {
    await Model.init();
    const indexes = await Model.collection.indexes();
    if (!indexes.some(index => index.key?.annualDispatchKey === 1 && Object.keys(index.key).length === 1 && index.unique && index.sparse)) {
      throw Object.assign(new Error('年度派发唯一索引尚未就绪，请联系管理员核对'), { code: 'ANNUAL_DISPATCH_INDEX_REQUIRED' });
    }
  })().catch(error => { verifiedIndexes.delete(Model); throw error; }));
  return verifiedIndexes.get(Model);
}

// 仅新续年记录写入该键；稀疏唯一索引不要求清理或改写历史记录。
async function insertAnnualOnce(Model, plan, kind, key, filter, payload) {
  // 没有真实唯一约束就不允许新续年派发，避免把普通 upsert 错当并发保障。
  await requireDispatchIndex(Model);
  const annualDispatchKey = createHash('sha256').update(JSON.stringify([String(plan._id), kind, String(key)])).digest('hex');
  try {
    return await Model.updateOne(filter, { $setOnInsert: { ...payload, annualDispatchKey } }, { upsert: true });
  } catch (error) {
    // 仅吸收该派发键的竞争；其他唯一约束/写入错误必须保留为异常。
    if (error.code !== 11000 || !error.keyPattern?.annualDispatchKey || !(await Model.exists(filter))) throw error;
    return { upsertedCount: 0, modifiedCount: 0 };
  }
}
module.exports = { insertAnnualOnce };
