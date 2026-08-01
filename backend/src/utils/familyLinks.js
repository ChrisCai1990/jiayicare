const User = require('../models/User');

const REVERSE_RELATION = {
  '配偶': '配偶',
  '丈夫': '妻子',
  '妻子': '丈夫',
  '父亲': '子女',
  '母亲': '子女',
  '父母': '子女',
  '儿子': '父母',
  '女儿': '父母',
  '子女': '父母',
  '兄弟': '兄弟姐妹',
  '姐妹': '兄弟姐妹',
  '兄弟姐妹': '兄弟姐妹',
  '祖父': '孙辈',
  '祖母': '孙辈',
  '外祖父': '外孙辈',
  '外祖母': '外孙辈',
  '孙子': '祖父母',
  '孙女': '祖父母',
  '孙辈': '祖父母',
  '家庭成员': '家庭成员',
};

function reverseFamilyRelation(relation) {
  const value = String(relation || '').trim();
  return REVERSE_RELATION[value] || (value ? '家庭成员' : '');
}

// 将已确认关系构成的连通家庭自动补齐成互相关联的家庭组。
// 只补缺失关系，不覆盖人工填写的具体称谓；无法可靠推导的成员间称谓使用“家庭成员”。
async function synchronizeFamilyGroup(seedUserIds, { maxMembers = 50 } = {}) {
  const pending = [...new Set((seedUserIds || []).map(String).filter(Boolean))];
  const visited = new Set();
  const users = new Map();

  while (pending.length) {
    const ids = pending.splice(0, Math.max(1, maxMembers - visited.size)).filter(id => !visited.has(id));
    if (!ids.length) break;
    const found = await User.find({ _id: { $in: ids } }).select('familyLinks');
    for (const user of found) {
      const id = String(user._id);
      if (visited.has(id)) continue;
      visited.add(id);
      users.set(id, user);
      for (const link of user.familyLinks || []) {
        const linkedId = String(link.linkedUser || '');
        if (linkedId && !visited.has(linkedId) && !pending.includes(linkedId)) pending.push(linkedId);
      }
    }
    if (visited.size >= maxMembers) break;
  }

  const members = [...users.values()];
  let addedLinks = 0;
  for (const user of members) {
    const selfId = String(user._id);
    const existing = new Set((user.familyLinks || []).map(link => String(link.linkedUser)));
    for (const other of members) {
      const otherId = String(other._id);
      if (otherId === selfId || existing.has(otherId)) continue;
      user.familyLinks.push({ linkedUser: other._id, relation: '家庭成员' });
      existing.add(otherId);
      addedLinks++;
    }
  }
  await Promise.all(members.filter(user => user.isModified('familyLinks')).map(user => user.save()));
  return { memberCount: members.length, addedLinks };
}

module.exports = { reverseFamilyRelation, synchronizeFamilyGroup };
