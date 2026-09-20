// Normalize wording, never create a classification. All targets still come from Admin.
const clean = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
function modality(value) {
  const text = clean(value);
  if (/超声|彩超|b超|彩色多普勒/.test(text)) return 'ultrasound';
  if (/磁共振|mri/.test(text)) return 'mri';
  if (/(?:^|[^a-z])ct(?:$|[^a-z])|计算机断层/.test(text)) return 'ct';
  return '';
}
function organs(value) {
  const text = clean(value);
  return ['肝', '胆囊', '胰', '脾', '肾', '甲状腺', '乳腺', '前列腺', '膀胱', '输尿管', '心脏', '颈动脉', '子宫', '附件']
    .filter(word => text.includes(word));
}
function compatibleNode(item, node) {
  const sourceMode = modality(`${item.modality || ''} ${item.name || ''} ${item.orderName || ''} ${item.sourceSection || ''}`);
  const targetText = `${node.label || ''} ${node.parent || ''}`;
  const targetMode = modality(targetText);
  if (sourceMode && sourceMode !== targetMode) return false;
  if (sourceMode || targetMode) {
    const sourceOrgans = organs(`${item.name || ''} ${item.bodyPart || ''}`);
    const targetOrgans = organs(node.label);
    if (sourceOrgans.length && targetOrgans.length
        && (!sourceOrgans.every(part => targetOrgans.includes(part)) || !targetOrgans.every(part => sourceOrgans.includes(part)))) return false;
  }
  return true;
}
function confirmedRuleMatches(item, rule) {
  return ['name', 'orderName', 'sourceSection', 'specimen', 'modality', 'bodyPart', 'unit']
    .every(field => clean(rule[field]) === clean(item[field]));
}
function contextualNames(item) {
  const name = String(item.name || '').trim();
  const sourceMode = modality(`${item.modality || ''} ${item.orderName || ''} ${item.sourceSection || ''}`);
  if (name && sourceMode === 'ultrasound' && !modality(name)) return [`${name}超声`, `${name}彩超`];
  return [];
}
module.exports = { compatibleNode, confirmedRuleMatches, contextualNames };
