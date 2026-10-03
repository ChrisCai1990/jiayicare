const NAMES = ['睡眠质量', '消化功能', '日间精力', '情绪状态', '皮肤气色'];
const text = value => typeof value === 'string' ? value.trim() : '';

function fromArchive(user = {}) {
  const details = user.lifestyle_data || {};
  const verified = details.nutritionSubjective || {};
  const basic = user.lifestyle || {};
  return {
    睡眠质量: text(verified.睡眠质量) || text(basic.sleep) || text(details.sleepQuality) || text(details.sleep),
    消化功能: text(verified.消化功能) || text(basic.bowel) || text(details.bowelRegularity),
    日间精力: text(verified.日间精力) || text(details.daytimeEnergy),
    情绪状态: text(verified.情绪状态) || text(basic.mood) || text(details.psychStress),
    皮肤气色: text(verified.皮肤气色) || text(details.skinComplexion),
  };
}

function verifiedChanges(user = {}, targets = []) {
  const old = user.lifestyle_data?.nutritionSubjective || {};
  const changes = {};
  for (const row of targets) {
    const name = text(row?.metric);
    const value = text(row?.baseline);
    if (NAMES.includes(name) && value && value !== text(old[name])) changes[name] = { from: text(old[name]), to: value };
  }
  return changes;
}

module.exports = { NAMES, fromArchive, verifiedChanges };
