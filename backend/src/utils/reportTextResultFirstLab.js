// Searchable lab tables with result after the name and optional prior-result column.
// A complete printed header and multiple same-layout rows are required.
const HEADER = /^(?:分析项目|项目名称)\s{2,}(?:检查|检验|本次)结果\s{2,}(?:参考值|参考范围)/;
const VALUE = /^(?:[<>≤≥]?[+-]?\d+(?:\.\d+)?(?:\s*[-~–—至]\s*[+-]?\d+(?:\.\d+)?)?|阴性(?:\(-\))?|阳性|弱阳性(?:\(±\))?|未检到|未检出|未见|清|黄色|黄|少量|中量|大量|[ⅠⅡⅢⅣIVX]{1,4}|[-—])(?:\s*[↑↓HL])?$/i;
const FOOTER = /^(?:报告者|报告医师|检查医生|审核医生|报告日期|检查日期|病案号|病历号|第\s*\d+\s*页|小结|备注)/;

function parseTextResultFirstLab(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/);
  const items = [];
  let section = '';
  let sectionOrder = 0;
  let tableOpen = false;
  let previousColumn = false;
  let unitColumn = false;
  for (const original of lines) {
    const line = original.trim();
    if (!line) continue;
    if (FOOTER.test(line)) { tableOpen = false; continue; }
    if (HEADER.test(line)) {
      tableOpen = Boolean(section);
      previousColumn = /上次(?:检查)?结果/.test(line);
      unitColumn = /单\s*位/.test(line);
      continue;
    }
    if (/^[『【][^』】]{2,45}[』】]$/.test(line)) {
      section = line.slice(1, -1).trim(); sectionOrder++; tableOpen = false; continue;
    }
    if (/^[\u4e00-\u9fffA-Za-z（）()+]{2,30}$/.test(line)
      && /常规|生化|检测|检验|分析|定量|功能|血象/.test(line)
      && !/^(?:姓名|日期|报告|检查|检验|分析项目|项目名称|本次结果|上次结果)/.test(line)) {
      section = line; sectionOrder++; continue;
    }
    if (!tableOpen) continue;
    const cells = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (cells.length < 3 || cells.length > 6) continue;
    const [name, rawValue, referenceRange] = cells;
    if (!/^[\u4e00-\u9fffA-Za-zα-ωΑ-Ω0-9.()（）+-]{2,45}$/.test(name)
      || !VALUE.test(rawValue) || !referenceRange || referenceRange.length > 45) continue;
    const hasPrintedUnit = unitColumn && (!previousColumn || cells.length >= 5);
    const unit = hasPrintedUnit ? cells[3] || '' : '';
    if (hasPrintedUnit && (!unit || unit.length > 24)) continue;
    if (previousColumn && cells.length < 4) continue;
    const marker = rawValue.match(/[↑↓HL]\s*$/i);
    const value = marker ? rawValue.slice(0, marker.index).trim() : rawValue;
    items.push({ name, value, referenceRange, unit, itemType: 'lab',
      status: marker || /^(?:阳性|弱阳性)/.test(value) ? 'abnormal' : 'unknown',
      manualReviewStatus: 'pending', sourcePage, sourceSection: section,
      sourceSectionOrder: sectionOrder, sourceRowOrder: items.filter(item => item.sourceSectionOrder === sectionOrder).length + 1 });
  }
  return { supported: items.length >= 4, items, diagnostics: { candidateRows: items.length } };
}

module.exports = { parseTextResultFirstLab };
