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
    validate(candidate);
    return candidate;
  } catch (error) {
    error.generationRaw = candidate;
    throw error;
  }
}
const correctionInstruction = `这是同一次生成的格式/规则校正，不是另拟新方案。只修复下列校验问题及相关来源关联，其余项目和临床建议保持原样；禁止为通过验证删除其他已有行动或虚构依据。
annual_checkup.focus必须逐行文本；纯字符串列表可无损转为文本。年度focus只列实际安排项目，“不重复安排/已在近期安排”的说明应放内部notes，不能伪装成年度项目。每个保留项目必须引用真实对应sourceIds；如项目来自missing:0、missing:1，不能错挂priority:0。evidenceCoverage与保留事项同步，纳入年度同样算included。
如已审依据确实不支持任何年度项目，可返回annual_checkup:{}，并在对应evidenceCoverage明确说明未纳入原因；不得用空focus的非空模块占位，更不能以忽略有依据项目换取通过。日期、科室、来源及统筹规则仍必须满足。只返回包含annual_checkup与完整evidenceCoverage两个键的JSON；其他模块由系统原样保留，不可修改。`;
module.exports = { normalizeAnnualOutput, validateOrRepairAnnual, correctionInstruction };
