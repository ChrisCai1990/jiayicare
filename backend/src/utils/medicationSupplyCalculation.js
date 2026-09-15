const numberOf = input => Number(String(input ?? '').match(/\d+(?:\.\d+)?/)?.[0] || 0);
const massInMg = input => {
  const match = String(input ?? '').match(/(\d+(?:\.\d+)?)\s*(μg|ug|mcg|mg|g)\b/i);
  if (!match) return 0;
  const amount = Number(match[1]), unit = match[2].toLowerCase();
  return unit === 'g' ? amount * 1000 : ['μg', 'ug', 'mcg'].includes(unit) ? amount / 1000 : amount;
};
function calculateMedicationSupply(data = {}) {
  const doseNumber = numberOf(data.singleDose), frequency = numberOf(data.dailyFrequency), totalNumber = numberOf(data.totalQuantity);
  if (!(doseNumber > 0 && frequency > 0 && totalNumber > 0)) return null;
  const specification = String(data.specification || ''), doseText = String(data.singleDose || ''), totalText = String(data.totalQuantity || '');
  const doseUnitPattern = '(片|粒|丸|支|袋|贴|枚|揿|毫升|ml)';
  const specUnits = specification.match(new RegExp(`(?:[*x×/]\\s*)?(\\d+(?:\\.\\d+)?)\\s*${doseUnitPattern}`, 'i'));
  const doseHasUnits = new RegExp(doseUnitPattern, 'i').test(doseText), totalHasUnits = new RegExp(doseUnitPattern, 'i').test(totalText);
  let unitsPerDose = doseNumber;
  if (!doseHasUnits && massInMg(doseText)) {
    const strength = massInMg(specification);
    if (!strength) return null;
    unitsPerDose = massInMg(doseText) / strength;
  }
  let totalUnits = totalNumber;
  if (/(盒|瓶|包|板|罐)/.test(totalText)) {
    if (!specUnits) return null;
    totalUnits *= Number(specUnits[1]);
  } else if (!totalHasUnits && massInMg(totalText)) {
    const strength = massInMg(specification);
    if (!strength) return null;
    totalUnits = massInMg(totalText) / strength;
  }
  const dailyUnits = unitsPerDose * frequency;
  if (!(dailyUnits > 0 && totalUnits > 0)) return null;
  return { dailyUnits, totalUnits, supplyDays: Math.max(1, Math.ceil(totalUnits / dailyUnits)) };
}
module.exports = { calculateMedicationSupply, numberOf };
