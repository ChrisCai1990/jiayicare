const GROUPS = [
  ['metabolic', '代谢相关'], ['respiratory', '呼吸系统'], ['digestive', '消化系统'],
  ['cardiovascular', '心血管'], ['endocrine', '内分泌'], ['renal', '泌尿系统'], ['oral', '口腔'], ['other', '其他问题'],
];
const normalize = value => String(value || '').trim().replace(/[\s（()）]/g, '').toLowerCase();
function identity(title) {
  const name = normalize(title);
  // Only explicit single-topic aliases; a multi-problem title is never collapsed.
  if (/^(?:轻度|中度|重度|轻中度|疑似|可能)?脂肪肝(?:可能|倾向|待核实)?$/.test(name)) return 'fatty_liver';
  if (/^(?:肺内|肺部|双肺|肺)结节(?:影|待核实)?$/.test(name)) return 'lung_nodule';
  if (/^(?:牙结石|牙石)$/.test(name)) return 'dental_calculus';
  return name;
}
function groupFor(title) {
  if (/脂肪肝|体重|体质指数|BMI|甘油三酯|胆固醇|血脂|血糖|糖化|尿酸|肥胖|超重/i.test(title)) return 'metabolic';
  if (/肺|胸膜|呼吸|气管/.test(title)) return 'respiratory';
  if (/胃|肝|胆|胰|脾|肠|消化/.test(title)) return 'digestive';
  if (/心|血压|动脉|静脉/.test(title)) return 'cardiovascular';
  if (/甲状腺|激素|内分泌/.test(title)) return 'endocrine';
  if (/肾|尿|膀胱|前列腺/.test(title)) return 'renal';
  if (/牙|口腔|齿/.test(title)) return 'oral';
  return 'other';
}
const unique = values => [...new Set(values.filter(Boolean))];
function mergeProblems(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const key = issue.problemKey || identity(issue.title);
    // A manual exclusion or different advisor decision stays separate until reviewed.
    const slot = `${key}:${issue.decision || 'include'}`;
    const refs = issue.sourceRefs || (issue.sourceIds || [issue.id]).map(sourceId => ({ sourceId, sourceName: issue.sourceName, page: issue.page,
      date: issue.sourceDate || '', excerpt: issue.evidence, evidence: issue.evidence, originalRecommendation: issue.originalRecommendation, timing: issue.timing }));
    const current = groups.get(slot);
    if (!current) { groups.set(slot, { ...issue, problemKey: key, group: issue.group || groupFor(issue.title), sourceRefs: [...refs], sourceIds: unique(issue.sourceIds || refs.map(ref => ref.sourceId)), memberIds: unique(issue.memberIds || [issue.id]) }); continue; }
    current.memberIds = unique([...current.memberIds, ...(issue.memberIds || [issue.id])]);
    current.sourceIds = unique([...current.sourceIds, ...(issue.sourceIds || refs.map(ref => ref.sourceId))]);
    for (const ref of refs) if (!current.sourceRefs.some(old => old.sourceId === ref.sourceId && old.excerpt === ref.excerpt)) current.sourceRefs.push(ref);
    for (const field of ['originalRecommendation', 'suggestedRecommendation', 'timing', 'exclusionReason']) current[field] = unique([current[field], issue[field]]).join('\n');
    const opinions = unique([...(current.advisorAlternatives || []), ...(issue.advisorAlternatives || []), current.advisorRecommendation, issue.advisorRecommendation]);
    if (opinions.length > 1) { current.advisorAlternatives = opinions; current.advisorRecommendation = ''; current.recommendationConflict = true; }
    else if (!current.recommendationConflict) current.advisorRecommendation = opinions[0] || '';
    current.needsVerification ||= issue.needsVerification;
    current.sourceName = unique(current.sourceRefs.map(ref => ref.sourceName)).join('、');
    current.evidence = unique(current.sourceRefs.map(ref => ref.excerpt || ref.evidence)).join('\n');
  }
  return [...groups.values()];
}
module.exports = { GROUPS, identity, groupFor, mergeProblems };
