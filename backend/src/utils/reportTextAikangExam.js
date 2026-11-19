// Conservative transcription of two clearly labelled Aikang PDF text layouts.
// Keep original wording in pending imaging items; no image interpretation.
const clean = text => String(text || '').normalize('NFKC')
  .replace(/[⻅⻮⻓⻔⽛]/g, char => ({ '⻅': '见', '⻮': '齿', '⻓': '长', '⻔': '门', '⽛': '牙' })[char]);

function parseTextAikangExam(layout, sourcePage) {
  if (!Number.isInteger(sourcePage) || sourcePage < 1) throw new Error('页码无效');
  const lines = clean(layout).split(/\r?\n/).map(line => line.trimEnd());
  const text = lines.join('\n');
  if (!/健康体检报告\s+MEDICAL EXAMINATION REPORT/.test(text)) return { supported: false, items: [] };
  const item = (name, findings, diagnosis = '') => ({ name, itemType: 'imaging',
    findings, diagnosis, status: 'unknown', manualReviewStatus: 'pending',
    sourcePage, sourceSection: name, sourceSectionOrder: 1, sourceRowOrder: 1 });

  if (lines.some(line => /^CT室(?:\s|$)/.test(line.trim()))) {
    const header = lines.findIndex(line => /^检查项目\s+检查所见\s+单位\s*$/.test(line.trim()));
    const opinion = lines.findIndex((line, index) => index > header && /^(?:初步意见\s*)?1[.．、]/.test(line.trim()));
    const row = lines.findIndex((line, index) => index > header && index < opinion && /胸部[（(]CT[）)]/.test(line));
    if (header < 0 || opinion < 0 || row < 0) return { supported: false, items: [] };
    const findings = lines.slice(header + 1, opinion).map(line => line.replace(/胸部[（(]CT[）)]/, '').trim())
      .filter(Boolean).join('').replace(/\s{2,}/g, '');
    const numbered = [];
    for (const line of lines.slice(opinion)) {
      if (/^(?:爱康国宾|全国统一|注\s*[:：])/.test(line.trim())) break;
      const match = line.trim().match(/^(?:初步意见\s*)?(\d+)[.．、](.+)$/);
      if (match) numbered.push(`${match[1]}.${match[2].trim()}`);
    }
    if (!findings.includes('两肺') || numbered.length < 2) return { supported: false, items: [] };
    return { supported: true, items: [item('胸部（CT）', findings, numbered.join('\n'))] };
  }

  if (/\d+[.．、]口腔检查结果/.test(text)) {
    const header = lines.findIndex(line => /^序号\s+症状描述\s+建议\s*$/.test(line.trim()));
    const footer = lines.findIndex((line, index) => index > header && /^巴氏刷牙法/.test(line.trim()));
    if (header < 0 || footer < 0) return { supported: false, items: [] };
    const table = lines.slice(header + 1, footer).map(line => line.trimEnd()).filter(line => line.trim());
    const numbered = table.filter(line => /^\s*[1-5]\s{2,}\S/.test(line));
    if (numbered.length !== 5 || !table.some(line => /[（(]42[）)]牙缺失/.test(line))) return { supported: false, items: [] };
    return { supported: true, items: [item('口腔检查结果', table.join('\n'))] };
  }
  return { supported: false, items: [] };
}

module.exports = { parseTextAikangExam };
