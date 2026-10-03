function normalizeTargets(value) {
  if (!Array.isArray(value)) throw new Error('管理目标必须逐条填写');
  if (value.length > 12) throw new Error('管理目标最多 12 条');
  return value.map((row, index) => {
    const goal = String(row?.goal || '').trim();
    const focus = String(row?.focus || '').trim();
    if (!goal || !focus || goal.length > 240 || focus.length > 500) throw new Error(`第 ${index + 1} 条需填写管理目标和干预重点`);
    return { goal, focus, nutritionRelevant: row?.nutritionRelevant === true };
  });
}

function conclusionFromTargets(targets) {
  if (!targets.length) return '';
  const lines = targets.map(row => `目标：${row.goal}；干预重点：${row.focus}${row.nutritionRelevant ? '；营养相关：交营养师评估' : ''}`);
  const groups = [];
  for (let index = 0; index < lines.length; index += 2) groups.push(lines.slice(index, index + 2).join('；'));
  return `核心结论\n健康顾问已确认以下管理目标与干预重点。\n下一步行动\n${groups.join('\n')}`;
}

function fromConfirmedReviews(reviews) {
  return (reviews || []).flatMap(review => (review.conclusion?.managementTargets || []).map((row, index) => ({
    ...row,
    issueId: row.issueId || `review:${review._id}:target:${index}`,
    sourceReviewId: String(review._id), sourceTitle: review.title,
    sourceConfirmedAt: review.conclusion.confirmedAt,
    sourceIndex: index, sourceGoal: row.goal, sourceFocus: row.focus,
  })));
}

function proposeTargetsFromActions(actions) {
  return (actions || []).flatMap(line => {
    const goal = String(line).match(/(?:管理目标|目标)[：:]\s*(.*?)(?:[；;]\s*干预重点[：:]|$)/)?.[1]?.trim();
    const focus = String(line).match(/干预重点[：:]\s*(.*?)(?:[；;]\s*(?:时间(?:\/频次)?|频次|责任角色)[：:]|$)/)?.[1]?.trim();
    return goal && focus ? [{ goal: goal.slice(0, 240), focus: focus.slice(0, 500), nutritionRelevant: false }] : [];
  }).slice(0, 12);
}

module.exports = { normalizeTargets, conclusionFromTargets, fromConfirmedReviews, proposeTargetsFromActions };
