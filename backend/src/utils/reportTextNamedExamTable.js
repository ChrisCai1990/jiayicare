// Conservative transcription of named narrative exam tables from searchable PDFs.
// The printed section title, three-column header and result row are all required.
const TITLE = /^【([^】]{2,45})】/;
const HEADER = /项目名称\s{2,}影像表现\s{2,}诊断结论/;
const FOOTER = /^(?:报告者|报告医师|检查医生|审核医生|报告日期|检查日期|第\s*\d+\s*页|温馨提示)/;
const GENERIC = /^(?:影像结果|检查结果|超声结果)$/;

function parseTextNamedExamTable(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/);
  const items = [];
  let section = '';
  let sectionOrder = 0;
  let findingsColumn = -1;
  let diagnosisColumn = -1;
  let findings = [];
  let diagnosis = [];
  let started = false;
  const flush = () => {
    const findingText = findings.join('\n').trim();
    if (section && started && findingText.length >= 8) {
      items.push({ name: section, sourceSection: section, itemType: 'imaging',
        findings: findingText, diagnosis: diagnosis.join('\n').trim(), status: 'unknown',
        manualReviewStatus: 'pending', sourcePage, sourceSectionOrder: sectionOrder, sourceRowOrder: 1 });
    }
    findings = []; diagnosis = []; started = false; findingsColumn = -1; diagnosisColumn = -1;
  };
  for (const original of lines) {
    const line = original.trimEnd();
    const title = line.trim().match(TITLE);
    if (title) {
      flush(); section = title[1].trim(); sectionOrder++;
      continue;
    }
    if (!section) continue;
    const header = line.match(HEADER);
    if (header) {
      flush();
      findingsColumn = line.indexOf('影像表现');
      diagnosisColumn = line.indexOf('诊断结论');
      continue;
    }
    if (findingsColumn < 0 || diagnosisColumn <= findingsColumn) continue;
    if (FOOTER.test(line.trim())) { flush(); section = ''; continue; }
    const cells = line.trim().split(/\s{2,}/).map(value => value.trim()).filter(Boolean);
    const firstColumn = line.search(/\S/);
    let finding = '';
    let opinion = '';
    if (!started) {
      if (!GENERIC.test(cells[0]) || cells.length < 2) continue;
      finding = cells[1];
      opinion = cells.slice(2).join(' ');
      started = true;
    } else if (firstColumn < findingsColumn - 2) {
      // A second result row needs a separate item rather than being folded into
      // this exam; leave it to the visual review path.
      flush(); continue;
    } else if (cells.length >= 2) {
      finding = cells[0]; opinion = cells.slice(1).join(' ');
    } else if (firstColumn >= diagnosisColumn - 2) {
      opinion = cells[0] || '';
    } else {
      finding = cells[0] || '';
    }
    if (finding && !/^[-─—_\s]+$/.test(finding)) findings.push(finding);
    if (opinion && !/^[-─—_\s]+$/.test(opinion)) diagnosis.push(opinion);
  }
  flush();
  return { supported: items.length > 0, items,
    diagnostics: { candidateExams: items.length } };
}

module.exports = { parseTextNamedExamTable };
