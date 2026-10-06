const ALIASES = {
  血糖: /血糖|糖化血红蛋白|hba1c|糖尿病/i,
  血压: /血压|高血压|收缩压|舒张压/i,
  血脂: /血脂|胆固醇|甘油三酯|低密度脂蛋白|ldl/i,
  尿酸: /尿酸|高尿酸|痛风/i,
  肾功能: /肾功能|肌酐|尿素|egfr|胱抑素/i,
  骨质疏松: /骨密度|骨质疏松|骨量减少/i,
};

function normalized(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function priorityLinksToCard(priority, sectionKey, itemName) {
  if (priority?.sourceSectionKey) {
    return priority.sourceSectionKey === sectionKey
      && normalized(priority.sourceItemName) === normalized(itemName);
  }
  const title = String(priority?.name || '');
  const pattern = sectionKey === 'chronic_disease' && ALIASES[itemName];
  if (pattern) return pattern.test(title);
  const cardName = normalized(itemName);
  return cardName.length >= 2 && normalized(title).includes(cardName);
}

function linkedPriorityIndexes(sectionKey, cards, priorities) {
  return priorities.flatMap((priority, index) =>
    cards.some(card => priorityLinksToCard(priority, sectionKey, card.name)) ? [index] : []);
}

module.exports = { priorityLinksToCard, linkedPriorityIndexes };
