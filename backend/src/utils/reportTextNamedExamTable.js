// Conservative transcription of named narrative exam tables from searchable PDFs.
// The printed section title, three-column header and result row are all required.
const TITLE = /^【([^】]{2,45})】/;
const HEADER = /项目名称\s{2,}影像表现\s{2,}诊断结论/;
const FOOTER = /^(?:报告者|报告医师|检查医生|审核医生|报告日期|检查日期|第\s*\d+\s*页|温馨提示)/;
const GENERIC = /^(?:影像结果|检查结果|超声结果)$/;

function parseNamedExamBoxes(boxes, sourcePage) {
  const words = (boxes || []).filter(word => Number.isFinite(word.x) && Number.isFinite(word.y)
    && String(word.text || '').trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const headings = words.filter(word => TITLE.test(word.text));
  const items = [];
  for (const [index, heading] of headings.entries()) {
    const nextY = headings[index + 1]?.y ?? Infinity;
    const sectionWords = words.filter(word => word.y > heading.y + 3 && word.y < nextY);
    const resultLabel = sectionWords.find(word => GENERIC.test(word.text));
    if (!resultLabel) continue;
    const headerAnchor = sectionWords.find(word => word.text === '影像表现'
      && word.y < resultLabel.y && resultLabel.y - word.y < 45);
    const header = headerAnchor ? sectionWords.filter(word => Math.abs(word.y - headerAnchor.y) < 3) : [];
    if (!header.some(word => word.text === '项目名称')
      || !header.some(word => word.text === '影像表现')
      || !header.some(word => word.text === '诊断结论')) continue;
    const firstRow = sectionWords.filter(word => Math.abs(word.y - resultLabel.y) < 3)
      .sort((a, b) => a.x - b.x);
    const findingWord = firstRow.find(word => word.x > resultLabel.x + 30 && !GENERIC.test(word.text));
    if (!findingWord) continue;
    const diagnosisWord = firstRow.find(word => word.x > findingWord.x + 110);
    const findingX = findingWord.x;
    const diagnosisX = diagnosisWord?.x ?? Infinity;
    const findingLines = [];
    const diagnosisLines = [];
    const resultWords = sectionWords.filter(word => word.y >= resultLabel.y - 2 && word.x >= findingX - 15)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const word of resultWords) {
      if (FOOTER.test(word.text) || /(?:体检号|病历号|病案号|姓名\s*[:：]|性别\s*[:：]|第\s*\d+\s*\/\s*\d+\s*页)/.test(word.text)
        || /^\f$/.test(word.text)) break;
      if (word.y > resultLabel.y + 2 && /^(?:项目名称|影像表现|诊断结论|影像结果)$/.test(word.text)) break;
      const target = word.x >= diagnosisX - 15 ? diagnosisLines : findingLines;
      const previous = target[target.length - 1];
      if (previous && Math.abs(previous.y - word.y) < 3) previous.text += word.text;
      else target.push({ y: word.y, text: word.text });
    }
    const findings = findingLines.map(line => line.text).join('\n').trim();
    if (findings.length < 8) continue;
    items.push({ name: heading.text.slice(1, -1).trim(), sourceSection: heading.text.slice(1, -1).trim(),
      itemType: 'imaging', findings, diagnosis: diagnosisLines.map(line => line.text).join('\n').trim(),
      status: 'unknown', manualReviewStatus: 'pending', sourcePage,
      sourceSectionOrder: index + 1, sourceRowOrder: 1 });
  }
  return { supported: items.length > 0, items, diagnostics: { candidateExams: items.length, source: 'pdf_bbox' } };
}

function filterUncoveredNamedExams(existingItems, candidates) {
  const key = value => String(value || '').normalize('NFKC').replace(/[\s【】『』]/g, '');
  return (candidates || []).filter(candidate => !(existingItems || []).some(existing =>
    existing?.itemType === 'imaging' && Number(existing.sourcePage) === Number(candidate.sourcePage)
    && key(existing.sourceSection || existing.orderName) === key(candidate.sourceSection)
    && String(existing.findings || existing.diagnosis || existing.conclusion || '').trim()));
}

function parseCrossPageNamedExamTable(previousLayout, currentBoxes, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 2) return { supported: false, items: [] };
  const previous = String(previousLayout || '').split(/\r?\n/);
  const lastTitle = previous.map((line, index) => ({ title: line.trim().match(TITLE), index }))
    .filter(row => row.title).at(-1);
  if (!lastTitle) return { supported: false, items: [] };
  const afterTitle = previous.slice(lastTitle.index + 1);
  if (!afterTitle.some(line => HEADER.test(line)) || afterTitle.some(line => /(?:影像结果|检查结果|超声结果)/.test(line))) {
    return { supported: false, items: [] };
  }
  const firstCurrentHeadingY = (currentBoxes || []).filter(word => TITLE.test(String(word.text || '')))
    .map(word => word.y).sort((a, b) => a - b)[0] ?? Infinity;
  const result = (currentBoxes || []).find(word => GENERIC.test(String(word.text || ''))
    && Number.isFinite(word.y) && word.y < firstCurrentHeadingY);
  if (!result) return { supported: false, items: [] };
  const headerY = result.y - 19;
  const synthetic = [
    { text: lastTitle.title[0], x: 30, y: 0 },
    { text: '项目名称', x: 66, y: headerY },
    { text: '影像表现', x: 240, y: headerY },
    { text: '诊断结论', x: 447, y: headerY },
    ...(currentBoxes || []),
  ];
  const parsed = parseNamedExamBoxes(synthetic, sourcePage);
  return { supported: Boolean(parsed.items[0]), items: parsed.items.slice(0, 1),
    diagnostics: { source: 'cross_page_pdf_bbox', candidateExams: Math.min(parsed.items.length, 1) } };
}

function parseTextNamedExamTable(layout, sourcePage, boxes = null) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  if (Array.isArray(boxes) && boxes.length) return parseNamedExamBoxes(boxes, sourcePage);
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

module.exports = { parseTextNamedExamTable, parseCrossPageNamedExamTable, filterUncoveredNamedExams };
