// Group only records already returned to this viewer. All actions retain the original task ID.
function cardRows(items) {
  const rows = [], groups = new Map();
  for (const item of items) {
    const info = item.supplyDay;
    if (!info) { rows.push(item); continue; }
    if (!groups.has(info.key)) {
      const card = { _id: 'supplies:' + info.key, supplyCard: info, members: [] };
      groups.set(info.key, card); rows.push(card);
    }
    groups.get(info.key).members.push(item);
  }
  return rows;
}
function sections(card) {
  return ['药品', '营养素'].map(kind => ({ kind, items: card.supplyCard.details.filter(detail => detail.kind === kind) })).filter(section => section.items.length);
}
module.exports = { cardRows, sections };
