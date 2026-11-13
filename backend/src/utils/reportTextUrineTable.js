// Transcribe a searchable two-column urine table into pending review rows.
// The printed section marker and repeated right-column anchor make this path
// specific to the observed layout; an unsupported page falls back to vision.
const LEFT = new Set(['尿液浊度', '胆红素', '比重', 'pH', '尿胆原', '白细胞酯酶', '红细胞', '上皮细胞', '管型', '细菌']);
const RIGHT = new Set(['尿液颜色', '葡萄糖', '酮体', '潜血', '蛋白质', '亚硝酸盐', '白细胞', '小圆上皮细胞', '病理管型', '结晶']);
const VALUE = /^(?:\d+(?:\.\d+)?|阴性|阳性|弱阳性|黄色|淡黄|清亮|浑浊)$/;

function parseTextUrineTable(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/);
  const start = lines.findIndex(line => /[『【]尿液干化学分析[』】]/.test(line));
  if (start < 0) return { supported: false, items: [], diagnostics: { reason: 'section_missing' } };
  const anchor = lines.slice(start + 1, start + 8).find(line => line.includes('尿液颜色'));
  const rightStart = anchor?.indexOf('尿液颜色') ?? -1;
  if (rightStart < 35 || rightStart > 80) return { supported: false, items: [], diagnostics: { reason: 'column_missing' } };
  const items = [];
  let rowOrder = 0;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(?:备注：|[『【](?!尿干化学|尿有形成分分析))/.test(line)) break;
    const halves = [line.slice(0, rightStart), line.slice(rightStart)];
    for (let side = 0; side < 2; side++) {
      const cells = halves[side].trim().split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const [name, rawValue, referenceRange = ''] = cells;
      if (!(side === 0 ? LEFT : RIGHT).has(name)) continue;
      const marker = rawValue.match(/^(H|L|↑|↓)\s+(.+)$/i);
      const value = marker ? marker[2].trim() : rawValue;
      if (!VALUE.test(value) || (referenceRange && referenceRange.length > 35)) continue;
      const unit = referenceRange.match(/(\/μL)$/)?.[1] || '';
      items.push({ name, value, referenceRange, unit,
        status: marker || /^(?:阳性|弱阳性)$/.test(value) ? 'abnormal' : 'unknown',
        itemType: 'lab', manualReviewStatus: 'pending', sourcePage,
        sourceSection: '『尿液干化学分析』', sourceSectionOrder: 1,
        sourceRowOrder: ++rowOrder });
    }
  }
  return { supported: items.length >= 12 && items.some(item => item.name === '比重')
    && items.some(item => item.name === '蛋白质'), items,
  diagnostics: { candidateRows: items.length, rightStart } };
}

module.exports = { parseTextUrineTable };
