// Transcribe only clearly separated ultrasound result rows from a PDF text layer.
// These candidates remain pending until a clinician compares them with the PDF.
const RADICALS = { '⽬': '目', '⻅': '见', '⼤': '大', '⻓': '长', '⾎': '血', '⻔': '门', '⾃': '自', '⽤': '用', '⼀': '一', '⼩': '小' };
const clean = value => String(value || '').replace(/[⽬⻅⼤⻓⾎⻔⾃⽤⼀⼩]/g, char => RADICALS[char]);
const HEADER = /^检查项目\s+检查所见\s+单位\s*$/;
const OPINION = /^初步意见\s+(.+)$/;
const FOOTER = /^(?:\*?\s*温馨提示|注\s*[:：]|全国统一|爱康国宾|\S.*\d+\s*\/\s*\d+\s*$)/;

function leadingContinuation(nextLayout) {
  const lines = clean(nextLayout).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let punctuation = '';
  for (const line of lines) {
    if (HEADER.test(line) || FOOTER.test(line)) break;
    if (/^健康体检报告/.test(line)) continue;
    if (/^[。；，]+$/.test(line)) { punctuation += line; continue; }
    const opinion = line.match(OPINION);
    if (opinion) return { punctuation, diagnosis: opinion[1].trim() };
    if (!/^检查(?:医生|者)/.test(line)) break;
  }
  return null;
}

function parseTextUltrasoundTable(layout, sourcePage, nextLayout = '') {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = clean(layout).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const items = [];
  let inTable = false;
  let prefix = '';
  let current = null;
  let headerCount = 0;
  for (const line of lines) {
    if (HEADER.test(line)) { inTable = true; headerCount++; prefix = ''; current = null; continue; }
    if (!inTable) continue;
    if (FOOTER.test(line)) { inTable = false; continue; }
    const opinion = line.match(OPINION);
    if (opinion) {
      // A shared opinion cannot safely be assigned to one of several projects.
      if (items.length === 1 && opinion[1].trim()) {
        items[0].diagnosis = opinion[1].trim();
        items[0].conclusion = opinion[1].trim();
      }
      inTable = false;
      continue;
    }
    const cells = line.split(/\s{2,}/).map(cell => cell.trim()).filter(Boolean);
    const [name, finding] = cells;
    if (cells.length === 2 && /^[\u4e00-\u9fff]{2,20}$/.test(name)
      && !/检查|医生|时间|备注/.test(name) && finding && finding.length <= 300) {
      current = { name, itemType: 'imaging', findings: prefix + finding, diagnosis: '', conclusion: '',
        status: 'unknown', manualReviewStatus: 'pending', sourcePage,
        sourceSection: name, sourceSectionOrder: headerCount, sourceRowOrder: items.length + 1 };
      items.push(current);
      prefix = '';
      continue;
    }
    if (!/[\u4e00-\u9fff]/.test(line) || line.length > 300) continue;
    if (current) current.findings += line;
    else prefix += line;
  }
  if (items.length === 1 && !items[0].diagnosis && nextLayout) {
    const continuation = leadingContinuation(nextLayout);
    if (continuation) {
      items[0].findings += continuation.punctuation;
      items[0].diagnosis = continuation.diagnosis;
      items[0].conclusion = continuation.diagnosis;
    }
  }
  return { supported: headerCount === 1 && items.length === 1 && Boolean(items[0].findings),
    items, diagnostics: { headers: headerCount, candidateRows: items.length } };
}

module.exports = { parseTextUltrasoundTable };
