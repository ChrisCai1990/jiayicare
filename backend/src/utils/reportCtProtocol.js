function filterUnsupportedCtProtocol(item, matches) {
  const original = [item?.name, item?.sourceSection, item?.orderName].join(' ');
  if (item?.itemType !== 'imaging' || !/胸部.*CT|CT.*胸部/i.test(original)
    || /低剂量|LDCT/i.test(original)) return matches;
  // An ordinary chest CT does not establish that a low-dose CT protocol was used.
  return matches.filter(match => !/低剂量|LDCT/i.test(String(match.node?.id || '')));
}

module.exports = { filterUnsupportedCtProtocol };
