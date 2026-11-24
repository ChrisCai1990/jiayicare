// Supplement explicit organ paragraphs from a readable ultrasound text layer.
const compact = value => String(value || '').normalize('NFKC')
  .replace(/[\s，,。；;：:、()（）\[\]【】]/g, '');
const FINDINGS = /^检查所见\s*[:：]?\s*$/;
const DIAGNOSIS = /^(?:诊断意见|诊断结论|超声提示)\s*[:：]?\s*$/;
const ORGAN = /^(双肾|双侧输尿管|膀胱|前列腺|甲状腺|双侧颈动脉|肝脏|胆囊|胰腺|脾脏)(?=切面|形态|大小|充盈|未见|内|壁|回声|血管)/;

function parseTextNarrativeOrgans(lines, existingPageItems, sourcePage) {
  const blocks = [];
  for (const line of lines) {
    const name = line.match(ORGAN)?.[1];
    if (name) blocks.push({ name, lines: [line] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(line);
  }
  if (blocks.length < 2 || new Set(blocks.map(block => block.name)).size !== blocks.length) return null;
  return blocks.map(block => ({ name: block.name, itemType: 'imaging',
    findings: block.lines.join('\n'), sourcePage, sourceSection: block.name,
    manualReviewStatus: 'pending', status: 'unknown' }))
    .filter(item => compact(item.findings).length >= 8)
    .filter(item => !(existingPageItems || []).some(existing =>
      Number(existing.sourcePage) === sourcePage
      && ((/肝胆脾胰/.test(existing.name || '') && /^(肝脏|胆囊|胰腺|脾脏)$/.test(item.name))
        || compact(existing.findings).includes(compact(item.findings))
        || ((compact(existing.name) === compact(item.name)
          || compact(existing.name) === compact(`${item.name}超声`))
          && (existing.manualReviewStatus === 'reviewed' || !compact(existing.findings))))))
    .map(item => {
      const aliases = (existingPageItems || []).filter(existing =>
        Number(existing.sourcePage) === sourcePage
        && compact(existing.name) === compact(`${item.name}超声`)
        && existing.manualReviewStatus !== 'reviewed'
        && compact(existing.findings).length >= 8
        && compact(item.findings).includes(compact(existing.findings)));
      return aliases.length === 1
        ? { ...item, name: aliases[0].name, sourceSection: aliases[0].sourceSection || item.sourceSection }
        : item;
    });
}

function parseTextNarrativeFindings(layout, existingPageItems, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = String(layout || '').split(/\r?\n/).map(line => line.trim());
  const starts = lines.flatMap((line, index) => FINDINGS.test(line) ? [index] : []);
  const ends = lines.flatMap((line, index) => DIAGNOSIS.test(line) ? [index] : []);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] <= starts[0] + 1) {
    return { supported: false, items: [], diagnostics: { reason: 'section_ambiguous' } };
  }
  const findings = lines.slice(starts[0] + 1, ends[0]).filter(Boolean).join('\n').trim();
  const complete = compact(findings);
  if (complete.length < 80) return { supported: false, items: [], diagnostics: { reason: 'section_short' } };
  const specificExisting = (existingPageItems || []).some(item => /肝胆脾胰|双肾|输尿管|膀胱|前列腺|甲状腺|颈动脉/.test(item.name || ''));
  if (!specificExisting) return { supported: false, items: [], diagnostics: { reason: 'no_matching_exam' } };
  const organItems = parseTextNarrativeOrgans(
    lines.slice(starts[0] + 1, ends[0]).filter(Boolean), existingPageItems, sourcePage);
  return { supported: Boolean(organItems?.length), items: organItems || [],
    diagnostics: { source: 'pdf_text', organBlocks: organItems?.length || 0 } };
}

module.exports = { parseTextNarrativeFindings };
