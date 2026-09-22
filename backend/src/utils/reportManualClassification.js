function manualClassification(keys, index, actorId) {
  if (!Array.isArray(keys) || keys.length > 20 || keys.some(key => typeof key !== 'string')) throw new Error('归类选项无效');
  const unique = [...new Set(keys)];
  const nodes = unique.map(key => index.find(entry => entry.node.id === key)?.node);
  if (nodes.some(node => !node)) throw new Error('所选归类已停用或不存在，请刷新 Admin 目录后重新选择');
  const first = nodes[0];
  return { screeningKeys: unique, screeningKey: first?.id || '', screeningCategory: first?.category || '',
    screeningParent: first?.parent || '', matchStatus: first ? 'matched' : 'unclassified', matchConfidence: first ? 1 : 0,
    classificationSource: first ? 'manual' : '', classificationReviewedBy: first ? actorId : null,
    classificationReviewedAt: first ? new Date() : null };
}
module.exports = { manualClassification };
