const EDITABLE_FIELDS = ['name', 'brand', 'specification', 'dosage', 'method', 'frequency', 'startDate', 'endDate', 'purpose', 'note'];

function validateApprovedSupplement(value) {
  for (const key of ['name', 'dosage', 'frequency']) {
    const text = String(value?.[key] || '').trim();
    if (!text || /^(待(营养师)?确认|待补充|未知|暂无|未提供|不详|[-—])$/.test(text)) {
      return `${{ name: '营养素名称', dosage: '剂量', frequency: '频次' }[key]}尚未核实，请编辑后再采纳`;
    }
  }
  return '';
}

function reviewedSupplementFields(body) {
  const fields = {};
  for (const key of EDITABLE_FIELDS) if (body[key] !== undefined) fields[key] = String(body[key] || '').trim();
  if (body.imageUrls !== undefined) fields.imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter(url => typeof url === 'string' && url.trim()).slice(0, 6) : [];
  return fields;
}

// 商城自动归档的记录没有医护创建人。即使早期记录缺少 sourceType/sourceOrderId，
// 也会保留自动写入人、来源说明或统一的“商城购买”备注；这些记录仍只能由
// 营养师（或超管）补充、核对其服用信息。
function canNutritionistEditOrderSupplement(record, role) {
  const isOrderArchive = record?.sourceType === 'order'
    || Boolean(record?.sourceOrderId)
    || record?.createdByName === '商城订单自动写入'
    || record?.aiGeneratedBy === '商城营养素订单'
    || String(record?.note || '').includes('商城购买：');
  return ['nutritionist', 'superadmin'].includes(role)
    && isOrderArchive;
}

module.exports = { validateApprovedSupplement, reviewedSupplementFields, canNutritionistEditOrderSupplement };
