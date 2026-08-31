function cleanPart(value) {
  return String(value || '').toLowerCase().replace(/[\s，,、:：;；()（）\[\]【】\-_/]/g, '');
}

function reportItemIdentityKey(item) {
  return [item?.itemType || '', cleanPart(item?.name), cleanPart(item?.orderName), cleanPart(item?.sourceSection), cleanPart(item?.bodyPart)].join('|');
}

const ULTRASOUND_ORGANS = [
  { key: 'liver', label: '肝脏', descriptor: /肝(?:脏)?/, evidence: /肝(?:脏|实质|内|包膜|回声|结节)/ },
  { key: 'gallbladder', label: '胆囊', descriptor: /胆(?:囊)?/, evidence: /胆(?:囊|总管|汁)/ },
  { key: 'spleen', label: '脾脏', descriptor: /脾(?:脏)?/, evidence: /脾(?:脏|大|实质|门|静脉)/ },
  { key: 'pancreas', label: '胰腺', descriptor: /胰(?:腺|管)?/, evidence: /胰(?:腺|管|头|体|尾)/ },
  { key: 'kidney', label: '肾脏', descriptor: /肾(?:脏)?/, evidence: /(?:双|左|右)?肾(?:脏|实质|皮质|集合系统|盂)/ },
  { key: 'ureter', label: '输尿管', descriptor: /输尿管/, evidence: /输尿管/ },
  { key: 'bladder', label: '膀胱', descriptor: /膀胱/, evidence: /膀胱/ },
  { key: 'prostate', label: '前列腺', descriptor: /前列腺/, evidence: /前列腺/ },
  { key: 'thyroid', label: '甲状腺', descriptor: /甲状腺/, evidence: /甲状腺/ },
  { key: 'lymph', label: '淋巴结', descriptor: /淋巴结/, evidence: /淋巴结/ },
];

function organsInDescriptor(item) {
  const descriptor = `${item?.name || ''} ${item?.bodyPart || ''}`;
  return ULTRASOUND_ORGANS.filter(organ => organ.descriptor.test(descriptor));
}

function inferMissingUltrasoundOrgans(items) {
  const targets = new Map();
  for (const item of (items || [])) {
    if (item?.itemType !== 'imaging') continue;
    const organs = organsInDescriptor(item);
    if (organs.length < 2) continue;
    const findings = String(item.findings || '');
    for (const organ of organs) {
      if (!organ.evidence.test(findings)) targets.set(organ.key, organ.label);
    }
  }
  return [...targets.entries()].map(([key, label]) => ({ key, label }));
}

function hasNamedOrganEvidence(item, organ) {
  return organ.evidence.test(String(item?.findings || ''));
}

function describeExistingReportItems(items) {
  return (items || []).filter(item => cleanPart(item?.name)).map(item => {
    const context = item.orderName || item.sourceSection || item.bodyPart || '';
    return `${item.name}${context ? `（${context}）` : ''}`;
  }).join('、');
}

// 模型偶尔会忽略“只输出遗漏项”，服务端再按项目身份硬过滤。
// 不比较 value，避免已有项目因 OCR 数值或单位细微差异被当成新项。
function filterMissingReportItems(existingItems, candidates, options = {}) {
  const existingKeys = new Set((existingItems || []).map(reportItemIdentityKey));
  const acceptedKeys = new Set();
  const targetKeys = new Set((options.targetOrgans || []).map(target => typeof target === 'string' ? target : target.key));
  const existingCoveredOrgans = new Set();
  for (const item of (existingItems || [])) {
    for (const organ of organsInDescriptor(item)) {
      if (hasNamedOrganEvidence(item, organ)) existingCoveredOrgans.add(organ.key);
    }
  }
  return (candidates || []).filter(item => {
    if (!cleanPart(item?.name)) return false;
    if (item?.itemType === 'imaging' && targetKeys.size) {
      const candidateOrgans = organsInDescriptor(item);
      const targeted = candidateOrgans.filter(organ => targetKeys.has(organ.key));
      // 有明确缺失器官时，禁止模型自由扩展其他影像项。
      if (!targeted.length) return false;
      // 所见必须带对应器官原词，拒绝“未见异常”等无出处内容和串行。
      if (!targeted.some(organ => hasNamedOrganEvidence(item, organ))) return false;
      if (targeted.every(organ => existingCoveredOrgans.has(organ.key))) return false;
    }
    const key = reportItemIdentityKey(item);
    if (existingKeys.has(key) || acceptedKeys.has(key)) return false;
    acceptedKeys.add(key);
    return true;
  });
}

module.exports = {
  describeExistingReportItems,
  filterMissingReportItems,
  inferMissingUltrasoundOrgans,
  reportItemIdentityKey,
};
