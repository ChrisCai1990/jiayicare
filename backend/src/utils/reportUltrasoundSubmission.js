const clean = value => String(value || '').normalize('NFKC').replace(/\s+/g, '');

const ORGAN_RULES = [
  { key: 'liver', label: '肝脏', pattern: /肝脏|肝彩超|肝超声|^肝$/ },
  { key: 'gallbladder', label: '胆囊', pattern: /胆囊|胆彩超|胆超声|^胆$/ },
  { key: 'pancreas', label: '胰腺', pattern: /胰腺|胰彩超|胰超声|^胰$/ },
  { key: 'spleen', label: '脾脏', pattern: /脾脏|脾彩超|脾超声|^脾$/ },
  { key: 'thyroid', label: '甲状腺', pattern: /甲状腺/ },
  { key: 'lymph', label: '淋巴结', pattern: /淋巴结/ },
  { key: 'breast', label: '乳腺', pattern: /乳腺|乳房/ },
];

function itemContext(item) {
  return clean(`${item?.name || ''} ${item?.sourceSection || ''} ${item?.orderName || ''}`);
}

function itemOwnOrgans(item) {
  // The shared section title describes expected coverage, not what this row
  // actually represents. Counting it here would let one thyroid row satisfy a
  // "thyroid + lymph node" combination by itself.
  const value = clean(`${item?.name || ''} ${item?.bodyPart || ''}`);
  return ORGAN_RULES.filter(rule => rule.pattern.test(value)).map(rule => rule.key);
}

function validateUltrasoundSubmission(items) {
  const list = Array.isArray(items) ? items : [];
  const ultrasound = list.map((item, index) => ({ item, index, context: itemContext(item) }))
    .filter(row => row.item?.itemType === 'imaging' && /超声|彩超|B超/.test(row.context));
  const issues = [];
  const addCoverageIssue = (rows, required) => {
    if (!rows.length) return;
    const present = new Set(rows.flatMap(row => itemOwnOrgans(row.item)));
    const missing = required.filter(rule => !present.has(rule.key));
    if (missing.length) issues.push({
      index: rows[0].index,
      sourceItemId: String(rows[0].item?.sourceItemId || ''),
      name: String(rows[0].item?.name || '组合超声'),
      reason: 'ultrasound_coverage_missing',
      missingOrgans: missing.map(rule => rule.label),
    });
  };

  const upperRows = ultrasound.filter(row => /肝.*胆.*(?:胰.*脾|脾.*胰)|上腹部(?:超声|彩超|B超)/.test(row.context));
  addCoverageIssue(upperRows, ORGAN_RULES.slice(0, 4));

  const thyroidLymphRows = ultrasound.filter(row => /甲状腺/.test(row.context) && /淋巴结/.test(row.context));
  addCoverageIssue(thyroidLymphRows, ORGAN_RULES.filter(rule => ['thyroid', 'lymph'].includes(rule.key)));

  const breastLymphRows = ultrasound.filter(row => /乳腺|乳房/.test(row.context) && /淋巴结/.test(row.context));
  addCoverageIssue(breastLymphRows, ORGAN_RULES.filter(rule => ['breast', 'lymph'].includes(rule.key)));
  return { complete: issues.length === 0, issues };
}

module.exports = { validateUltrasoundSubmission, itemOwnOrgans };
