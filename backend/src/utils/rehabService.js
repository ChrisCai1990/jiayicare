const crypto = require('crypto');
const LABELS = {
  goal: '本次目标', history: '运动与伤病情况', tests: '测试项目与实际结果',
  findings: '评估结论与当前能力', recommendations: '运动方式及起始安排',
  precautions: '注意事项与调整条件', nextReview: '复评安排',
  training: '本次指导与训练内容', response: '客户反馈与训练反应', nextSteps: '下一步安排',
};
const ASSESSMENT_FIELDS = ['goal','history','tests','findings','recommendations','precautions','nextReview'];
const TRAINING_FIELDS = ['goal','training','response','nextSteps'];
const KINDS = { initial: '首次运动能力评估', reassessment: '运动能力复评', training: '运动指导与复健训练', guidance: '日常线上答疑' };
const idFor = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,24);
function fail(message, statusCode=400) { throw Object.assign(new Error(message), {statusCode}); }
function normalizeEntry(body, publish=false) {
  if (!KINDS[body.kind]) fail('请选择记录类型');
  if (!['online','offline'].includes(body.mode)) fail('请选择线上或线下');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '') || !Number.isFinite(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0,10)!==body.date) fail('请选择有效服务日期');
  const result = { version:1, kind:body.kind, mode:body.mode, date:body.date, fields:{} };
  for (const key of Object.keys(LABELS)) {
    if (body.fields?.[key] !== undefined && typeof body.fields[key] !== 'string') fail('填写内容格式不正确');
    const value = (body.fields?.[key] || '').trim();
    if (value.length > 6000) fail('单项内容不能超过6000字');
    result.fields[key] = value;
  }
  const required = ['initial','reassessment'].includes(body.kind) ? ['goal','tests','findings','recommendations','precautions'] : ['training','response','nextSteps'];
  if (publish && required.some(key => !result.fields[key])) fail('请完整填写目标、评估依据与建议，或本次训练内容、反馈及下一步安排');
  for (const key of ['orderId','planId','screeningResponseId']) {
    if (body[key] && !/^[a-f0-9]{24}$/i.test(String(body[key]))) fail('关联记录无效');
    result[key] = body[key] || null;
  }
  return result;
}
function reportText(entry, template={}) {
  const keys = ['initial','reassessment'].includes(entry.kind) ? ASSESSMENT_FIELDS : TRAINING_FIELDS;
  return [`${KINDS[entry.kind]}｜${entry.date}｜${entry.mode === 'online' ? '线上' : '线下'}`,
    ...keys.filter(k=>entry.fields[k]).map(k=>`${template.reportLabels?.[k] || LABELS[k]}\n${entry.fields[k]}`),
    template.reportFooter || '本报告记录本次运动评估或训练结果，具体运动安排随反馈和复评调整。'].join('\n\n');
}
function isRehabOrder(order) { return order?.serviceWorkflowSnapshot?.key === 'rehab'; }
function expiryOf(order) {
  const days=Number(order?.serviceWorkflowSnapshot?.skuValidityDays);
  return order?.paidAt && days>0 ? new Date(new Date(order.paidAt).getTime()+days*86400000) : null;
}
function assertUsableOrder(order, at=new Date()) {
  if (!isRehabOrder(order) || order.paymentStatus !== 'paid' || ['cancelled','completed'].includes(order.status)
    || ['closed','refund_pending','refunded'].includes(order.tradeStatus)
    || ['requested','processing','refunded'].includes(order.refundStatus)) fail('订单未支付、已结束或正在退款，不能开展本次服务',409);
  const expiresAt=expiryOf(order);
  if(expiresAt && expiresAt<=at) fail('套餐已超过有效期，请联系健管专员核对',409);
}
module.exports={LABELS,ASSESSMENT_FIELDS,TRAINING_FIELDS,KINDS,idFor,fail,normalizeEntry,reportText,isRehabOrder,assertUsableOrder,expiryOf};
