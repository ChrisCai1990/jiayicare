// Representation compatibility only: never stringify objects or discard clinical list entries.
function normalizeAnnualOutput(raw) {
  const focus = raw?.annual_checkup?.focus;
  if (!Array.isArray(focus) || !focus.every(line => typeof line === 'string')) return raw;
  return { ...raw, annual_checkup: { ...raw.annual_checkup, focus: focus.map(line => line.trim()).filter(Boolean).join('\n') } };
}

function missingIncludedSourceIds(raw) {
  const rows = Object.entries(raw || {}).filter(([key]) => key !== 'evidenceCoverage')
    .flatMap(([, value]) => Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []);
  return (Array.isArray(raw?.evidenceCoverage) ? raw.evidenceCoverage : [])
    .filter(item => item.status === 'included' && !rows.some(row => row.sourceIds?.includes(item.sourceId)))
    .map(item => item.sourceId);
}

function sourceLinkRepairPrompt(candidate, evidence, missingLinks, errorMessage) {
  const actions = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'templateNodes', 'annual_checkup']
    .flatMap(module => (Array.isArray(candidate?.[module]) ? candidate[module] : candidate?.[module]?.standardPlanId ? [candidate[module]] : [])
      .map((row, index) => ({ module, index, name: String(row.items || row.name || row.reason || row.focus || '').slice(0, 600),
        basisSummary: String(row.basisSummary || row.matchReason || '').slice(0, 600), sourceIds: row.sourceIds || [] })));
  const sources = evidence.filter(item => missingLinks.includes(item.id)).map(item => ({
    id: item.id, content: JSON.stringify(item.content || '').slice(0, item.id === 'report_history' ? 3500 : 2400),
  }));
  return `你只修复年度方案的来源关联，不重新生成方案。以下行动内容、日期和模板不可改。把确实对应的来源ID补到已有行动，按module和index分组返回sourceLinkCorrections；不能为了过校验关联无关事项。仅summary、report_history这两类汇总来源如确实没有独立对应行动，可用coverageCorrections改为deferred或not_applicable并说明具体原因；已确认的具体来源必须关联行动。只输出JSON：{"sourceLinkCorrections":[{"module":"medical_treatment","index":0,"sourceIds":["真实来源ID"]}],"coverageCorrections":[{"sourceId":"summary","status":"deferred","reason":"具体原因"}]}。无须重复完整方案或全部来源核对。\n校验问题：${errorMessage}\n已有行动：${JSON.stringify(actions)}\n遗漏关联的来源：${JSON.stringify(sources)}`;
}

// A single bounded correction replaces the former focus-only call. Both attempts go
// through the identical source/template/clinical checks; invalid output is never cached ready.
async function validateOrRepairAnnual(raw, validate, complete) {
  let candidate = normalizeAnnualOutput(raw);
  let initialError;
  try { validate(candidate); return candidate; } catch (error) { initialError = error; }
  try {
    const missingLinks = missingIncludedSourceIds(candidate);
    const reply = await complete(candidate, initialError.message + (missingLinks.length
      ? `；已标记纳入但未关联到事项的来源ID：${missingLinks.join('、')}` : ''), missingLinks);
    let parsed;
    try { parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw Object.assign(new Error('AI校正返回格式不完整，未替换原方案'), { statusCode: 502 }); }
    if ((!Object.hasOwn(parsed || {}, 'annual_checkup') || !Array.isArray(parsed.evidenceCoverage))
      && !(missingLinks.length && Array.isArray(parsed?.sourceLinkCorrections))) {
      throw Object.assign(new Error('AI年度体检校正缺少模块或来源核对，未替换原方案'), { statusCode: 502 });
    }
    // A source-only reply leaves the clinical plan and other coverage untouched.
    candidate = normalizeAnnualOutput({ ...candidate,
      annual_checkup: Object.hasOwn(parsed, 'annual_checkup') ? parsed.annual_checkup : candidate.annual_checkup,
      evidenceCoverage: Array.isArray(parsed.evidenceCoverage) ? parsed.evidenceCoverage : candidate.evidenceCoverage });
    if (parsed.coverageCorrections !== undefined) {
      if (!Array.isArray(parsed.coverageCorrections)) throw new Error('来源状态校正格式无效');
      const pending = new Map();
      for (const patch of parsed.coverageCorrections) {
        if (!['summary', 'report_history'].includes(patch?.sourceId) || !missingLinks.includes(patch.sourceId)
          || !['deferred', 'not_applicable'].includes(patch?.status)
          || !String(patch.reason || '').trim() || pending.has(patch.sourceId)) throw new Error('来源状态校正缺少有效依据');
        pending.set(patch.sourceId, patch);
      }
      candidate = { ...candidate, evidenceCoverage: candidate.evidenceCoverage.map(item => pending.has(item.sourceId)
        ? { ...item, status: pending.get(item.sourceId).status, reason: pending.get(item.sourceId).reason.trim() } : item) };
    }
    // The annual/coverage correction may already resolve all failures. Extra patches
    // are not authoritative and must not invalidate a fully checked candidate.
    try { validate(candidate); return candidate; } catch { /* Repair remaining failures below. */ }
    // Add missing provenance to existing actions only. The final validator still checks
    // every source and every included coverage entry; clinical action text is immutable.
    if (parsed.sourceLinkCorrections !== undefined) {
      if (!Array.isArray(parsed.sourceLinkCorrections)) throw new Error('事项来源校正格式无效');
      for (const patch of parsed.sourceLinkCorrections) {
        const key = patch?.module, index = patch?.index;
        const row = key === 'annual_checkup' ? candidate.annual_checkup : candidate[key]?.[index];
        const sourceIds = patch?.sourceIds;
        if (!['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'templateNodes', 'annual_checkup'].includes(key)
          || !Number.isInteger(index) || index < 0 || (key === 'annual_checkup' && index !== 0)
          || !row?.standardPlanId
          || !Array.isArray(sourceIds) || !sourceIds.length
          || sourceIds.some(id => typeof id !== 'string' || !id.trim())) throw new Error('事项来源校正缺少有效事项或来源');
        const linked = [...new Set([...(Array.isArray(row.sourceIds) ? row.sourceIds : []), ...sourceIds])];
        candidate = { ...candidate, [key]: key === 'annual_checkup' ? { ...row, sourceIds: linked }
          : candidate[key].map((item, i) => i === index ? { ...item, sourceIds: linked } : item) };
      }
    }
    // Permit only source/date metadata corrections on existing actions; never remove or rewrite actions.
    if (parsed.timingCorrections !== undefined) {
      if (!Array.isArray(parsed.timingCorrections)) throw new Error('时间来源校正格式无效');
      const seen = new Set();
      for (const patch of parsed.timingCorrections) {
        const key = patch?.module, index = patch?.index;
        if (!['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'templateNodes'].includes(key)
          || !Number.isInteger(index) || index < 0 || !candidate[key]?.[index] || seen.has(`${key}:${index}`)
          || !['timingSourceId', 'timingBaseDate', 'dateSelectionReason'].every(field => typeof patch[field] === 'string')
          || !patch.timingSourceId.trim() || !patch.timingBaseDate.trim()) throw new Error('时间来源校正缺少有效事项或依据');
        seen.add(`${key}:${index}`);
        candidate = { ...candidate, [key]: candidate[key].map((item, i) => i === index ? { ...item,
          timingSourceId: patch.timingSourceId.trim(), timingBaseDate: patch.timingBaseDate.trim(), dateSelectionReason: patch.dateSelectionReason.trim(),
        } : item) };
      }
    }
    validate(candidate);
    return candidate;
  } catch (error) {
    error.generationRaw = candidate;
    throw error;
  }
}
const correctionInstruction = `这是同一次生成的格式/规则校正，不是另拟新方案。只修复下列校验问题及相关来源关联，其余项目和临床建议保持原样；禁止为通过验证删除其他已有行动或虚构依据。
annual_checkup.focus必须逐行文本；纯字符串列表可无损转为文本。年度focus只列实际安排项目，“不重复安排/已在近期安排”的说明应放内部notes，不能伪装成年度项目。每个保留项目必须引用真实对应sourceIds；如项目来自missing:0、missing:1，不能错挂priority:0。evidenceCoverage与保留事项同步，纳入年度同样算included。
如已审依据确实不支持任何年度项目，可返回annual_checkup:{}，并在对应evidenceCoverage明确说明未纳入原因；不得用空focus的非空模块占位，更不能以忽略有依据项目换取通过。日期、科室、来源及统筹规则仍必须满足。返回annual_checkup与完整evidenceCoverage。若已生成事项实际涵盖某来源，却遗漏sourceIds关联，额外返回sourceLinkCorrections数组：[{"module":"medical_treatment","index":0,"sourceIds":["真实来源id"]}]；module也可为annual_checkup（index固定为0）。只给已有事项补充真实且语义对应的来源，不得把无关来源挂到事项上；若确实没有对应事项，须如实把该来源改为deferred或not_applicable并说明原因，不能仅靠修改状态掩盖已确认的行动需求。若其他模块的timingSourceId或timingBaseDate有误，额外返回timingCorrections数组：[{"module":"checkup_completion","index":0,"timingSourceId":"report_history中真实项目id","timingBaseDate":"该项目真实date","dateSelectionReason":"选用此日期的依据"}]。index为原数组从0开始的位置。仅校正已有事项的时间来源元数据，禁止编造来源、清空日期绕过校验或改变行动内容及执行时间；不需要时返回空数组。系统保留其他字段并重新进行全部校验。`;
module.exports = { normalizeAnnualOutput, missingIncludedSourceIds, sourceLinkRepairPrompt, validateOrRepairAnnual, correctionInstruction };
