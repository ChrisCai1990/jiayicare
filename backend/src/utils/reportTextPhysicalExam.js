// Conservative PDF text-layer transcription of printed department exam rows.
// Every result stays pending until a clinician checks it against the original.
const SECTION = /^【\s*(一般项目\(基础\)|眼科体检|耳鼻喉科体检|全科医学检查)\s*】$/;
const ANY_SECTION = /^【[^】]{2,40}】$/;
const METADATA = /^(?:检查医生|检验医生|报告时间|检查时间|报告医生|体检号|姓名|眼科体检|耳鼻喉科体检|项目名称|检查结果|初检时间|复检时间|邵逸夫医院体检报告)/;
const RESULT = /[\u4e00-\u9fffA-Za-z\d≥≤<>]/;

function parseTextPhysicalExam(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/);
  const items = [];
  let section = '';
  let sectionOrder = 0;
  let rowOrder = 0;
  for (const original of lines) {
    const line = original.trim();
    if (!line) continue;
    if (ANY_SECTION.test(line)) {
      sectionOrder++;
      section = SECTION.test(line) ? line : '';
      rowOrder = 0;
      continue;
    }
    if (!section || METADATA.test(line) || /^[-─—_\s]+$/.test(line)) continue;
    // This print layout has exactly one project and one result column. Do not
    // infer a row when pdftotext merges multiple columns or drops the gap.
    const cells = line.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
    if (cells.length !== 2) continue;
    const [name, finding] = cells;
    if (!name || !finding || name.length > 30 || finding.length > 100
      || METADATA.test(name) || METADATA.test(finding) || !/[\u4e00-\u9fffA-Za-z]/.test(name)
      || !RESULT.test(finding) || /(?:姓名|身份证|手机号|体检号|报告时间|检查医生|Page\d+\/\d+)/i.test(`${name}${finding}`)) continue;
    const basic = /一般项目\(基础\)/.test(section);
    items.push({ name, itemType: basic ? 'data' : 'imaging', findings: basic ? '' : finding,
      value: basic ? finding : '', diagnosis: '',
      status: 'unknown', manualReviewStatus: 'pending', sourcePage,
      sourceSection: section, sourceSectionOrder: sectionOrder, sourceRowOrder: ++rowOrder });
  }
  return { supported: items.length >= 4, items,
    diagnostics: { candidateRows: items.length, sections: new Set(items.map(item => item.sourceSection)).size } };
}

module.exports = { parseTextPhysicalExam };
