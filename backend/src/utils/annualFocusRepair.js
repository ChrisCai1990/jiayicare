const hasFocus = row => typeof row?.focus === 'string' && row.focus.trim().length > 0;
async function repairAnnualFocus(raw, complete) {
  const row = raw?.annual_checkup;
  if (!row || Array.isArray(row) || typeof row !== 'object' || !Object.keys(row).length || hasFocus(row)) return raw;
  // Never invent content from template names, remove an item, or change provenance.
  if (!row.standardPlanId || !row.basisSummary || !Array.isArray(row.sourceIds) || !row.sourceIds.length) return raw;
  const text = await complete(row);
  let patch;
  try { patch = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return raw; }
  if (!hasFocus(patch)) return raw;
  return { ...raw, annual_checkup: { ...row, focus: patch.focus.trim() } };
}
module.exports = { repairAnnualFocus, hasFocus };
