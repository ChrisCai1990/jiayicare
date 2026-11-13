// Conservative transcription of a PDF text-layer lab table. Candidates still
// require clinical review; this parser never assigns a normal result by range.
const VALUE = /^(?:[<>≤≥]?[+-]?\d+(?:[.,]\d+)?|阴性|阳性|弱阳性|正常|未见|清亮|浑浊|黄色|淡黄|透明|无色|DOB\s*[=:]\s*[+-]?\d+(?:\.\d+)?(?:[,，]\s*(?:阴性|阳性))?)$/i;
const HEADING = /(?:呼气试验|甲状腺功能|尿常规|肿瘤.{0,6}项|生化\d+项|糖化血红蛋白|血常规|心电图)/;
const HEADER = /项目名称\s+检(?:查|验)结果/;
const STOP = /^(?:本次结果|报告医生|检查医生|报告时间|检查时间|姓名|体检号|病历号|备注|第\s*\d+\s*页)/;

function parseTextLabTable(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const items = [];
  let section = '';
  let tableOpen = false;
  let headers = 0;
  let rejectedRows = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (STOP.test(line)) { tableOpen = false; continue; }
    if (HEADER.test(line)) { tableOpen = true; headers++; continue; }
    if (HEADING.test(line) && !/\s{2,}/.test(line)) {
      section = line;
      tableOpen = false;
      if (/心电图/.test(line)) {
        const narrative = lines.slice(index + 1, index + 5)
          .find(next => /心律|心电图|心动过|房颤|传导阻滞|ST.?T/.test(next) && !/检查结果|报告时间/.test(next));
        if (narrative && narrative.length <= 90) items.push({ name: line, itemType: 'imaging', findings: narrative,
          manualReviewStatus: 'pending', sourcePage, sourceSection: line,
          sourceSectionOrder: headers + 1, sourceRowOrder: items.length + 1, status: 'unknown' });
      }
      continue;
    }
    if (!tableOpen || !section || /项目名称|参考范围|单\s*位/.test(line)) continue;
    const cells = line.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
    // A long analyte name may leave only one space before a '<' result.
    const tightValue = cells[0]?.match(/^(.+?)\s+([<>≤≥][+-]?\d+(?:[.,]\d+)?)$/);
    if (tightValue) cells.splice(0, 1, tightValue[1], tightValue[2]);
    if (cells.length < 2) continue;
    const [name, value, ...rest] = cells;
    if (!VALUE.test(value) || !/[\u4e00-\u9fffA-Za-z]/.test(name) || name.length > 45 || STOP.test(name)) {
      rejectedRows++;
      continue;
    }
    let marker = '';
    if (rest.length && /^(?:↑|↓|H|L)$/i.test(rest[0])) marker = rest.shift();
    const referenceRange = rest.shift() || '';
    const unit = rest.join(' ');
    const status = marker || /^(?:阳性|弱阳性)$/.test(value) ? 'abnormal'
      : /(?:^|[,，]\s*)阴性$/.test(value) ? 'normal' : 'unknown';
    items.push({ name, value, referenceRange, unit, status,
      itemType: 'lab', manualReviewStatus: 'pending', sourcePage, sourceSection: section,
      sourceSectionOrder: headers, sourceRowOrder: items.length + 1 });
  }
  return { supported: headers >= 1 && items.filter(item => item.itemType === 'lab').length >= 6,
    items, diagnostics: { headers, rejectedRows, candidateRows: items.length } };
}

module.exports = { parseTextLabTable };
