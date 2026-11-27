const actions = {
  deposit: { from: ['none', 'released'], to: 'stored' },
  lend: { from: ['stored'], to: 'lent' },
  return: { from: ['lent'], to: 'stored' },
  release: { from: ['stored', 'lent'], to: 'released' },
};
function prepare(body, previous, staff, now = new Date()) {
  const rule = Object.hasOwn(actions, body.action) && actions[body.action];
  if (!rule || !rule.from.includes(previous?.state || 'none')) throw Error('当前状态不能办理此项交接');
  function value(key, required = true) {
    const result = typeof body[key] === 'string' ? body[key].trim() : '';
    if ((required && !result) || result.length > 160) throw Error('请核对交接字段，每项最多160字');
    return result;
  }
  const at = new Date(value('at'));
  if (!Number.isFinite(+at) || at > now || at < previous?.current.at) throw Error('交接时间不能早于上一笔记录或晚于现在');
  const event = { action: body.action, at, recordedAt: now, actorId: staff._id,
    actor: staff.name || staff.username, person: value('person') };
  if (body.action !== 'release') event.location = value('location');
  if (body.action === 'return' || body.action === 'release') event.purpose = value('purpose', false);
  if (body.action === 'lend') {
    event.purpose = value('purpose');
    event.dueAt = new Date(value('dueAt'));
    if (!Number.isFinite(+event.dueAt) || event.dueAt <= at) throw Error('预计归还时间须晚于借出时间');
  }
  return { state: rule.to, event };
}
module.exports = { prepare };
