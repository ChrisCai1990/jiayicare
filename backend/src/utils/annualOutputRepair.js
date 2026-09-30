// Representation compatibility only: never stringify objects or discard clinical list entries.
function normalizeAnnualOutput(raw) {
  const focus = raw?.annual_checkup?.focus;
  if (!Array.isArray(focus) || !focus.every(line => typeof line === 'string')) return raw;
  return { ...raw, annual_checkup: { ...raw.annual_checkup, focus: focus.map(line => line.trim()).filter(Boolean).join('\n') } };
}

// A single bounded correction replaces the former focus-only call. Both attempts go
// through the identical source/template/clinical checks; invalid output is never cached ready.
async function validateOrRepairAnnual(raw, validate, complete) {
  let candidate = normalizeAnnualOutput(raw);
  let initialError;
  try { validate(candidate); return candidate; } catch (error) { initialError = error; }
  try {
    const reply = await complete(candidate, initialError.message);
    let parsed;
    try { parsed = JSON.parse(reply.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw Object.assign(new Error('AI校正返回格式不完整，未替换原方案'), { statusCode: 502 }); }
    if (!Object.hasOwn(parsed || {}, 'annual_checkup') || !Array.isArray(parsed.evidenceCoverage)) {
      throw Object.assign(new Error('AI年度体检校正缺少模块或来源核对，未替换原方案'), { statusCode: 502 });
    }
    // Only these two fields are patchable. Ignore attempted changes to other modules.
    candidate = normalizeAnnualOutput({ ...candidate, annual_checkup: parsed.annual_checkup, evidenceCoverage: parsed.evidenceCoverage });
    // The annual/coverage correction may already resolve all failures. Extra patches
    // are not authoritative and must not invalidate a fully checked candidate.
    try { validate(candidate); return candidate; } catch { /* Repair remaining failures below. */ }
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
如已审依据确实不支持任何年度项目，可返回annual_checkup:{}，并在对应evidenceCoverage明确说明未纳入原因；不得用空focus的非空模块占位，更不能以忽略有依据项目换取通过。日期、科室、来源及统筹规则仍必须满足。返回annual_checkup与完整evidenceCoverage。若其他模块的timingSourceId或timingBaseDate有误，额外返回timingCorrections数组：[{"module":"checkup_completion","index":0,"timingSourceId":"report_history中真实项目id","timingBaseDate":"该项目真实date","dateSelectionReason":"选用此日期的依据"}]。index为原数组从0开始的位置。仅校正已有事项的时间来源元数据，禁止编造来源、清空日期绕过校验或改变行动内容及执行时间；不需要时返回空数组。系统保留其他字段并重新进行全部校验。`;
module.exports = { normalizeAnnualOutput, validateOrRepairAnnual, correctionInstruction };
