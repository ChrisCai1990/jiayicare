// Transcribe text-layer tables whose printed columns are name, reference, unit, result.
// Only complete rows under an explicit table header become pending review items.
const { normalizeExplicitNormalStatus } = require('./reportAuditMerge');
const RESULT = /^(?:[<>≤≥]?[+-]?\d+(?:\.\d+)?|阴性|阳性|弱阳性|黄色|黄|软|硬|清亮|浑浊|未见|[-—])$/;
const REFERENCE = /^(?:[<>≤≥]?[+-]?\d+(?:\.\d+)?(?:\s*[-~–—至]\s*[+-]?\d+(?:\.\d+)?)?|阴性|阳性|黄色|黄|软|硬|[-—])$/;

function parseTextReferenceFirstLab(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/);
  const items = [];
  let section = '';
  let sectionOrder = 0;
  let headerReady = false;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^【([^】]{2,45})】/);
    if (heading) {
      section = heading[1].trim();
      sectionOrder++;
      headerReady = false;
      continue;
    }
    if (!section) continue;
    if (/项目名称\s+参考值\s+单位/.test(line)) { headerReady = true; continue; }
    if (!headerReady || /^(?:小结|检查人员|审核医生|备注|本次结果|上次结果|第\s*\d+\s*页)/.test(line)) continue;
    const cells = line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
    if (cells.length < 4 || cells.length > 5) continue;
    const [name, referenceRange, unit, rawResult, marker] = cells;
    const value = rawResult.replace(/[.。*]+$/, '').trim();
    if (!/[\u4e00-\u9fff]/.test(name) || name.length > 40
      || !REFERENCE.test(referenceRange) || !unit || unit.length > 20 || !RESULT.test(value)
      || (marker && !/^[.。*HhLl↑↓]+$/.test(marker))) continue;
    const item = { name, value, unit, referenceRange, itemType: 'lab', status: /[HhLl↑↓]/.test(marker || '') ? 'abnormal' : 'unknown',
      manualReviewStatus: 'pending', sourcePage, sourceSection: section,
      sourceSectionOrder: sectionOrder, sourceRowOrder: items.filter(x => x.sourceSectionOrder === sectionOrder).length + 1 };
    items.push(normalizeExplicitNormalStatus(item));
  }
  return { supported: items.length >= 4, items, diagnostics: { candidateRows: items.length } };
}

module.exports = { parseTextReferenceFirstLab };
