const text = value => String(value == null ? '' : value);

function serialized(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return text(value);
}

function diffReportItemCorrections(oldItems = [], nextItems = []) {
  const fields = [
    'name', 'value', 'unit', 'referenceRange', 'status', 'bodyPart',
    'findings', 'diagnosis', 'conclusion', 'screeningKey',
    'sourcePages', 'sourceEvidence',
  ];
  const oldList = Array.isArray(oldItems) ? oldItems : [];
  const nextList = Array.isArray(nextItems) ? nextItems : [];
  const itemSnapshot = item => Object.fromEntries(
    ['sourceItemId', 'itemType', ...fields].map(field => [field, item?.[field]]),
  );
  const oldBySourceId = new Map(oldList
    .map((item, index) => [text(item?.sourceItemId), { item, index }])
    .filter(([sourceItemId]) => sourceItemId));
  const matchedOldIndexes = new Set();
  const changes = [];

  nextList.forEach((item, index) => {
    const sourceItemId = text(item?.sourceItemId);
    const matched = (sourceItemId && oldBySourceId.get(sourceItemId)) || (!sourceItemId ? { item: oldList[index], index } : null);
    if (!matched?.item) {
      changes.push({
        itemIndex: index,
        itemName: text(item?.name),
        sourceItemId,
        field: '__item_added__',
        oldValue: '',
        newValue: serialized(itemSnapshot(item)),
        qualityFlags: item?.qualityFlags || [],
      });
      return;
    }
    matchedOldIndexes.add(matched.index);
    for (const field of fields) {
      const oldValue = serialized(matched.item?.[field]);
      const newValue = serialized(item?.[field]);
      if (oldValue === newValue) continue;
      changes.push({
        itemIndex: index,
        itemName: text(item?.name || matched.item?.name),
        sourceItemId,
        field,
        oldValue,
        newValue,
        qualityFlags: matched.item?.qualityFlags || [],
      });
    }
  });

  oldList.forEach((item, index) => {
    if (matchedOldIndexes.has(index)) return;
    changes.push({
      itemIndex: index,
      itemName: text(item?.name),
      sourceItemId: text(item?.sourceItemId),
      field: '__item_removed__',
      oldValue: serialized(itemSnapshot(item)),
      newValue: '',
      qualityFlags: item?.qualityFlags || [],
    });
  });
  return changes;
}

module.exports = { diffReportItemCorrections };
