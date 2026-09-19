const verified = new WeakMap();
async function requireEvidenceIndex(Model) {
  if (!verified.has(Model)) verified.set(Model, (async () => {
    await Model.init();
    const indexes = await Model.collection.indexes();
    if (!indexes.some(index => index.key?.evidenceOrderIds === 1 && Object.keys(index.key).length === 1 && index.unique && index.sparse)) throw Object.assign(new Error('历史续约订单唯一索引尚未就绪，请联系管理员核对'), { statusCode: 409 });
  })().catch(error => { verified.delete(Model); throw error; }));
  return verified.get(Model);
}
module.exports = { requireEvidenceIndex };
