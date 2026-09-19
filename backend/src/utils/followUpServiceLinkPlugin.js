module.exports = function followUpServiceLinkPlugin(schema, { targetType }) {
  const reconcile = async targetId => {
    if (!targetId) return;
    await require('./followUpServiceLink').safeReconcileServiceLinks({ targetType, targetId });
    if (targetType === 'health_plan') await require('./annualCheckupEvidence').safeReconcileCheckupPreparation({
      'formData.annualCheckupPreparation.evidence.healthPlanId': String(targetId),
    });
  };
  schema.post('save', async function (doc) { await reconcile(doc._id); });
  schema.post('findOneAndUpdate', async function (doc) { if (doc?._id) await reconcile(doc._id); });
  schema.post('updateOne', async function () {
    const id = this.getFilter()._id;
    // 非单ID更新交给读取时/每日兜底；避免改写原流程的大范围更新语义。
    if (id && (typeof id === 'string' || id._bsontype === 'ObjectId')) await reconcile(id);
  });
};
